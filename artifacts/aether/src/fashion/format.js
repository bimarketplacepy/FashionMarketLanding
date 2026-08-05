export const PART_LABELS = {
  upperbody: "Prenda superior",
  wholebody: "Vestido / enterizo",
  wholebody_up: "Abrigo",
  lowerbody: "Prenda inferior",
  shoes: "Calzado",
  accessories_up: "Accesorio",
};

const PRICE_FORMAT = new Intl.NumberFormat("es-PY", { style: "currency", currency: "PYG", maximumFractionDigits: 0 });

export function formatPriceGs(value) {
  return Number.isFinite(value) ? PRICE_FORMAT.format(value) : "Sin precio";
}
