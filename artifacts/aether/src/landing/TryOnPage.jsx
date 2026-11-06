import { List } from "@phosphor-icons/react";
import { BrandLogo } from "../fashion/BrandLogo.jsx";
import { VirtualTryOn } from "../fashion/virtual-tryon.jsx";
import { useCatalog } from "../fashion/catalog-context.jsx";
import "../fashion/styles.css";

export function TryOnPage({ navigate, initialSection = "suggestions" }) {
  const { items, loading, error } = useCatalog();
  return (
    <div className="app-shell retail-wardrobe">
      <header className="wardrobe-topbar">
        <button className="brand-mark" type="button" onClick={() => navigate("/")}><BrandLogo /><small>By Marketplace</small></button>
        <p>Probador virtual</p>
        <button className="retail-outline-button" type="button" onClick={() => navigate("/")}><List size={17} /> Volvé al inicio</button>
      </header>
      {error && <p className="status error">{error}</p>}
      {loading
        ? <p className="status">Preparando el probador virtual…</p>
        : <VirtualTryOn items={items} initialSection={initialSection} />}
    </div>
  );
}
