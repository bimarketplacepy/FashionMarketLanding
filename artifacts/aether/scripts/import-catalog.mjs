// Importación masiva del catálogo del retailer.
//
// Fuente de imágenes: App Storage, carpeta "catalogo/" (subcarpetas permitidas),
// o una carpeta local con --dir <ruta>.
//
// Uso (con la app corriendo con Run):
//   pnpm --filter @workspace/aether run import-catalog             # importa lo nuevo de App Storage
//   pnpm --filter @workspace/aether run import-catalog -- --modeled  # además genera foto modelada (más costo de API)
//   pnpm --filter @workspace/aether run import-catalog -- --dir ./fotos  # importa desde carpeta local
//
// Re-ejecutable: data/catalog-manifest.json registra lo ya importado, así que
// cada corrida procesa solo las imágenes nuevas (y reintenta las que fallaron).
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { adminHeaders } from "./cli-admin.mjs";

const ARGS = process.argv.slice(2);
const WITH_MODELED = ARGS.includes("--modeled");
const CROP_ONLY = ARGS.includes("--solo-recorte");
const PER_ARTICLE = ARGS.includes("--por-articulo");
const PAUSE_INDEX = ARGS.indexOf("--pausa");
const PAUSE_MS = PAUSE_INDEX >= 0 ? Number(ARGS[PAUSE_INDEX + 1]) || 0 : 4000;
const DIR_INDEX = ARGS.indexOf("--dir");
const LOCAL_DIR = DIR_INDEX >= 0 ? ARGS[DIR_INDEX + 1] : null;
// --tag <etiqueta>: se agrega a todas las prendas de la corrida (ej: temporada "ss26")
const TAG_INDEX = ARGS.indexOf("--tag");
const EXTRA_TAG = TAG_INDEX >= 0 ? (ARGS[TAG_INDEX + 1] || "").trim().toLowerCase() || null : null;
const API = process.env.CATALOG_API_URL || `http://localhost:${process.env.PORT || 24696}`;
// CATALOG_STORAGE_PREFIX="" importa desde la raíz del bucket (?? y no ||: la
// cadena vacía es un prefijo válido, no un "sin valor").
const STORAGE_PREFIX = process.env.CATALOG_STORAGE_PREFIX ?? "catalogo/";
const MANIFEST = path.resolve(import.meta.dirname, "..", "data", "catalog-manifest.json");
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const POLL_MS = 4000;
const STAGE_TIMEOUT_MS = 4 * 60 * 1000;

const mimeFor = (name) =>
  name.toLowerCase().endsWith(".png") ? "image/png"
  : name.toLowerCase().endsWith(".webp") ? "image/webp"
  : "image/jpeg";

