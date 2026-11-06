import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "../fashion/BrandLogo.jsx";
import { GarmentImage } from "../fashion/GarmentImage.jsx";
import { ProductSheet } from "../fashion/ProductSheet.jsx";
import { MATERIAL_LABELS, SEASON_LABELS, SILHOUETTE_LABELS } from "../fashion/format.js";
import { useCatalog } from "../fashion/catalog-context.jsx";
import { SEASON_LABEL } from "../site-config.js";
import { TYPES, TYPE_MAP, sortForCatalog } from "./catalog-types.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { themeStyle } from "./theme.js";
import { SelectionButton, SelectionDrawer } from "./SelectionDrawer.jsx";
import "./landing.css";
import "../fashion/styles.css";

// Ficha abierta como pila de ids (para volver desde una sugerencia) y
// sincronizada con ?producto=<id> para que el enlace sea compartible.
function useProductTrail() {
  const [trail, setTrail] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("producto");
    return fromUrl ? [fromUrl] : [];
  });
  const open = (id) => setTrail((current) => (current[current.length - 1] === id ? current : [...current, id]));
  const close = () => setTrail([]);
  const back = () => setTrail((current) => current.slice(0, -1));
  return { trail, open, close, back };
}

export function CollectionPage({ navigate }) {
  const { items, loading, error } = useCatalog();
  const initialType = new URLSearchParams(window.location.search).get("tipo");
  const [activeType, setActiveType] = useState(TYPE_MAP[initialType] ? initialType : "all");
  const product = useProductTrail();
  const selectedProduct = items.find((item) => item.id === product.trail[product.trail.length - 1]) || null;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedProduct) url.searchParams.set("producto", selectedProduct.id);
    else url.searchParams.delete("producto");
    window.history.replaceState(null, "", url);
  }, [selectedProduct]);

  const visibleItems = useMemo(
    () => sortForCatalog(activeType === "all" ? items : items.filter((item) => item.part === activeType), activeType),
    [activeType, items],
  );

  return (
    <div className="retail-landing retail-subpage type-editorial" style={themeStyle}>
      <header className="retail-nav retail-subnav">
        <button className="brand-mark" type="button" onClick={() => navigate("/")} aria-label="Volvé al inicio">
          <BrandLogo /><small>By Marketplace</small>
        </button>
        <nav aria-label="Navegación de la colección">
          <button type="button" onClick={() => navigate("/")}>Inicio</button>
          <button type="button" onClick={() => navigate("/probador")}>Probador</button>
        </nav>
        <button className="retail-outline-button is-current" type="button" aria-current="page">Colección</button>
      </header>
      <main className="public-catalog">
        <header className="public-catalog__heading">
          <div><p className="retail-kicker">{SEASON_LABEL}</p><h1>Conocé la colección.</h1></div>
          <p>Explorá las prendas disponibles esta temporada. Después vas a poder combinarlas libremente desde el probador.</p>
        </header>
        <nav className="catalog-filters" aria-label="Filtrá la colección">
          {TYPES.map((type) => (
            <button key={type.id} className={activeType === type.id ? "active" : ""} type="button" aria-pressed={activeType === type.id} onClick={() => setActiveType(type.id)}>{type.label}</button>
          ))}
        </nav>
        {error && <p className="status error">{error}</p>}
        {loading ? <p className="status">Cargando la colección…</p> : visibleItems.length ? (
          <div className="public-product-grid">
            {visibleItems.map((item) => (
              <button className="public-product-card" type="button" key={item.id} onClick={() => product.open(item.id)} aria-label={`Ver detalles de ${item.name}`}>
                <div><GarmentImage item={item} sizes="(max-width: 640px) 50vw, (max-width: 1000px) 33vw, 25vw" /><i style={{ background: item.color }} /></div>
                <p>{SEASON_LABELS[item.season] || item.season} · {TYPE_MAP[item.part]?.singular}</p>
                <h2>{item.name}</h2>
                <small>{MATERIAL_LABELS[item.material] || item.material} · {SILHOUETTE_LABELS[item.silhouette] || item.silhouette}</small>
              </button>
            ))}
          </div>
        ) : <div className="catalog-empty"><h2>Esta categoría se está preparando.</h2><p>Volvé pronto para conocer las próximas piezas.</p></div>}
      </main>
      {selectedProduct && (
        <ProductSheet
          item={selectedProduct}
          items={items}
          onClose={product.close}
          onOpen={product.open}
          onBack={product.trail.length > 1 ? product.back : undefined}
        />
      )}
      <SiteFooter tagline="Una selección para descubrir a tu ritmo." />
      <SelectionButton />
      <SelectionDrawer />
    </div>
  );
}
