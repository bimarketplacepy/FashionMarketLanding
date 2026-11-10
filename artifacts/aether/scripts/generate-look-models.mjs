// Fotos de los looks de la landing sobre los avatares IA del probador.
//
// Cada look de la landing (src/landing/looks.js) se viste sobre uno de los
// avatares ficticios de mujer de shared/model-presets.mjs, con las prendas
// reales del catálogo como referencia (mismo camino que el probador: Gemini).
// La imagen es generada: la landing la rotula "Imagen generada con IA".
//
// Etapas (cada una se puede repetir; trabajan sobre data/look-models.json):
//   node scripts/generate-look-models.mjs --estado
//   node scripts/generate-look-models.mjs --generar [lookId…]   # sin ids: los que faltan
//   node scripts/generate-look-models.mjs --regenerar lookId…   # vuelve a generar aunque exista
//   python3 scripts/cutout-look-models.py [lookId…]               # recorta el fondo (rembg)
//   node scripts/generate-look-models.mjs --puntos [lookId…]    # ubica cada prenda (puntos numerados)
//   node scripts/generate-look-models.mjs --optimizar           # AVIF/WebP en public/looks
//   node scripts/generate-look-models.mjs --aprobar lookId…     # sólo los aprobados salen en la landing
//   node scripts/generate-look-models.mjs --rechazar lookId…
//
// El PNG maestro y el recorte quedan en data/look-models/ (fuera del deploy).
// Si el look cambia de prendas (cambió el catálogo), la imagen deja de usarse
// sola: buildLandingPayload compara los garmentIds.
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createAIProvider } from "./ai-provider.mjs";
import { buildLandingPayload } from "./landing-payload.mjs";
import { MODEL_PRESETS } from "../shared/model-presets.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const MANIFEST = path.join(DATA, "look-models.json");
const WORK_DIR = path.join(DATA, "look-models");
const OUT_DIR = path.join(ROOT, "public/looks");
const PUBLIC_BASE = "/looks";
const WIDTHS = [400, 800, 1200];
const FORMATS = ["avif", "webp"];

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const ids = args.filter((arg) => !arg.startsWith("--"));

