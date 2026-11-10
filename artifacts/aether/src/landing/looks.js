// Arma looks de la temporada con prendas reales del catálogo.
//
// No hay fotos de looks con modelos para SS26, así que cada look es un
// conjunto de 2 a 4 prendas (arriba, abajo / vestido, calzado y, si combina,
// un accesorio) agrupadas por armonía de color y por palabras compartidas en el
// nombre (misma estampa o línea: "rayas amarillas", "tie-dye", "Positano").
// Determinístico: el mismo catálogo da siempre los mismos looks.
import { armoniaColor } from "../fashion/sugerencias.js";

const STOP_WORDS = new Set(["de", "con", "y", "a", "en", "el", "la", "los", "las", "del", "sin", "para", "tiro", "alto", "bajo", "corto", "corta", "largo", "larga"]);
const BEACH = /bikini|playa|pareo|traje de baño|bombacha|ojota|kimono/i;
const GENERIC = /^(top|remera|blusa|camisa|musculosa|bikini|bombacha|pantal[oó]n|short|pollera|falda|sandalia|zapato|zapatilla|ojota|mule|bota|vestido|cintur[oó]n|aros?|collar|pa[nñ]uelo|sombrero)$/i;

function tokens(item) {
  return new Set(
    String(item.name || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !GENERIC.test(word)),
  );
}

function colorsOf(item) {
  return [item.color, item.secondaryColor].filter(Boolean);
}

function harmony(a, b) {
  return colorsOf(a).some((first) => colorsOf(b).some((second) => armoniaColor(first, second)));
}

function affinity(look, candidate) {
  let score = 0;
  const candidateTokens = tokens(candidate);
  for (const piece of look) {
    if (harmony(piece, candidate)) score += 2;
    for (const word of tokens(piece)) if (candidateTokens.has(word)) score += 3;
    if ((piece.occasions || []).some((occasion) => (candidate.occasions || []).includes(occasion))) score += 0.5;
  }
  return score;
}

// Hash estable para ordenar sin aleatoriedad.
function stableHash(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

const isBeach = (item) => BEACH.test(`${item.name} ${(item.tags || []).join(" ")}`);
const isDress = (item) => item.garmentType === "dress" || item.part === "wholebody";

export const LOOK_FAMILIES = [
  { id: "conjuntos", label: "Conjuntos" },
  { id: "vestidos", label: "Vestidos" },
  { id: "playa", label: "Playa" },
];

function pickBest(look, pool, used, minScore = 2) {
  let best = null;
  for (const candidate of pool) {
    if (used.has(candidate.id)) continue;
    const score = affinity(look, candidate);
    if (score >= minScore && (!best || score > best.score)) best = { item: candidate, score };
  }
  return best?.item || null;
}

function buildFamily(family, items, used, limit) {
  const shoes = items.filter((item) => item.part === "shoes" && (family !== "playa" || !/\bbot(a|ita|in)/i.test(item.name)));
  const accessories = items.filter((item) => item.part === "accessories_up");
  let anchors;
  let bottoms = [];
  if (family === "vestidos") {
    anchors = items.filter(isDress);
  } else if (family === "playa") {
    anchors = items.filter((item) => item.part === "upperbody" && !isDress(item) && isBeach(item));
    bottoms = items.filter((item) => item.part === "lowerbody" && isBeach(item));
  } else {
    anchors = items.filter((item) => item.part === "upperbody" && !isDress(item) && !isBeach(item));
    bottoms = items.filter((item) => item.part === "lowerbody" && !isBeach(item));
  }
  anchors = [...anchors].sort((a, b) => stableHash(a.id) - stableHash(b.id));
  const looks = [];
  for (const anchor of anchors) {
    if (looks.length >= limit) break;
    if (used.has(anchor.id)) continue;
    const look = [anchor];
    const local = new Set([anchor.id]);
    if (family !== "vestidos") {
      const bottom = pickBest(look, bottoms, new Set([...used, ...local]), family === "playa" ? 3 : 2);
      if (!bottom) continue;
      look.push(bottom);
      local.add(bottom.id);
    }
    const shoe = pickBest(look, shoes, new Set([...used, ...local]), 2);
    if (shoe) { look.push(shoe); local.add(shoe.id); }
    const accessory = pickBest(look, accessories, new Set([...used, ...local]), 4);
    if (accessory) { look.push(accessory); local.add(accessory.id); }
    if (look.length < 2) continue;
    for (const id of local) used.add(id);
    looks.push({ id: `${family}-${anchor.id}`, family, pieces: look });
  }
  return looks;
}

export function buildSeasonLooks(items, { limitPerFamily = 7 } = {}) {
  const used = new Set();
  const result = {};
  for (const family of LOOK_FAMILIES) result[family.id] = buildFamily(family.id, items, used, limitPerFamily);
  return result;
}

// Prendas para colgar en el perchero: variedad de categorías "colgables".
export const HANGABLE_PARTS = ["upperbody", "wholebody", "wholebody_up", "lowerbody"];
// Dentro de Odoo el perchero muestra sólo la parte superior (prendas superiores y abrigos).
export const UPPER_PARTS = ["upperbody", "wholebody_up"];

export function pickRackItems(items, count = 12, parts = HANGABLE_PARTS) {
  const hangable = items.filter((item) => parts.includes(item.part));
  const byType = new Map();
  for (const item of [...hangable].sort((a, b) => stableHash(`rack-${a.id}`) - stableHash(`rack-${b.id}`))) {
    const key = item.garmentType || item.part;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(item);
  }
  const queues = [...byType.values()];
  const picked = [];
  const names = new Set();
  while (picked.length < count && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && !names.has(next.name) && picked.length < count) {
        picked.push(next);
        names.add(next.name);
      }
    }
  }
  return picked;
}
