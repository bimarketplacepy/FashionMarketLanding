// Importación del catálogo analizada con Claude Code (sin API de Gemini/OpenAI).
//
// El pipeline replica el flujo de import-job-api.mjs pero la etapa de visión
// (detección de prendas + metadata + bounding box) la hace Claude dentro de la
// sesión de Claude Code, escribiendo un JSON por foto con el MISMO esquema que
// devuelve la API de Gemini (DETECTION_PROMPT de ai-provider.mjs).
//
// Uso:
//   node scripts/claude-import.mjs pull            # baja fotos pendientes de App Storage a data/claude-inbox/images
//   node scripts/claude-import.mjs pull -- --prefix "FOTOS SELECCIONADAS FW2026/"
//   (Claude analiza cada imagen y escribe data/claude-inbox/analysis/<key>.json)
//   node scripts/claude-import.mjs apply           # recorta, agrega a library.json y marca el manifest
//   node scripts/claude-import.mjs status          # resumen de pendientes
//
// Esquema de cada data/claude-inbox/analysis/<key>.json:
//   { "items": [ { name, part, color, secondaryColor, tags, season, material,
//                  silhouette, weight, climates, occasions,
//                  boundingBox: { x, y, width, height }  // enteros normalizados a 1000x1000
//   } ] }
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const INBOX = path.join(DATA, "claude-inbox");
const IMAGES_DIR = path.join(INBOX, "images");
const ANALYSIS_DIR = path.join(INBOX, "analysis");
const PENDING_FILE = path.join(INBOX, "pending.json");
const MANIFEST = path.join(DATA, "catalog-manifest.json");
const LIBRARY = path.join(DATA, "library.json");
const IMPORTED_DIR = path.join(DATA, "imported");
const LIBRARY_ASSET_ROOT = "/api/import/library";
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

const ARGS = process.argv.slice(2);
const COMMAND = ARGS[0] || "status";
const PREFIX_INDEX = ARGS.indexOf("--prefix");
const STORAGE_PREFIX = PREFIX_INDEX >= 0 ? ARGS[PREFIX_INDEX + 1] : "FOTOS SELECCIONADAS FW2026/";

// --- misma normalización de metadata que import-job-api.mjs ---
const PARTS = new Set(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SEASONS = new Set(["all", "spring", "summer", "autumn", "winter"]);
const MATERIALS = new Set(["cotton", "linen", "denim", "knit", "wool", "leather", "silk", "synthetic", "mixed"]);
const SILHOUETTES = new Set(["fitted", "regular", "relaxed", "oversized", "flowy", "structured"]);
const WEIGHTS = new Set(["light", "medium", "heavy"]);
const CLIMATES = new Set(["warm", "mild", "cold", "rain"]);

function normalizeMetadata(value = {}) {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const color = typeof metadata.color === "string" && HEX_COLOR.test(metadata.color) ? metadata.color.toLowerCase() : "#d8d0c2";
  const secondaryColor = typeof metadata.secondaryColor === "string" && HEX_COLOR.test(metadata.secondaryColor) ? metadata.secondaryColor.toLowerCase() : null;
  return {
    name: typeof metadata.name === "string" ? metadata.name.trim().slice(0, 120) || "New piece" : "New piece",
    part: PARTS.has(metadata.part) ? metadata.part : "upperbody",
    color,
    secondaryColor,
    tags: Array.isArray(metadata.tags) ? metadata.tags.filter((tag) => typeof tag === "string").map((tag) => tag.trim().toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 12) : [],
    season: SEASONS.has(metadata.season) ? metadata.season : "all",
    material: MATERIALS.has(metadata.material) ? metadata.material : "mixed",
    silhouette: SILHOUETTES.has(metadata.silhouette) ? metadata.silhouette : "regular",
    weight: WEIGHTS.has(metadata.weight) ? metadata.weight : "medium",
    climates: Array.isArray(metadata.climates) ? metadata.climates.filter((entry) => CLIMATES.has(entry)).slice(0, 4) : ["mild"],
    occasions: Array.isArray(metadata.occasions) ? metadata.occasions.filter((entry) => typeof entry === "string").map((entry) => entry.trim().toLowerCase().slice(0, 30)).filter(Boolean).slice(0, 8) : ["casual"],
    boundingBox: normalizeBoundingBox(metadata.boundingBox),
  };
}

function normalizeBoundingBox(value = {}) {
  const box = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const number = (key, fallback) => Number.isFinite(Number(box[key])) ? Math.round(Number(box[key])) : fallback;
  const x = Math.max(0, Math.min(999, number("x", 0)));
  const y = Math.max(0, Math.min(999, number("y", 0)));
  const width = Math.max(1, Math.min(1000 - x, number("width", 1000 - x)));
  const height = Math.max(1, Math.min(1000 - y, number("height", 1000 - y)));
  return { x, y, width, height };
}

// --- mismo recorte que import-job-api.mjs (cropDetectedItem) ---
async function cropDetectedItem(bytes, boundingBox) {
  const normalized = await sharp(bytes).rotate().toColorspace("srgb").png().toBuffer();
  const { width, height } = await sharp(normalized).metadata();
  const box = normalizeBoundingBox(boundingBox);
  const rawLeft = (box.x / 1000) * width;
  const rawTop = (box.y / 1000) * height;
  const rawWidth = (box.width / 1000) * width;
  const rawHeight = (box.height / 1000) * height;
  const padding = Math.max(12, Math.round(Math.max(rawWidth, rawHeight) * 0.08));
  const left = Math.max(0, Math.floor(rawLeft - padding));
  const top = Math.max(0, Math.floor(rawTop - padding));
  const right = Math.min(width, Math.ceil(rawLeft + rawWidth + padding));
  const bottom = Math.min(height, Math.ceil(rawTop + rawHeight + padding));
  return sharp(normalized).extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }).png().toBuffer();
}

