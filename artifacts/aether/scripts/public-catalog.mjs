// Vista pública del catálogo: sólo prendas activas y sólo los campos que usan
// la tienda y el probador. library.json completo (con análisis crudos de IA,
// datos de lote y prendas inactivas) queda para el panel de administración.
import { readSiteConfig } from "./site-config.mjs";

const PUBLIC_FIELDS = [
  "id", "name", "part", "garmentType", "color", "secondaryColor", "palette", "tags", "season",
  "material", "silhouette", "weight", "climates", "occasions", "image", "thumbnail", "modeledImage",
  "gender", "sizes", "description", "collection", "imageSet", "extraImages",
];

export function toPublicCatalog(records) {
  const showPrices = readSiteConfig().showPrices === true;
  const fields = showPrices ? [...PUBLIC_FIELDS, "price"] : PUBLIC_FIELDS;
  return records
    .filter((record) => record.active !== false)
    .map((record) => Object.fromEntries(fields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]])));
}
