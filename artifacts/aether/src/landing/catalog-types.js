// Categorías del catálogo (campo `part` de library.json) en el orden público.
export const TYPES = [
  { id: "all", label: "Todo" },
  { id: "upperbody", label: "Prendas superiores", singular: "Prenda superior" },
  { id: "wholebody", label: "Vestidos y enterizos", singular: "Vestido o enterizo" },
  { id: "wholebody_up", label: "Abrigos", singular: "Abrigo" },
  { id: "lowerbody", label: "Prendas inferiores", singular: "Prenda inferior" },
  { id: "accessories_up", label: "Accesorios", singular: "Accesorio" },
  { id: "shoes", label: "Calzado", singular: "Calzado" },
];

export const TYPE_MAP = Object.fromEntries(TYPES.map((type) => [type.id, type]));
export const TYPE_ORDER = Object.fromEntries(TYPES.slice(1).map((type, index) => [type.id, index]));

export function sortForCatalog(items, activeType = "all") {
  return [...items].sort((a, b) => {
    if (activeType === "all") {
      const typeDifference = (TYPE_ORDER[a.part] ?? 99) - (TYPE_ORDER[b.part] ?? 99);
      if (typeDifference) return typeDifference;
    }
    return a.id.localeCompare(b.id);
  });
}
