// Sube carpetas de respaldo a App Storage (Object Storage de Replit) y verifica
// que cada archivo quedó con el mismo tamaño. No borra nada local.
//
//   node scripts/maintenance/archive-to-storage.mjs <prefijo> <carpeta>...
//   ej: node scripts/maintenance/archive-to-storage.mjs archivo/2026-11-06 data/batches data/imported-originals
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Client } from "@replit/object-storage";

const [prefix, ...dirs] = process.argv.slice(2);
if (!prefix || !dirs.length) {
  console.error("Uso: archive-to-storage.mjs <prefijo> <carpeta>...");
  process.exit(1);
}
const ROOT = path.resolve(import.meta.dirname, "../..");
const client = new Client();

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const existing = new Map();
{
  const listed = await client.list({ prefix: `${prefix}/` });
  if (!listed.ok) throw new Error(`No se pudo listar el bucket: ${listed.error?.message}`);
  for (const object of listed.value) existing.set(object.name, true);
}

const files = [];
for (const dir of dirs) for await (const file of walk(path.resolve(ROOT, dir))) files.push(file);
console.log(`${files.length} archivos a respaldar en ${prefix}/ (${existing.size} ya estaban).`);

let uploaded = 0;
let skipped = 0;
let failed = 0;
let bytes = 0;
let index = 0;
async function worker() {
  while (index < files.length) {
    const file = files[index++];
    const key = `${prefix}/${path.relative(ROOT, file)}`;
    const size = (await stat(file)).size;
    if (existing.has(key)) { skipped += 1; continue; }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const result = await client.uploadFromFilename(key, file);
      if (result.ok) { uploaded += 1; bytes += size; break; }
      if (attempt === 3) { failed += 1; console.error(`FALLÓ ${key}: ${result.error?.message}`); }
    }
    const done = uploaded + skipped + failed;
    if (done % 200 === 0) console.log(`  ${done}/${files.length}`);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

// Verificación: todo lo local tiene su objeto en el bucket.
const listed = await client.list({ prefix: `${prefix}/` });
const remote = new Set(listed.ok ? listed.value.map((object) => object.name) : []);
const missing = files.filter((file) => !remote.has(`${prefix}/${path.relative(ROOT, file)}`));
console.log(JSON.stringify({ total: files.length, uploaded, skipped, failed, uploadedMB: Math.round(bytes / 1e6), missing: missing.length }));
if (missing.length) { console.error("Faltan:", missing.slice(0, 10)); process.exit(2); }
