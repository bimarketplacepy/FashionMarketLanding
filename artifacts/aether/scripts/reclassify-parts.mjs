// Reclasifica cada prenda del catálogo a su sección canónica según garmentType
// (ver partForGarmentType en shared/garment-gender.mjs): abrigos, chaquetas,
// sweaters y blazers en Abrigos; blusas, remeras y camisas en Prendas
// superiores; vestidos, enterizos y polleras en Vestidos y enterizos.
//
// Uso (con la app corriendo):
//   pnpm --filter @workspace/aether run reclassify-parts            # aplica
//   pnpm --filter @workspace/aether run reclassify-parts -- --dry   # solo muestra
import { normalizeGarmentType, partForGarmentType } from "../shared/garment-gender.mjs";

const API = process.env.CATALOG_API_URL || `http://localhost:${process.env.PORT || 24696}`;
const DRY_RUN = process.argv.includes("--dry");

const response = await fetch(`${API}/api/import/wardrobe`);
if (!response.ok) {
  console.error(`No pude leer el catálogo en ${API} (HTTP ${response.status}). ¿Está corriendo la app?`);
  process.exit(1);
}
const items = await response.json();

let moved = 0;
for (const item of items) {
  const type = normalizeGarmentType(item.garmentType, item.part);
  const part = partForGarmentType(type, item.part);
  if (part === item.part) continue;
  console.log(`${item.name} [${type}]: ${item.part} -> ${part}`);
  if (!DRY_RUN) {
    const patch = await fetch(`${API}/api/import/wardrobe/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ part }),
    });
    if (!patch.ok) {
      console.error(`  ✗ HTTP ${patch.status}`);
      continue;
    }
  }
  moved += 1;
}

console.log(`${DRY_RUN ? "Se moverían" : "Se movieron"} ${moved} de ${items.length} prendas.`);
