// Regenera las imágenes de prendas con la API de imagen (reconstrucción de
// producto sobre chroma key + limpieza, igual que el flujo original de import).
//
//   pnpm --filter @workspace/aether run regenerate-garments             # todo el catálogo
//   pnpm --filter @workspace/aether run regenerate-garments -- <id>...  # solo esos items
//   pnpm --filter @workspace/aether run regenerate-garments -- --pausa 8000
//   pnpm --filter @workspace/aether run regenerate-garments -- --importadas   # solo lo importado por lotes
//
// Fuente: data/imported-originals/<id>-garment.png (el recorte original de la foto);
// si no hay backup usa la imagen actual. Salida: data/imported/<id>-garment.png.
// Registra el avance en data/garment-regen.json: re-ejecutable, solo procesa lo
// pendiente. Ante 429 (cuota) espera y reintenta; corta tras varios seguidos.
import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises";
import path from "node:path";
import { createAIProvider } from "./ai-provider.mjs";
import { buildGarmentPrompt, removeChromaBackground } from "./import-job-api.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const IMPORTED = path.join(DATA, "imported");
const ORIGINALS = path.join(DATA, "imported-originals");
const MANIFEST = path.join(DATA, "garment-regen.json");

const ARGS = process.argv.slice(2);
const PAUSE_INDEX = ARGS.indexOf("--pausa");
const PAUSE_MS = PAUSE_INDEX >= 0 ? Number(ARGS[PAUSE_INDEX + 1]) || 0 : 7000;
const ONLY = new Set(ARGS.filter((value) => !value.startsWith("--") && value !== String(PAUSE_MS)));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function chooseChromaKey(primary = "#808080") {
  const value = /^#[0-9a-f]{6}$/i.test(primary) ? primary : "#808080";
  const source = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const candidates = [[0, 255, 0], [255, 0, 255], [0, 255, 255]];
  const selected = candidates.sort((a, b) => {
    const distance = (color) => color.reduce((total, channel, index) => total + ((channel - source[index]) ** 2), 0);
    return distance(b) - distance(a);
  })[0];
  return `#${selected.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

const setting = (name, fallback = "") => process.env[name] || fallback;
const envFile = await readFile(path.join(ROOT, ".env"), "utf8").catch(() => "");
for (const line of envFile.split("\n")) {
  const index = line.indexOf("=");
  if (index > 0 && !line.trim().startsWith("#")) {
    const name = line.slice(0, index).trim();
    if (!process.env[name]) process.env[name] = line.slice(index + 1).trim();
  }
}
const ai = createAIProvider(setting);
if (!ai.hasApiKey) { console.error("Falta GEMINI_API_KEY/OPENAI_API_KEY en .env"); process.exit(1); }

const library = JSON.parse(await readFile(path.join(DATA, "library.json"), "utf8"));
const manifest = JSON.parse(await readFile(MANIFEST, "utf8").catch(() => '{"entries":{}}'));
await mkdir(ORIGINALS, { recursive: true });

// --importadas: solo prendas que entraron por lotes (fotos crudas), sin tocar el catálogo previo.
const ONLY_BATCHES = ARGS.includes("--importadas");
const pending = library.filter((item) => (!ONLY.size || ONLY.has(item.id))
  && (!ONLY_BATCHES || item.importBatch)
  && manifest.entries[item.id]?.status !== "done");
console.log(`${pending.length} prendas por regenerar con la API (${ai.name}).`);

let quotaStrikes = 0;
let done = 0;
for (const item of pending) {
  const filename = `${item.id}-garment.png`;
  const sourcePath = (await exists(path.join(ORIGINALS, filename))) ? path.join(ORIGINALS, filename) : path.join(IMPORTED, filename);
  if (!await exists(sourcePath)) { console.log(`  · ${item.name}: sin imagen fuente, salteada`); continue; }
  if (!await exists(path.join(ORIGINALS, filename))) await copyFile(path.join(IMPORTED, filename), path.join(ORIGINALS, filename));
  process.stdout.write(`  · ${item.name} … `);
  try {
    const chromaKey = chooseChromaKey(item.color);
    const bytes = await ai.generateImage({
      purpose: "garment",
      aspectRatio: "1:1",
      images: [{ data: await readFile(sourcePath), mime: "image/png", name: filename }],
      prompt: buildGarmentPrompt(item, chromaKey),
    });
    const cleaned = await removeChromaBackground(bytes, chromaKey, { strict: false });
    await writeFile(path.join(IMPORTED, filename), cleaned);
    manifest.entries[item.id] = { status: "done", at: new Date().toISOString() };
    quotaStrikes = 0;
    done += 1;
    console.log("✓");
  } catch (error) {
    const isQuota = /quota|429|resource.*exhausted/i.test(error.message);
    manifest.entries[item.id] = { status: "failed", error: error.message.slice(0, 200), at: new Date().toISOString() };
    console.log(`✗ ${error.message.slice(0, 120)}`);
    if (isQuota) {
      quotaStrikes += 1;
      if (quotaStrikes >= 3) {
        console.log("\nCuota agotada: corté acá. Re-ejecutá el comando cuando haya cuota (los ítems fallidos se reintentan).");
        break;
      }
      await sleep(30000);
    }
  }
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  if (PAUSE_MS) await sleep(PAUSE_MS);
}
await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${done} regeneradas en esta corrida. Pendientes: ${library.length - Object.values(manifest.entries).filter((entry) => entry.status === "done").length}.`);