function brandOf(name) {
  const parts = name.split("/");
  if (parts.length < 2) return null;
  const folder = parts[parts.length - 2];
  const clean = folder.split(/\s*[-(]/)[0].trim().toLowerCase();
  return clean || null;
}

function articleOf(name) {
  const file = name.split("/").pop();
  return file.includes("_") ? `${name.split("/").slice(0, -1).join("/")}/${file.split("_")[0]}` : name;
}

function keyOf(name) {
  return name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function loadJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function atomicJson(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await rename(tmp, file);
  } catch (error) {
    if (!["EBUSY", "EXDEV", "EPERM"].includes(error.code)) {
      await rm(tmp, { force: true });
      throw error;
    }
    await copyFile(tmp, file);
    await rm(tmp, { force: true });
  }
}

async function listPendingInStorage() {
  const { Client } = await import("@replit/object-storage");
  const client = new Client();
  const { ok, value, error } = await client.list();
  if (!ok) throw new Error(`No pude listar App Storage: ${JSON.stringify(error).slice(0, 200)}`);
  const manifest = await loadJson(MANIFEST, { entries: {} });
  const doneArticles = new Set(
    Object.entries(manifest.entries)
      .filter(([, entry]) => entry.status === "done")
      .map(([name]) => articleOf(name)),
  );
  const names = value
    .map((object) => object.name)
    .filter((name) => name.startsWith(STORAGE_PREFIX) && IMAGE_EXT.test(name) && !name.includes("model-reference"))
    .sort();
  const byArticle = new Map();
  for (const name of names) {
    const article = articleOf(name);
    if (!byArticle.has(article)) byArticle.set(article, name);
  }
  return { client, pending: [...byArticle.entries()].filter(([article]) => !doneArticles.has(article)).map(([, name]) => name) };
}

async function pull() {
  const { client, pending } = await listPendingInStorage();
  await mkdir(IMAGES_DIR, { recursive: true });
  await mkdir(ANALYSIS_DIR, { recursive: true });
  const index = await loadJson(PENDING_FILE, { entries: {} });
  let downloaded = 0;
  for (const name of pending) {
    const key = keyOf(name);
    const file = path.join(IMAGES_DIR, `${key}.png`);
    if (!index.entries[key]) {
      const result = await client.downloadAsBytes(name);
      if (!result.ok) { console.log(`  ✗ ${name}`); continue; }
      // normalizado a PNG sRGB como hace el flujo original antes de analizar
      await writeFile(file, await sharp(result.value[0]).rotate().toColorspace("srgb").png().toBuffer());
      index.entries[key] = { source: name, brand: brandOf(name), image: path.relative(ROOT, file), status: "awaiting-analysis" };
      downloaded += 1;
      console.log(`  ↓ ${name}`);
    }
  }
  await atomicJson(PENDING_FILE, index);
  console.log(`\n${downloaded} fotos nuevas en ${path.relative(ROOT, IMAGES_DIR)} (${Object.keys(index.entries).length} en total).`);
  console.log(`Ahora Claude analiza cada imagen y escribe ${path.relative(ROOT, ANALYSIS_DIR)}/<key>.json; después: node scripts/claude-import.mjs apply`);
}

async function apply() {
  const index = await loadJson(PENDING_FILE, { entries: {} });
  const manifest = await loadJson(MANIFEST, { entries: {} });
  const library = await loadJson(LIBRARY, []);
  await mkdir(IMPORTED_DIR, { recursive: true });
  let applied = 0;
  let itemsAdded = 0;
  for (const [key, entry] of Object.entries(index.entries)) {
    if (entry.status === "done") continue;
    const analysisFile = path.join(ANALYSIS_DIR, `${key}.json`);
    const analysis = await loadJson(analysisFile, null);
    if (!analysis) continue;
    const items = Array.isArray(analysis.items) ? analysis.items : [];
    const bytes = await readFile(path.join(ROOT, entry.image));
    const ids = [];
    for (const raw of items) {
      const metadata = normalizeMetadata(raw);
      if (entry.brand) metadata.tags = [...new Set([entry.brand, ...metadata.tags])].slice(0, 4);
      const id = `import-${randomUUID()}`;
      const garmentName = `${id}-garment.png`;
      await writeFile(path.join(IMPORTED_DIR, garmentName), await cropDetectedItem(bytes, metadata.boundingBox));
      library.push({
        id,
        name: metadata.name,
        part: metadata.part,
        color: metadata.color,
        secondaryColor: metadata.secondaryColor,
        palette: [metadata.color, metadata.secondaryColor].filter(Boolean),
        tags: metadata.tags,
        season: metadata.season,
        material: metadata.material,
        silhouette: metadata.silhouette,
        weight: metadata.weight,
        climates: metadata.climates,
        occasions: metadata.occasions,
        image: `${LIBRARY_ASSET_ROOT}/${garmentName}`,
        thumbnail: `${LIBRARY_ASSET_ROOT}/${garmentName}`,
        modeledImage: null,
        importJobId: id.replace(/^import-/, ""),
      });
      ids.push(id);
      itemsAdded += 1;
    }
    manifest.entries[entry.source] = { status: "done", items: ids.length, via: "claude-code", at: new Date().toISOString() };
    entry.status = "done";
    entry.libraryIds = ids;
    applied += 1;
    console.log(`  ✓ ${entry.source} → ${ids.length} prenda${ids.length === 1 ? "" : "s"}`);
  }
  await atomicJson(LIBRARY, library);
  await atomicJson(MANIFEST, manifest);
  await atomicJson(PENDING_FILE, index);
  console.log(`\n${applied} fotos aplicadas, ${itemsAdded} prendas nuevas en el catálogo (data/library.json).`);
}

async function status() {
  const index = await loadJson(PENDING_FILE, { entries: {} });
  const entries = Object.entries(index.entries);
  const analyzed = [];
  for (const [key, entry] of entries) {
    if (entry.status === "done") continue;
    const hasAnalysis = await loadJson(path.join(ANALYSIS_DIR, `${key}.json`), null);
    if (hasAnalysis) analyzed.push(key);
  }
  const done = entries.filter(([, entry]) => entry.status === "done").length;
  const waiting = entries.length - done;
  console.log(`Inbox: ${entries.length} fotos · ${done} aplicadas · ${waiting} pendientes (${analyzed.length} ya analizadas, listas para "apply").`);
  const { pending } = await listPendingInStorage().catch(() => ({ pending: null }));
  if (pending) console.log(`App Storage (${STORAGE_PREFIX}): ${pending.length} artículos sin importar (corré "pull" para bajarlos).`);
}

if (COMMAND === "pull") await pull();
else if (COMMAND === "apply") await apply();
else await status();
