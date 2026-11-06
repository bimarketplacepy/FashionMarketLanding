import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// "Tu selección": piezas que el visitante quiere consultar. Se guarda en
// localStorage sólo como comodidad (si el navegador no deja, sigue en memoria).
const STORAGE_KEY = "fm-seleccion-v1";
const SelectionContext = createContext(null);

function readStored() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter((entry) => typeof entry?.id === "string" && entry.item?.name) : [];
  } catch {
    return [];
  }
}

export function SelectionProvider({ children }) {
  const [entries, setEntries] = useState(readStored);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch { /* modo privado */ }
  }, [entries]);

  // Se guarda un resumen de la prenda (nombre, imagen, talles) para poder
  // mostrar la selección sin descargar el catálogo completo.
  const add = useCallback((item, size = null) => {
    const snapshot = { name: item.name, sizes: item.sizes || [], image: item.image, thumbnail: item.thumbnail, imageSet: item.imageSet };
    setEntries((current) => {
      const existing = current.find((entry) => entry.id === item.id && entry.size === size);
      if (existing) return current.map((entry) => (entry === existing ? { ...entry, qty: Math.min(9, entry.qty + 1) } : entry));
      return [...current, { id: item.id, size, qty: 1, item: snapshot }];
    });
  }, []);
  const update = useCallback((index, patch) => {
    setEntries((current) => current.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)));
  }, []);
  const remove = useCallback((index) => {
    setEntries((current) => current.filter((_, position) => position !== index));
  }, []);
  const clear = useCallback(() => setEntries([]), []);

  const count = entries.reduce((total, entry) => total + entry.qty, 0);
  const value = useMemo(() => ({ entries, count, add, update, remove, clear, open, setOpen }), [entries, count, add, update, remove, clear, open]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection() {
  const context = useContext(SelectionContext);
  if (!context) throw new Error("useSelection debe usarse dentro de SelectionProvider");
  return context;
}