function loadEnvFile() {
  const env = {};
  try {
    for (const line of readFileSync(path.join(ROOT, ".env"), "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sin .env */ }
  return env;
}
const fileEnv = loadEnvFile();
const setting = (name, fallback = "") => process.env[name] || fileEnv[name] || fallback;

export async function readManifest() {
  try { return JSON.parse(await readFile(MANIFEST, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return { version: 1, looks: {} }; throw error; }
}

async function writeManifest(manifest) {
  const tmp = `${MANIFEST}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(tmp, MANIFEST);
}

async function currentLooks() {
  const library = JSON.parse(await readFile(path.join(DATA, "library.json"), "utf8"));
  const byId = new Map(library.map((item) => [item.id, item]));
  const payload = buildLandingPayload(library, { withModels: false });
  return Object.values(payload.looks).flat().map((look) => ({ ...look, garments: look.pieces.map((piece) => byId.get(piece.id)) }));
}

// Las ocho variantes de avatar de mujer (4 presets × 2 estilos), en rotación:
// looks vecinos en la fila llevan modelos distintos.
const IDENTITIES = MODEL_PRESETS.filter((preset) => preset.gender === "mujer")
  .flatMap((preset) => preset.styles.map((style) => ({ preset, style })));
const ORDER = [0, 3, 4, 7, 2, 5, 6, 1];
const identityFor = (index) => IDENTITIES[ORDER[index % ORDER.length] % IDENTITIES.length];

async function garmentSource(garment) {
  const filename = path.basename(new URL(garment.image, "http://localhost").pathname);
  return readFile(path.join(DATA, "imported", filename));
}

const PART_LABEL = {
  upperbody: "top / upper-body garment", wholebody: "one-piece garment", wholebody_up: "outer layer",
  lowerbody: "bottom garment", shoes: "footwear", accessories_up: "accessory",
};

function lookPrompt(garments, identity) {
  const list = garments.map((item, index) => `Image ${index + 2}: exact ${PART_LABEL[item.part] || item.part} — ${item.name}.`).join("\n");
  const isDress = garments.some((item) => item.garmentType === "dress" || item.part === "wholebody");
  return `Use case: preset-identity-preserve
Asset type: vertical full-body e-commerce lookbook photograph
Image 1: identity reference for the exact fictional model to preserve.
${list}

Primary request: Create a vertical full-body studio lookbook photograph of the fictional model from Image 1 wearing every exact referenced item, and only those items${isDress ? " (the dress is the main garment)" : ""}.

Subject: Preserve the same fictional model's recognizable face, hair (${identity.style.hairColorLabel}, ${identity.style.hairLengthLabel.toLowerCase()}), age, skin tone, build and skin texture from Image 1.

Framing: The ENTIRE person is visible from the top of the head (or hat) to the soles of the shoes, centered, occupying about 88% of the image height, with a small empty margin above the head and below the feet. Camera at waist height, straight on, no tilt.

Pose: Natural relaxed standing pose, weight on one leg, body facing the camera or a slight three-quarter turn, arms relaxed and slightly away from the body so no garment is hidden, calm friendly expression.

Background: Seamless plain light warm-grey studio backdrop, uniform color, soft even lighting, only a soft contact shadow under the feet. No floor line, no props, no furniture, no plants, no text.

Garment fidelity: Preserve every referenced item precisely: color, material, fit, silhouette, length, construction, pattern, print scale, graphics and distinctive details. Keep the exact rise, cut and coverage of bottoms and swimwear as in the reference (a low-rise or cheeky bikini bottom stays low-rise; never turn it into a high-waisted one). Small accessories (earrings, bracelets, scarves, hats, belts) must be visibly worn in a natural way.

Avoid: extra garments, jackets or bags that were not referenced, garment redesign, changed colors, cropped head or feet, hands covering clothing, extra people, text, logos, watermark, mannequin look, or synthetic AI polish.`;
}

async function generate(look, index, ai, manifest) {
  const identity = identityFor(index);
  const images = [{ data: await readFile(path.join(ROOT, "public", identity.style.image)), name: "model.webp" }];
  for (const garment of look.garments) images.push({ data: await garmentSource(garment), name: `${garment.part}.png` });
  const bytes = await ai.generateImage({ purpose: "outfit", aspectRatio: "2:3", prompt: lookPrompt(look.garments, identity), images });
  await mkdir(WORK_DIR, { recursive: true });
  await writeFile(path.join(WORK_DIR, `${look.id}.png`), bytes);
  await rm(path.join(WORK_DIR, `${look.id}-recorte.png`), { force: true });
  manifest.looks[look.id] = {
    garmentIds: look.garments.map((item) => item.id),
    family: look.family,
    preset: identity.preset.id,
    style: identity.style.id,
    model: identity.preset.label,
    status: "pendiente",
    generatedAt: new Date().toISOString(),
  };
}

async function runGenerate(force) {
  const ai = createAIProvider(setting);
  if (!ai.hasApiKey) throw new Error("Falta GEMINI_API_KEY.");
  const looks = await currentLooks();
  const manifest = await readManifest();
  const targets = looks
    .map((look, index) => ({ look, index }))
    .filter(({ look }) => (ids.length ? ids.includes(look.id) : true))
    .filter(({ look }) => force || !existsSync(path.join(WORK_DIR, `${look.id}.png`)) || !sameIds(manifest.looks[look.id]?.garmentIds, look.garments.map((g) => g.id)));
  console.log(`A generar: ${targets.length} de ${looks.length} looks.`);
  const queue = [...targets];
  const failures = [];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const { look, index } = queue.shift();
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await generate(look, index, ai, manifest);
          await writeManifest(manifest);
          console.log(`✓ ${look.id} (${manifest.looks[look.id].model})`);
          break;
        } catch (error) {
          console.warn(`✗ ${look.id} intento ${attempt}: ${error.message}`);
          if (attempt === 2) failures.push(look.id);
        }
      }
    }
  }));
  if (failures.length) { console.error(`Fallaron: ${failures.join(", ")}`); process.exitCode = 1; }
}

const sameIds = (a = [], b = []) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

// Puntos numerados: dónde está cada prenda sobre el cuerpo (0–1 sobre la imagen).
async function runHotspots() {
  const ai = createAIProvider(setting);
  const looks = await currentLooks();
  const manifest = await readManifest();
  const schema = {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer" },
            visible: { type: "boolean" },
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["index", "visible", "x", "y"],
        },
      },
    },
    required: ["items"],
  };
  for (const look of looks) {
    const entry = manifest.looks[look.id];
    if (!entry || (ids.length && !ids.includes(look.id))) continue;
    const file = path.join(WORK_DIR, `${look.id}.png`);
    if (!existsSync(file)) continue;
    const image = await readFile(file);
    const list = look.garments.map((item, index) => `${index + 1}. ${item.name} (${PART_LABEL[item.part] || item.part})`).join("\n");
    const prompt = `This full-body fashion photo shows one model wearing these items:\n${list}\n\nFor each item return a point ON the item where a small numbered marker should be placed: the visual center of the item as worn (for pairs like shoes, earrings or bracelets, the most visible one; for a hat, its crown). Coordinates x and y are normalized from 0 to 1000 relative to the image width and height (0,0 = top-left). Points of different items must not overlap. visible=false only if the item does not appear at all.`;
    const result = await ai.inspect({ image, prompt, schema });
    entry.hotspots = look.garments.map((item, index) => {
      const found = result.items.find((point) => point.index === index + 1);
      if (!found || !found.visible) return { garmentId: item.id, visible: false };
      return { garmentId: item.id, visible: true, x: Math.round(found.x) / 1000, y: Math.round(found.y) / 1000 };
    });
    await writeManifest(manifest);
    console.log(`• ${look.id}: ${entry.hotspots.map((h) => (h.visible ? `(${h.x},${h.y})` : "—")).join(" ")}`);
  }
}

// Variantes web del recorte (o del maestro si no hay recorte).
async function runOptimize() {
  const manifest = await readManifest();
  await mkdir(OUT_DIR, { recursive: true });
  const keep = new Set();
  for (const [id, entry] of Object.entries(manifest.looks)) {
    const cutout = path.join(WORK_DIR, `${id}-recorte.png`);
    const source = existsSync(cutout) ? cutout : path.join(WORK_DIR, `${id}.png`);
    if (!existsSync(source)) continue;
    const buffer = await readFile(source);
    const hash = createHash("sha1").update(buffer).digest("hex").slice(0, 10);
    const meta = await sharp(buffer).metadata();
    const widths = [...new Set(WIDTHS.map((width) => Math.min(width, meta.width)))];
    for (const width of widths) {
      for (const format of FORMATS) {
        const name = `${id}.${hash}-${width}.${format}`;
        keep.add(name);
        const target = path.join(OUT_DIR, name);
        if (existsSync(target)) continue;
        const pipeline = sharp(buffer).resize({ width, withoutEnlargement: true });
        await (format === "avif" ? pipeline.avif({ quality: 60, effort: 5 }) : pipeline.webp({ quality: 80, alphaQuality: 90 })).toFile(target);
      }
    }
    entry.imageSet = { src: `${PUBLIC_BASE}/${id}`, hash, width: meta.width, height: meta.height, widths, formats: FORMATS, cutout: existsSync(cutout) };
  }
  for (const name of await readdir(OUT_DIR)) if (!keep.has(name)) await rm(path.join(OUT_DIR, name));
  await writeManifest(manifest);
  console.log(`Variantes al día: ${keep.size} archivos en public/looks.`);
}

async function runStatus(status) {
  const manifest = await readManifest();
  for (const id of ids) {
    if (!manifest.looks[id]) { console.warn(`No existe ${id}`); continue; }
    manifest.looks[id].status = status;
  }
  await writeManifest(manifest);
  console.log(`${ids.length} look(s) → ${status}`);
}

async function runReport() {
  const looks = await currentLooks();
  const manifest = await readManifest();
  for (const look of looks) {
    const entry = manifest.looks[look.id];
    const stale = entry && !sameIds(entry.garmentIds, look.garments.map((g) => g.id));
    console.log(`${(entry?.status || "sin imagen").padEnd(10)} ${stale ? "DESACTUALIZADO " : ""}${entry?.imageSet ? "web " : "    "}${entry?.hotspots ? "puntos " : "       "}${look.id}  [${entry?.model || ""}]`);
  }
}

if (flag("--generar")) await runGenerate(false);
else if (flag("--regenerar")) await runGenerate(true);
else if (flag("--puntos")) await runHotspots();
else if (flag("--optimizar")) await runOptimize();
else if (flag("--aprobar")) await runStatus("aprobado");
else if (flag("--rechazar")) await runStatus("rechazado");
else await runReport();
