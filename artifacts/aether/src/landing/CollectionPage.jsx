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
import { useScope } from "../embed/scope.jsx";
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

// Precio con la moneda del sitio de Odoo ({ symbol, position, digits }).
export function formatShopPrice(value, currency) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const digits = Number.isInteger(currency?.digits) ? currency.digits : 0;
  const number = value.toLocaleString("es-PY", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const symbol = currency?.symbol || "";
  if (!symbol) return number;
  return currency.position === "before" ? `${symbol} ${number}` : `${number} ${symbol}`;
}

// Colección dentro de Odoo: todos los productos de la categoría en el orden de la
// tienda. Las prendas del motor abren su ficha (probador); el resto enlaza a su
// producto. `cat`: subcategoría activa (null = todas); `type`: tipo de prenda.
export function shopCollection(shopItems, catalogItems, cat, type) {
  const byCode = new Map(catalogItems.map((item) => [item.id, item]));
  return shopItems
    .filter((entry) => cat == null || (entry.cats || []).includes(cat))
    .map((entry) => ({ entry, garment: entry.code ? byCode.get(entry.code) || null : null }))
    .filter(({ garment }) => type === "all" || garment?.part === type);
}

function ShopCard({ entry, currency }) {
  const price = formatShopPrice(entry.price, currency);
  const base = formatShopPrice(entry.basePrice, currency);
  return (
    <a className="public-product-card" href={entry.url}>
      <div><img src={entry.image} alt="" loading="lazy" /></div>
      <h2>{entry.name}</h2>
      {price && <small>{base && <s>{base}</s>}{price}</small>}
    </a>
  );
}

export function CollectionPage({ navigate }) {
  const { items, loading, error } = useCatalog();
  const { embedded, shopItems, subcategories, activeSubcategory, currency } = useScope();
  const [activeCat, setActiveCat] = useState(activeSubcategory);
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
  const shopList = useMemo(
    () => (shopItems ? shopCollection(shopItems, items, activeCat, activeType) : null),
    [shopItems, items, activeCat, activeType],
  );
  const priceByCode = useMemo(
    () => new Map((shopItems || []).filter((entry) => entry.code).map((entry) => [entry.code, formatShopPrice(entry.price, currency)])),
    [shopItems, currency],
  );
  const garmentCard = (item) => (
    <button className="public-product-card" type="button" key={item.id} onClick={() => product.open(item.id)} aria-label={`Ver detalles de ${item.name}`}>
      <div><GarmentImage item={item} sizes="(max-width: 640px) 50vw, (max-width: 1000px) 33vw, 25vw" /><i style={{ background: item.color }} /></div>
      <p>{SEASON_LABELS[item.season] || item.season} · {TYPE_MAP[item.part]?.singular}</p>
      <h2>{item.name}</h2>
      <small>{priceByCode.get(item.id) || `${MATERIAL_LABELS[item.material] || item.material} · ${SILHOUETTE_LABELS[item.silhouette] || item.silhouette}`}</small>
    </button>
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
        {shopItems && subcategories.length > 0 && (
          <nav className="catalog-filters catalog-filters--collections" aria-label="Colecciones">
            {[{ id: null, name: "Todo" }, ...subcategories].map((cat) => (
              <button key={cat.id ?? "all"} className={activeCat === cat.id ? "active" : ""} type="button" aria-pressed={activeCat === cat.id} onClick={() => setActiveCat(cat.id)}>{cat.name}</button>
            ))}
          </nav>
        )}
        <nav className="catalog-filters" aria-label="Filtrá la colección">
          {TYPES.map((type) => (
            <button key={type.id} className={activeType === type.id ? "active" : ""} type="button" aria-pressed={activeType === type.id} onClick={() => setActiveType(type.id)}>{type.label}</button>
          ))}
        </nav>
        {error && <p className="status error">{error}</p>}
        {loading ? <p className="status">Cargando la colección…</p> : shopList ? (shopList.length ? (
          <div className="public-product-grid">
            {shopList.map(({ entry, garment }) => (garment ? garmentCard(garment) : <ShopCard key={`odoo-${entry.id}`} entry={entry} currency={currency} />))}
          </div>
        ) : <div className="catalog-empty"><h2>No hay productos con ese filtro.</h2><p>Probá con otra colección o con «Todo».</p></div>) : visibleItems.length ? (
          <div className="public-product-grid">
            {visibleItems.map(garmentCard)}
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
      {!embedded && <SiteFooter tagline="Una selección para descubrir a tu ritmo." />}
      <SelectionButton />
      <SelectionDrawer />
    </div>
  );
}