async function api(pathname, options) {
  const response = await fetch(`${API}${pathname}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...adminHeaders(), ...(options?.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `${response.status} en ${pathname}`);
  return value;
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST, "utf8"));
  } catch {
    return { entries: {} };
  }
}

async function saveManifest(manifest) {
  await mkdir(path.dirname(MANIFEST), { recursive: true });
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function listLocal(dir) {
  const out = [];
  for (const entry of await readdir(dir, { recursive: true })) {
    const full = path.join(dir, entry);
    if (IMAGE_EXT.test(entry) && (await stat(full)).isFile()) {
      out.push({ name: `local:${entry}`, read: () => readFile(full) });
    }
  }
  return out;
}

async function listStorage() {
  const { Client } = await import("@replit/object-storage");
  const client = new Client();
  const { ok, value, error } = await client.list();
  if (!ok) throw new Error(`No pude listar App Storage: ${JSON.stringify(error).slice(0, 200)}`);
  return value
    .map((object) => object.name)
    .filter((name) => name.startsWith(STORAGE_PREFIX) && IMAGE_EXT.test(name))
    .map((name) => ({
      name,
      read: async () => {
        const result = await client.downloadAsBytes(name);
        if (!result.ok) throw new Error(`No pude descargar ${name}`);
        return result.value[0];
      },
    }));
}

function brandOf(name) {
  const parts = name.split("/");
  if (parts.length < 2) return null;
  const folder = parts[parts.length - 2];
  const clean = folder.split(/\s*[-(]/)[0].trim().toLowerCase();
  return clean && !/^local:$/.test(clean) ? clean : null;
}

// varias fotos por artículo comparten el prefijo antes de "_": quedarse con una
function dedupePerArticle(sources) {
  const seen = new Map();
  for (const source of sources) {
    const file = source.name.split("/").pop();
    const code = file.includes("_") ? `${source.name.split("/").slice(0, -1).join("/")}/${file.split("_")[0]}` : source.name;
    if (!seen.has(code)) seen.set(code, source);
  }
  return [...seen.values()];
}

function stageOf(job, stage) {
  return job.stages?.[stage] || {};
}

async function waitForStage(jobId, stage) {
  const started = Date.now();
  for (;;) {
    const job = await api(`/api/import/jobs/${jobId}`);
    const current = stageOf(job, stage);
    if (current.status === "review") return job;
    if (current.status === "failed") throw new Error(`Etapa ${stage} falló: ${current.error || "sin detalle"}`);
    if (Date.now() - started > STAGE_TIMEOUT_MS) throw new Error(`Etapa ${stage} superó el tiempo de espera`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

async function processImage(source) {
  const bytes = await source.read();
  const imageDataUrl = `data:${mimeFor(source.name)};base64,${Buffer.from(bytes).toString("base64")}`;
  const { jobs, noClothingDetected } = await api("/api/import/jobs", {
    method: "POST",
    body: JSON.stringify({ imageDataUrl }),
  });
  if (noClothingDetected || !jobs.length) return { items: 0, detail: "sin prendas detectadas" };

  let approved = 0;
  for (const job of jobs) {
    const label = job.metadata?.name || job.id.slice(0, 8);
    process.stdout.write(`    · ${label}: recorte…`);
    const brand = brandOf(source.name);
    if (brand || EXTRA_TAG) {
      const fixed = [brand, EXTRA_TAG].filter(Boolean);
      const tags = [...fixed, ...(job.metadata?.tags || [])].slice(0, fixed.length + 3);
      await api(`/api/import/jobs/${job.id}/metadata`, { method: "PATCH", body: JSON.stringify({ metadata: { tags } }) }).catch(() => {});
    }
    const cropSuffix = CROP_ONLY ? "?garment=skip" : "";
    await api(`/api/import/jobs/${job.id}/stages/crop/approve${cropSuffix}`, { method: "POST" });
    if (CROP_ONLY) {
      await api(`/api/import/jobs/${job.id}/stages/garment/use-crop`, { method: "POST" });
      process.stdout.write(" (recorte directo) ✓\n");
      approved += 1;
      continue;
    }
    process.stdout.write(" producto…");
    try {
      await waitForStage(job.id, "garment");
      const suffix = WITH_MODELED ? "" : "?modeled=skip";
      await api(`/api/import/jobs/${job.id}/stages/garment/approve${suffix}`, { method: "POST" });
      if (WITH_MODELED) {
        process.stdout.write(" foto modelada…");
        await waitForStage(job.id, "modeled");
        await api(`/api/import/jobs/${job.id}/stages/modeled/approve`, { method: "POST" });
      }
    } catch (stageError) {
      process.stdout.write(` (IA no disponible: uso el recorte directo)`);
      await api(`/api/import/jobs/${job.id}/stages/garment/use-crop`, { method: "POST" });
    }
    process.stdout.write(" ✓\n");
    approved += 1;
  }
  return { items: approved };
}

let sources = LOCAL_DIR ? await listLocal(LOCAL_DIR) : await listStorage();
if (PER_ARTICLE) sources = dedupePerArticle(sources);
const manifest = await loadManifest();
const pending = sources.filter((source) => manifest.entries[source.name]?.status !== "done");

console.log(`Catálogo: ${sources.length} imágenes en ${LOCAL_DIR ? LOCAL_DIR : `App Storage (${STORAGE_PREFIX})`}, ${pending.length} por importar.`);
if (!pending.length) process.exit(0);

// comprobar que la app esté corriendo y con API key
const setup = await api("/api/import/config").catch(() => null);
if (!setup) {
  console.error(`No pude conectar con la app en ${API}. Arrancala con Run (o pasá CATALOG_API_URL).`);
  process.exit(1);
}
if (!setup.ready) {
  console.error("La app no tiene la API key configurada (GEMINI_API_KEY en .env).");
  process.exit(1);
}

let done = 0;
let failed = 0;
for (const source of pending) {
  console.log(`  ${source.name}`);
  try {
    const result = await processImage(source);
    manifest.entries[source.name] = { status: "done", items: result.items, detail: result.detail, at: new Date().toISOString() };
    done += 1;
  } catch (error) {
    manifest.entries[source.name] = { status: "failed", error: error.message, at: new Date().toISOString() };
    console.log(`    ✗ ${error.message}`);
    failed += 1;
  }
  await saveManifest(manifest);
  if (PAUSE_MS) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
}

console.log(`\nListo: ${done} imágenes importadas, ${failed} con error${failed ? " (se reintentan en la próxima corrida)" : ""}.`);
console.log("Las prendas nuevas ya están en el catálogo del probador (data/library.json).");
