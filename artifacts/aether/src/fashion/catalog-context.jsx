import { createContext, useCallback, useContext, useEffect, useState } from "react";

const CatalogContext = createContext(null);

// Catálogo compartido entre todas las páginas. Las ediciones del admin
// persisten en el servidor (PATCH), sin capas de localStorage.
export function CatalogProvider({ children }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/import/wardrobe", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar el catálogo.");
        return response.json();
      })
      .then(setItems)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const saveItem = useCallback(async (updatedItem) => {
    const response = await fetch(`/api/import/wardrobe/${updatedItem.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: updatedItem.name,
        part: updatedItem.part,
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

  return (
    <CatalogContext.Provider value={{ items, loading, error, setError, saveItem, deleteItem, addImportedItem, attachImportedModeledImage }}>
      {children}
    </CatalogContext.Provider>
  );
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error("useCatalog debe usarse dentro de CatalogProvider");
  return context;
}
