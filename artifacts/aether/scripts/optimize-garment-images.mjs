// Genera las variantes web de cada prenda del catálogo.
//
// Fuente: data/imported/<id>-garment.png (el PNG maestro con transparencia, que
// sigue siendo el que usan importación, regeneración y limpieza de fondos).
// Salida: public/garments/<id>-garment.<hash>-<ancho>.{webp,avif}, con
// transparencia, en 400, 800 y 1400 px de ancho (sin agrandar: las fuentes son
// de 1024 px, así que el mayor queda en 1024). El hash es del PNG: si la prenda
// se regenera cambia el nombre y el navegador no sirve una versión vieja.
//
// En library.json se agrega `imageSet` sin tocar `image`/`thumbnail`, así que
// el cambio es reversible (--revert borra imageSet y el front vuelve al PNG).
//
//   node scripts/optimize-garment-images.mjs --dry-run   # cuenta qué haría
//   node scripts/optimize-garment-images.mjs             # genera lo nuevo o cambiado
//   node scripts/optimize-garment-images.mjs --verify    # falla si falta alguna variante (corre en prebuild)
//   node scripts/optimize-garment-images.mjs --revert    # quita imageSet del catálogo (backup previo)
//
// Correrlo después de importar, regenerar o limpiar prendas.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIBRARY = path.join(ROOT, "data/library.json");
const SOURCE_DIR = path.join(ROOT, "data/imported");
const OUT_DIR = path.join(ROOT, "public/garments");
const PUBLIC_BASE = "/garments";
const WIDTHS = [400, 800, 1400];
const FORMATS = ["avif", "webp"];
const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has("--dry-run");

const sourceName = (url) => path.basename(String(url || "").split(/[?#]/)[0]);
const variantName = (stem, hash, width, format) => `${stem}.${hash}-${width}.${format}`;

async function writeLibrary(library) {
  const tmp = `${LIBRARY}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(library, null, 2)}\n`);
  await rename(tmp, LIBRARY);
}

async function backupLibrary() {
  const dir = path.join(ROOT, "data/_backups");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `library-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await copyFile(LIBRARY, file);
  return path.relative(ROOT, file);
}

function variantFiles(set) {
  const stem = path.basename(set.src);
  return set.widths.flatMap((width) => set.formats.map((format) => variantName(stem, set.hash, width, format)));
}

const library = JSON.parse(await readFile(LIBRARY, "utf8"));

if (ARGS.has("--verify")) {
  // Lo que se publica tiene que tener sus variantes: sin esto la prenda
  // pediría el PNG, que no viaja al deployment.
  const problems = [];
  for (const item of library) {
    if (item.active === false) continue;
    if (!item.imageSet) { problems.push(`${item.id}: sin imageSet`); continue; }
    for (const file of variantFiles(item.imageSet)) {
      if (!existsSync(path.join(OUT_DIR, file))) problems.push(`${item.id}: falta ${file}`);
    }
  }
  if (problems.length) {
    console.error(`Faltan variantes web de ${problems.length} prenda(s). Corré: node scripts/optimize-garment-images.mjs`);
    for (const line of problems.slice(0, 20)) console.error(`  ${line}`);
    process.exit(1);
  }
  console.log(`Variantes web OK para ${library.filter((item) => item.active !== false).length} prendas activas.`);
  process.exit(0);
}

if (ARGS.has("--revert")) {
  const count = library.filter((item) => item.imageSet).length;
  if (DRY) { console.log(`Dry-run: se quitaría imageSet de ${count} prendas.`); process.exit(0); }
  console.log(`Backup: ${await backupLibrary()}`);
  for (const item of library) delete item.imageSet;
  await writeLibrary(library);
  console.log(`Quitado imageSet de ${count} prendas (las variantes en public/garments quedan en disco).`);
  process.exit(0);
}

await mkdir(OUT_DIR, { recursive: true });
const existingOutputs = new Set(await readdir(OUT_DIR).catch(() => []));
let generated = 0;
let unchanged = 0;
let missingSource = 0;
const plan = [];

for (const item of library) {
  const file = sourceName(item.image);
  const source = path.join(SOURCE_DIR, file);
  if (!file.endsWith(".png") || !existsSync(source)) { missingSource += 1; continue; }
  const bytes = await readFile(source);
  const hash = createHash("sha1").update(bytes).digest("hex").slice(0, 8);
  const stem = file.replace(/\.png$/, "");
  const fresh = item.imageSet?.hash === hash
    && variantFiles(item.imageSet).every((name) => existingOutputs.has(name));
  if (fresh) { unchanged += 1; continue; }
  plan.push({ item, source, bytes, hash, stem });
}

console.log(`${library.length} prendas: ${plan.length} por generar, ${unchanged} al día, ${missingSource} sin PNG fuente.`);
if (DRY) process.exit(0);
if (plan.length) console.log(`Backup: ${await backupLibrary()}`);

let index = 0;
async function worker() {
  while (index < plan.length) {
    const { item, bytes, hash, stem } = plan[index++];
    const meta = await sharp(bytes).metadata();
    const widths = [...new Set(WIDTHS.map((width) => Math.min(width, meta.width)))];
    for (const width of widths) {
      const resized = sharp(bytes).resize({ width, withoutEnlargement: true });
      await writeFile(path.join(OUT_DIR, variantName(stem, hash, width, "webp")), await resized.clone().webp({ quality: 80, alphaQuality: 90, effort: 5 }).toBuffer());
      await writeFile(path.join(OUT_DIR, variantName(stem, hash, width, "avif")), await resized.clone().avif({ quality: 55, effort: 4 }).toBuffer());
    }
    // Variantes viejas de la misma prenda (hash anterior) ya no se usan.
    for (const name of existingOutputs) {
      if (name.startsWith(`${stem}.`) && !name.startsWith(`${stem}.${hash}-`)) await rm(path.join(OUT_DIR, name), { force: true });
    }
    item.imageSet = { src: `${PUBLIC_BASE}/${stem}`, hash, width: meta.width, height: meta.height, widths, formats: FORMATS };
    generated += 1;
    if (generated % 50 === 0) console.log(`  ${generated}/${plan.length}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
if (generated) await writeLibrary(library);

const outputs = await readdir(OUT_DIR);
let total = 0;
let at800 = 0;
let count800 = 0;
for (const name of outputs) {
  const size = (await stat(path.join(OUT_DIR, name))).size;
  total += size;
  if (name.endsWith("-800.webp")) { at800 += size; count800 += 1; }
}
console.log(JSON.stringify({ generated, unchanged, missingSource, files: outputs.length, totalMB: +(total / 1e6).toFixed(1), avgKB800webp: count800 ? Math.round(at800 / count800 / 1024) : null }));
