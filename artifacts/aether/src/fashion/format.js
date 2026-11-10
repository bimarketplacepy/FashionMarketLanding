export const PART_LABELS = {
  upperbody: "Prenda superior",
  wholebody: "Vestido / enterizo",
  wholebody_up: "Abrigo",
  lowerbody: "Prenda inferior",
  shoes: "Calzado",
  accessories_up: "Accesorio",
};

export const MATERIAL_LABELS = {
  synthetic: "Sintético",
  knit: "Punto",
  mixed: "Mixto",
  cotton: "Algodón",
  denim: "Denim",
  leather: "Cuero",
  wool: "Lana",
  silk: "Seda",
  linen: "Lino",
};

export const SILHOUETTE_LABELS = {
  relaxed: "Holgada",
  fitted: "Entallada",
  structured: "Estructurada",
  regular: "Regular",
  flowy: "Fluida",
  oversized: "Oversize",
};

export const SEASON_LABELS = {
  autumn: "Otoño",
  winter: "Invierno",
  spring: "Primavera",
  summer: "Verano",
  all: "Todo el año",
};

export const GARMENT_TYPE_LABELS = {
  jacket: "Campera",
  top: "Top",
  trousers: "Pantalón",
  skirt: "Pollera",
  sweater: "Sweater",
  jeans: "Jeans",
  blouse: "Blusa",
  shorts: "Short",
  dress: "Vestido",
  jewelry: "Joyería",
  bag: "Cartera",
  shirt: "Camisa",
  tshirt: "Remera",
  jumpsuit: "Enterizo",
  other: "Otro",
  scarf: "Bufanda",
  belt: "Cinturón",
  shoes: "Calzado",
};

const PRICE_FORMAT = new Intl.NumberFormat("es-PY", { style: "currency", currency: "PYG", maximumFractionDigits: 0 });

export function formatPriceGs(value) {
  return Number.isFinite(value) ? PRICE_FORMAT.format(value) : "Sin precio";
}
