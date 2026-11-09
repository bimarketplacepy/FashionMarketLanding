// Payload de la landing: looks y perchero ya armados en el servidor, con sólo
// los campos que la landing muestra. Evita que el navegador descargue y procese
// el catálogo entero para pintar el hero.
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildSeasonLooks, pickRackItems } from "../src/landing/looks.js";
import { toPublicCatalog } from "./public-catalog.mjs";
import { readSiteConfig } from "./site-config.mjs";

const FIELDS = ["id", "name", "part", "garmentType", "color", "secondaryColor", "image", "thumbnail", "imageSet", "sizes", "description", "collection"];
const slim = (item) => Object.fromEntries(FIELDS.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));

// data/look-models.json: fotos de los looks sobre avatares IA
// (scripts/generate-look-models.mjs). Mismos candidatos que site-config.
const MANIFEST_CANDIDATES = [
  process.env.AETHER_ROOT && path.resolve(process.env.AETHER_ROOT, "data/look-models.json"),
  path.resolve(import.meta.dirname, "../data/look-models.json"),
  path.resolve(import.meta.dirname, "../../aether/data/look-models.json"),
].filter(Boolean);

function readLookModels() {
  for (const file of MANIFEST_CANDIDATES) {
    try { return JSON.parse(readFileSync(file, "utf8")).looks || {}; } catch { /* siguiente */ }
  }
  return {};
}

const sameIds = (a = [], b = []) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

// Sólo fotos aprobadas, optimizadas y hechas con exactamente estas prendas.
function modelFor(look, models) {
  const entry = models[look.id];
  if (!entry || entry.status !== "aprobado" || !entry.imageSet) return null;
  if (!sameIds(entry.garmentIds, look.pieces.map((piece) => piece.id))) return null;
  const { cutout, ...imageSet } = entry.imageSet;
  return {
    name: entry.model,
    imageSet,
    cutout: Boolean(cutout),
    hotspots: (entry.hotspots || []).filter((spot) => spot.visible).map(({ garmentId, x, y }) => ({ garmentId, x, y })),
  };
}

export function buildLandingPayload(records, { withModels = true } = {}) {
  const season = readSiteConfig().activeSeason;
  const items = toPublicCatalog(records).filter((item) => item.collection === season);
  const looks = buildSeasonLooks(items);
  const models = withModels ? readLookModels() : {};
  return {
    season,
    activeCollections: [...new Set(toPublicCatalog(records).map((item) => item.collection).filter(Boolean))],
    looks: Object.fromEntries(Object.entries(looks).map(([family, list]) => [family, list.map((look) => {
      const model = modelFor(look, models);
      return { ...look, pieces: look.pieces.map(slim), ...(model ? { model } : {}) };
    })])),
    rack: pickRackItems(items, 12).map(slim),
  };
}
