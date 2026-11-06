import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const CatalogContext = createContext(null);

// Las prendas con active:false (p. ej. la colección FW26) siguen en el catálogo
// para el admin, pero no se muestran en la tienda ni en el probador.
export const isActiveItem = (item) => item.active !== false;

// Catálogo compartido entre todas las páginas. Las ediciones del admin
// persisten en el servidor (PATCH), sin capas de localStorage.
export function CatalogProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshCatalog = useCallback(() => {
    setLoading(true);
    fetch("/api/import/wardrobe", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el catálogo.");
        return response.json();
      })
      .then(setItems)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

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
    const saved = await Promise.all(ids.map(async (id) => {
      const response = await fetch(`/api/import/wardrobe/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      const record = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(record.error || "No se pudo actualizar la prenda.");
      return record;
    }));
    const byId = new Map(saved.map((record) => [record.id, record]));
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
    <CatalogContext.Provider value={{ items: activeItems, allItems: items, setItemsActive, loading, error, setError, saveItem, deleteItem, addImportedItem, attachImportedModeledImage, refreshCatalog }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error("useCatalog debe usarse dentro de CatalogProvider");
  return context;
}
