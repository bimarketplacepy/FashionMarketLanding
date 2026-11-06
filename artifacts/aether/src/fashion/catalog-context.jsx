import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const CatalogContext = createContext(null);

// Las prendas con active:false (p. ej. una colección de temporada pasada) siguen en el catálogo
// para el admin, pero no se muestran en la tienda ni en el probador.
export const isActiveItem = (item) => item.active !== false;

// Catálogo compartido entre todas las páginas. Las ediciones del admin
// persisten en el servidor (PATCH), sin capas de localStorage.
// scope "public": /api/catalog (sólo prendas activas, campos públicos).
// scope "admin": /api/import/wardrobe (catálogo completo, para el panel).
export function CatalogProvider({ children, scope = "public" }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Se pide recién cuando alguna vista lo usa: la landing no necesita el
  // catálogo completo (tiene su propio payload, /api/landing).
  const [requested, setRequested] = useState(false);

  const refreshCatalog = useCallback(() => {
    setLoading(true);
    (scope === "admin" ? fetch("/api/import/wardrobe", { cache: "no-store" }) : fetch("/api/catalog"))
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el catálogo.");
        return response.json();
      })
      .then(setItems)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => {
    if (requested) refreshCatalog();
  }, [requested, refreshCatalog]);

  const saveItem = useCallback(async (updatedItem) => {
    const response = await fetch(`/api/import/wardrobe/${updatedItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updatedItem.name,
        part: updatedItem.part,
        garmentType: updatedItem.garmentType,
        color: updatedItem.color,
        secondaryColor: updatedItem.secondaryColor,
        tags: updatedItem.tags,
        sizes: updatedItem.sizes,
        description: updatedItem.description,
        gender: updatedItem.gender,
      }),
    });
    const saved = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(saved.error || "No se pudo guardar la prenda.");
    setItems((current) => current.map((item) => item.id === saved.id ? { ...item, ...saved } : item));
    return saved;
  }, []);

  const setItemsActive = useCallback(async (ids, active) => {
    // Una sola escritura en el servidor para todo el bloque: con un PATCH por
    // prenda en paralelo, las escrituras de library.json se pisaban.
    const response = await fetch("/api/import/wardrobe/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, active }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "No se pudieron actualizar las prendas.");
    const byId = new Map((result.records || []).map((record) => [record.id, record]));
    setItems((current) => current.map((item) => byId.has(item.id) ? { ...item, ...byId.get(item.id) } : item));
  }, []);

  const deleteItem = useCallback(async (id) => {
    const response = await fetch(`/api/import/wardrobe/${id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error("No se pudo eliminar la prenda.");
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const addImportedItem = useCallback((newItem) => {
    setItems((current) => current.some((item) => item.id === newItem.id) ? current : [...current, newItem]);
  }, []);

  const attachImportedModeledImage = useCallback((jobId, modeledImage) => {
    const id = `import-${jobId}`;
    setItems((current) => current.map((item) => item.id === id ? { ...item, modeledImage } : item));
  }, []);

  const activeItems = useMemo(() => items.filter(isActiveItem), [items]);

  return (
    <CatalogContext.Provider value={{ request: setRequested, items: activeItems, allItems: items, setItemsActive, loading, error, setError, saveItem, deleteItem, addImportedItem, attachImportedModeledImage, refreshCatalog }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error("useCatalog debe usarse dentro de CatalogProvider");
  const { request } = context;
  useEffect(() => { request(true); }, [request]);
  return context;
}
