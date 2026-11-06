// Payload de la landing: looks y perchero ya armados en el servidor, con sólo
// los campos que la landing muestra. Evita que el navegador descargue y procese
// el catálogo entero para pintar el hero.
import { buildSeasonLooks, pickRackItems } from "../src/landing/looks.js";
import { toPublicCatalog } from "./public-catalog.mjs";
import { readSiteConfig } from "./site-config.mjs";

const FIELDS = ["id", "name", "part", "garmentType", "color", "secondaryColor", "image", "thumbnail", "imageSet", "sizes", "description", "collection"];
const slim = (item) => Object.fromEntries(FIELDS.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));

export function buildLandingPayload(records) {
  const season = readSiteConfig().activeSeason;
  const items = toPublicCatalog(records).filter((item) => item.collection === season);
  const looks = buildSeasonLooks(items);
  return {
    season,
    activeCollections: [...new Set(toPublicCatalog(records).map((item) => item.collection).filter(Boolean))],
    looks: Object.fromEntries(Object.entries(looks).map(([family, list]) => [family, list.map((look) => ({ ...look, pieces: look.pieces.map(slim) }))])),
    rack: pickRackItems(items, 12).map(slim),
  };
}
