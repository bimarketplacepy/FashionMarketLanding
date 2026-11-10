// Asigna collection "SS26" a las prendas importadas por lotes que quedaron sin
// colección (season "all"). Mismo esquema que las SS26 existentes:
// collection "SS26", season "summer", active true.
//
//   node scripts/migrations/assign-ss26.mjs           # dry-run (no escribe)
//   node scripts/migrations/assign-ss26.mjs --apply   # backup + escritura
import { copyFile, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const FILE = path.join(ROOT, "data/library.json");
const APPLY = process.argv.includes("--apply");

const library = JSON.parse(await readFile(FILE, "utf8"));
const targets = library.filter((item) => !item.collection && item.season === "all");
console.log(`Prendas sin colección y season "all": ${targets.length} de ${library.length}`);
console.log("Ejemplos:");
for (const item of targets.slice(0, 10)) console.log(`  ${item.id}  ${item.name}  [${item.importBatch?.name || "-"}]`);

if (!APPLY) {
  console.log("\nDry-run: no se escribió nada. Usá --apply para aplicar.");
  process.exit(0);
}

const backupDir = path.join(ROOT, "data/_backups");
await mkdir(backupDir, { recursive: true });
const backup = path.join(backupDir, `library-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await copyFile(FILE, backup);
console.log(`Backup: ${path.relative(ROOT, backup)}`);

for (const item of targets) {
  item.collection = "SS26";
  item.season = "summer";
  item.active = true;
}
await writeFile(FILE, `${JSON.stringify(library, null, 2)}\n`);
console.log(`Actualizadas ${targets.length} prendas.`);
