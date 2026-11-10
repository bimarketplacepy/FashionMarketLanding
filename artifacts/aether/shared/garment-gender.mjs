export const GARMENT_GENDERS = ["mujer", "hombre", "unisex"];

export const GARMENT_TYPES = [
  "top", "blouse", "shirt", "tshirt", "sweater", "dress", "jumpsuit",
  "skirt", "trousers", "jeans", "shorts", "jacket", "coat", "heels",
  "shoes", "bag", "jewelry", "belt", "scarf", "hat", "other",
];

const WOMEN_ONLY_TYPES = new Set(["top", "blouse", "dress", "skirt", "heels"]);
const WOMEN_TERMS = /\b(women'?s?|woman|female|mujer|femenin[ao]|blouse|blusa|crop\s*top|strapless|bustier|corset|bralette|camisole|dress|vestido|pollera|falda|skirt|tac[oó]n(?:es)?|high\s*heels?|stiletto|pump|handbag|cartera|purse|clutch|mini\s*bag|earrings?|aros?|necklace|bracelet|pulsera)\b/i;
const MEN_TERMS = /\b(men'?s?|man|male|hombre|masculin[ao])\b/i;

function searchable(item = {}) {
  return [item.name, item.garmentType, item.construction, item.material, item.silhouette, ...(Array.isArray(item.tags) ? item.tags : [])]
    .filter(Boolean)
    .join(" ");
}

export function normalizeGarmentType(value, part = "") {
  if (GARMENT_TYPES.includes(value)) return value;
  if (part === "wholebody") return "dress";
  if (part === "wholebody_up") return "jacket";
  if (part === "lowerbody") return "trousers";
  if (part === "shoes") return "shoes";
  if (part === "accessories_up") return "other";
  return "other";
}

// Sección canónica del catálogo según el tipo de prenda: abrigos, chaquetas,
// sweaters y blazers van a Abrigos; blusas, remeras y camisas a Prendas
// superiores; vestidos, enterizos y polleras a Vestidos y enterizos.
const PART_BY_GARMENT_TYPE = {
  jacket: "wholebody_up", coat: "wholebody_up", sweater: "wholebody_up",
  top: "upperbody", blouse: "upperbody", shirt: "upperbody", tshirt: "upperbody",
  dress: "wholebody", jumpsuit: "wholebody", skirt: "wholebody",
  trousers: "lowerbody", jeans: "lowerbody", shorts: "lowerbody",
  heels: "shoes", shoes: "shoes",
  bag: "accessories_up", jewelry: "accessories_up", belt: "accessories_up",
  scarf: "accessories_up", hat: "accessories_up",
};

export function partForGarmentType(garmentType, fallbackPart = "upperbody") {
  return PART_BY_GARMENT_TYPE[garmentType] || fallbackPart;
}

// Qué cubre la prenda al armar un look: un vestido o enterizo es base completa,
// una pollera cuenta como prenda inferior aunque viva en la sección wholebody.
export function garmentCoverage(item = {}) {
  const type = normalizeGarmentType(item.garmentType, item.part);
  if (type === "dress" || type === "jumpsuit") return "full";
  if (type === "skirt") return "bottom";
  if (item.part === "upperbody") return "top";
  if (item.part === "lowerbody") return "bottom";
  if (item.part === "wholebody_up") return "outer";
  if (item.part === "wholebody") return "full";
  return "extra";
}

export function inferGarmentGender(item = {}) {
  const type = normalizeGarmentType(item.garmentType, item.part);
  const text = searchable(item);
  if (WOMEN_ONLY_TYPES.has(type) || WOMEN_TERMS.test(text)) return "mujer";
  if (MEN_TERMS.test(text)) return "hombre";
  if (GARMENT_GENDERS.includes(item.gender)) return item.gender;
  return "unisex";
}

export function garmentFitsModel(item, modelGender) {
  const garmentGender = inferGarmentGender(item);
  return garmentGender === "unisex" || garmentGender === modelGender;
}

export function effectiveProfileGender(profile = {}) {
  if (profile.gender === "hombre" || profile.catalogGender === "hombre" || profile.modelGender === "hombre") return "hombre";
  return "mujer";
}
