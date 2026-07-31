// Motor de sugerencias "Combina con": puntúa prendas de otras categorías
// contra una prenda base (ficha) o un outfit parcial (builder).
// Módulo JS puro, sin React, para poder testearlo con node.

const NEUTRAL_SATURATION = 0.16;
const PARTS_ORDER = ["upperbody", "wholebody_up", "lowerbody", "shoes", "accessories_up"];

function hexToHsl(hex = "#777777") {
  const value = hex.replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * (((blue - red) / delta) + 2);
    else hue = 60 * (((red - green) / delta) + 4);
  }
  return { hue: hue < 0 ? hue + 360 : hue, saturation: delta / (1 - Math.abs(max + min - 1) || 1) };
}

// Armonía de color: mismo tono, neutro con neutro, o complementario.
export function armoniaColor(first, second) {
  if (!first || !second) return false;
  const a = hexToHsl(first);
  const b = hexToHsl(second);
  if (a.saturation < NEUTRAL_SATURATION || b.saturation < NEUTRAL_SATURATION) return true;
  const difference = Math.abs(a.hue - b.hue);
  const distance = Math.min(difference, 360 - difference);
  return distance <= 38 || (distance >= 145 && distance <= 215);
}

function harmonizes(reference, candidate) {
  const referenceColors = [reference.color, reference.secondaryColor].filter(Boolean);
  const candidateColors = [candidate.color, candidate.secondaryColor].filter(Boolean);
  return referenceColors.some((a) => candidateColors.some((b) => armoniaColor(a, b)));
}

function sharesOccasion(reference, candidate) {
  const occasions = reference.occasions || [];
  return (candidate.occasions || []).some((occasion) => occasions.includes(occasion));
}

function compatibleGender(reference, candidate) {
  return !candidate.gender || !reference.gender || candidate.gender === "unisex" || reference.gender === "unisex" || candidate.gender === reference.gender;
}

// Pares de prendas que ya aparecen juntas en outfits guardados.
function buildTogetherMap(outfits) {
  const together = new Map();
  for (const outfit of outfits || []) {
    for (const id of outfit.garmentIds || []) {
      if (!together.has(id)) together.set(id, new Set());
      for (const other of outfit.garmentIds) if (other !== id) together.get(id).add(other);
    }
  }
  return together;
}

const newestFirst = (items) => [...items].reverse();

// sugerirPrendas({ base, outfit, items, outfits, max })
// - base: prenda abierta en la ficha (sugiere otras categorías).
// - outfit: mapa part → prenda|null del builder (sugiere solo slots vacíos).
// Devuelve [{ item, deColeccion }] con hasta `max` sugerencias; si el ranking
// da menos de 4, completa con las más nuevas del catálogo ("De la colección").
export function sugerirPrendas({ base = null, outfit = null, items = [], outfits = [], max = 8 }) {
  const chosen = outfit ? Object.values(outfit).filter(Boolean) : [];
  const chosenIds = new Set(chosen.map((item) => item.id));
  const chosenParts = new Set(chosen.map((item) => item.part));
  const references = base ? [base] : chosen;
  if (!references.length) return [];

  const allowed = (item) => {
    if (!PARTS_ORDER.includes(item.part)) return false;
    if (base && (item.id === base.id || item.part === base.part)) return false;
    if (outfit && (chosenIds.has(item.id) || chosenParts.has(item.part))) return false;
    return references.every((reference) => compatibleGender(reference, item));
  };

  const together = buildTogetherMap(outfits);
  const candidates = items.filter(allowed).map((item) => {
    let score = 0;
    if (references.some((reference) => harmonizes(reference, item))) score += 3;
    if (references.some((reference) => sharesOccasion(reference, item))) score += 2;
    if (references.some((reference) => together.get(reference.id)?.has(item.id))) score += 1;
    // Desempates: precio cargado y foto completa primero.
    if (typeof item.price === "number") score += 0.4;
    if (item.analysis?.prendaCompleta !== false) score += 0.2;
    return { item, score };
  }).sort((a, b) => b.score - a.score);

  // Diversidad: máximo 2 por categoría dentro del ranking principal.
  const perPart = {};
  const picks = [];
  for (const candidate of candidates) {
    if (candidate.score < 3) continue; // sin armonía ni ocasión compartida no califica al ranking
    const part = candidate.item.part;
    if ((perPart[part] || 0) >= 2) continue;
    perPart[part] = (perPart[part] || 0) + 1;
    picks.push({ item: candidate.item, deColeccion: false });
    if (picks.length === max) break;
  }

  // Relleno "De la colección": las más nuevas de categorías faltantes.
  if (picks.length < 4) {
    const used = new Set(picks.map(({ item }) => item.id));
    const usedParts = new Set(picks.map(({ item }) => item.part));
    const pool = newestFirst(items).filter((item) => allowed(item) && !used.has(item.id));
    for (const item of [...pool.filter((item) => !usedParts.has(item.part)), ...pool.filter((item) => usedParts.has(item.part))]) {
      if (used.has(item.id)) continue;
      picks.push({ item, deColeccion: true });
      used.add(item.id);
      if (picks.length >= 4) break;
    }
  }
  return picks.slice(0, max);
}
