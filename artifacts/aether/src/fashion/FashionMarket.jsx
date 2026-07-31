import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowCounterClockwise, ArrowRight, Heart, List, SlidersHorizontal, Sparkle, X } from "@phosphor-icons/react";
import { useCatalog } from "./catalog-context.jsx";
import { ProductSheet } from "./ProductSheet.jsx";
import { VirtualTryOn } from "./virtual-tryon.jsx";
import "./styles.css";
import "./shop.css";

const CATEGORIES = [
  ["upperbody", "Prendas superiores"],
  ["wholebody_up", "Abrigos"],
  ["lowerbody", "Prendas inferiores"],
  ["accessories_up", "Accesorios"],
];

const DEMO_THEMES = {
  crema: { ink: "#2b211e", cream: "#f6f1e8", accent: "#6e2b35", muted: "#e8dfd0", deep: "#6e2b35", accentInk: "#f6f1e8" },
  oliva: { ink: "#191b17", cream: "#f3eee5", accent: "#d7ff43", muted: "#ccd1ba", deep: "#5a6a32", accentInk: "#191b17" },
  vino: { ink: "#24191c", cream: "#f4ece8", accent: "#ffb6c8", muted: "#d7c0c5", deep: "#7c3140", accentInk: "#24191c" },
  cobalto: { ink: "#111c38", cream: "#f0f2ed", accent: "#ffcc33", muted: "#bfc9d8", deep: "#22355f", accentInk: "#111c38" },
};

const DEMO_DEFAULTS = {
  brand: "FASHION MARKET",
  eyebrow: "Nueva temporada · Otoño – Invierno 2026",
  headline: "Tu estilo,",
  highlight: "mejor elegido.",
  description: "Descubrí la colección de esta temporada, guardá tus piezas favoritas y probá combinaciones pensadas para vos.",
  theme: "crema",
  type: "editorial",
  hero: "/fashion/hero-olive.png",
};

export function Landing({ intro }) {
  const [, navigate] = useLocation();
  const [demo, setDemo] = useState(DEMO_DEFAULTS);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const activeTheme = DEMO_THEMES[demo.theme];
  return (
    <div
      className={`retail-landing type-${demo.type}`}
      style={{ "--ink": activeTheme.ink, "--cream": activeTheme.cream, "--acid": activeTheme.accent, "--muted": activeTheme.muted, "--deep": activeTheme.deep, "--accent-ink": activeTheme.accentInk }}
    >
      {intro}
      <header className="retail-nav">
        <button className="brand-mark" type="button" onClick={() => navigate("/")} aria-label="Inicio">
          <span>{demo.brand || "FASHION MARKET"}</span><small>By Marketplace</small>
        </button>
        <nav aria-label="Navegación principal">
          <a href="#coleccion">Colección</a>
          <a href="#experiencia">Experiencia</a>
        </nav>
        <div className="retail-nav-actions">
          <button className="icon-action" type="button" aria-label="Favoritos"><Heart size={20} /></button>
          <button className="retail-outline-button" type="button" onClick={() => navigate("/outfit")}>Armá tu outfit</button>
          <button className="retail-outline-button" type="button" onClick={() => navigate("/catalogo")}>Ver catálogo</button>
        </div>
      </header>

      <button className="demo-customize-trigger" type="button" onClick={() => setCustomizerOpen(true)}>
        <SlidersHorizontal size={18} /> Personalizar demo
      </button>

      <aside className={`demo-customizer${customizerOpen ? " is-open" : ""}`} aria-label="Personalizar la landing" aria-hidden={!customizerOpen}>
        <div className="demo-customizer__header">
          <div><p>Editor visual</p><h2>Hacela tuya</h2></div>
          <button type="button" onClick={() => setCustomizerOpen(false)} aria-label="Cerrar editor"><X size={20} /></button>
        </div>
        <div className="demo-customizer__body">
          <label><span>Nombre de marca</span><input value={demo.brand} maxLength={18} onChange={(event) => setDemo({ ...demo, brand: event.target.value.toUpperCase() })} /></label>
          <label><span>Texto superior</span><input value={demo.eyebrow} onChange={(event) => setDemo({ ...demo, eyebrow: event.target.value })} /></label>
          <label><span>Título</span><input value={demo.headline} onChange={(event) => setDemo({ ...demo, headline: event.target.value })} /></label>
          <label><span>Frase destacada</span><input value={demo.highlight} onChange={(event) => setDemo({ ...demo, highlight: event.target.value })} /></label>
          <label><span>Descripción</span><textarea rows="4" value={demo.description} onChange={(event) => setDemo({ ...demo, description: event.target.value })} /></label>
          <fieldset>
            <legend>Paleta</legend>
            <div className="theme-swatches">
              {Object.entries(DEMO_THEMES).map(([name, theme]) => (
                <button className={demo.theme === name ? "active" : ""} type="button" key={name} onClick={() => setDemo({ ...demo, theme: name })}>
                  <i style={{ background: theme.ink }} /><i style={{ background: theme.cream }} /><i style={{ background: theme.accent }} /><span>{name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Tipografía</legend>
            <div className="segmented-control">
              <button className={demo.type === "editorial" ? "active" : ""} type="button" onClick={() => setDemo({ ...demo, type: "editorial" })}>Editorial</button>
              <button className={demo.type === "modern" ? "active" : ""} type="button" onClick={() => setDemo({ ...demo, type: "modern" })}>Moderna</button>
            </div>
          </fieldset>
          <fieldset>
            <legend>Imagen principal</legend>
            <div className="image-picker">
              {[
                ["/fashion/hero-olive.png", "Arena"],
                ["/fashion/look-camel.png", "Camel"],
                ["/fashion/look-burgundy.png", "Vino"],
              ].map(([src, label]) => <button className={demo.hero === src ? "active" : ""} type="button" key={src} onClick={() => setDemo({ ...demo, hero: src })}><img src={src} alt="" /><span>{label}</span></button>)}
            </div>
          </fieldset>
        </div>
        <div className="demo-customizer__footer">
          <button type="button" onClick={() => setDemo(DEMO_DEFAULTS)}><ArrowCounterClockwise size={15} /> Restablecer</button>
          <button type="button" onClick={() => setCustomizerOpen(false)}>Aplicar cambios</button>
        </div>
      </aside>
      {customizerOpen && <button className="demo-customizer-backdrop" type="button" onClick={() => setCustomizerOpen(false)} aria-label="Cerrar editor" />}

      <main>
        <section className="retail-hero">
          <div className="hero-copy">
            <p className="retail-kicker"><Sparkle size={15} weight="fill" /> {demo.eyebrow}</p>
            <h1>{demo.headline}<br /><em>{demo.highlight}</em></h1>
            <p className="hero-description">{demo.description}</p>
            <div className="hero-actions">
              <button className="retail-primary-button" type="button" onClick={() => navigate("/catalogo")}>
                Explorar el catálogo <ArrowRight size={18} />
              </button>
              <a className="retail-text-link" href="#coleccion">Explorar colección</a>
            </div>
            <div className="hero-proof">
              <span><strong>01</strong> Descubrí las prendas</span>
              <span><strong>02</strong> Armá tu outfit</span>
              <span><strong>03</strong> Probalo en tu modelo</span>
            </div>
          </div>

          <div className="hero-editorial" aria-label="Selección editorial de moda">
            <div className="editorial-card editorial-main">
              <img src={demo.hero} alt="Look editorial de la colección" />
              <span className="editorial-label">Nueva colección · 26</span>
            </div>
            <div className="editorial-card editorial-small">
              <img src="/fashion/look-burgundy.png" alt="Segundo look de la colección" />
            </div>
            <p className="vertical-note">CURADURÍA PERSONAL · TODOS LOS DÍAS</p>
          </div>
        </section>

        <section className="collection-strip" id="coleccion">
          <div>
            <p className="retail-kicker">Selección de temporada</p>
            <h2>Encontrá tu próxima pieza esencial.</h2>
          </div>
          <div className="collection-categories">
            {CATEGORIES.map(([id, label], index) => (
              <button key={id} type="button" onClick={() => navigate(`/catalogo?cat=${id}`)}>
                <span>0{index + 1}</span>{label}<ArrowRight size={16} />
              </button>
            ))}
          </div>
        </section>

        <section className="customize-cta" id="experiencia">
          <p className="retail-kicker"><Sparkle size={15} weight="fill" /> Probador virtual</p>
          <h2>Probá la colección en vos,<br /><em>antes de elegir.</em></h2>
          <p>Elegí un modelo o subí tu foto, y mirá cómo te quedan las combinaciones de la temporada.</p>
          <button className="retail-primary-button" type="button" onClick={() => navigate("/catalogo")}>
            Ir al probador <ArrowRight size={18} />
          </button>
        </section>

      </main>

      <footer className="retail-footer">
        <div className="brand-mark"><span>FASHION MARKET</span><small>By Marketplace</small></div>
        <p>Una nueva forma de descubrir, combinar y comprar moda.</p>
        <button type="button" onClick={() => navigate("/catalogo")}>Ver el catálogo <ArrowRight size={15} /></button>
      </footer>
    </div>
  );
}

// Catálogo público: la ficha de producto es de solo lectura; el editor de
// prendas vive únicamente en /admin.
export function CatalogPage() {
  const [, navigate] = useLocation();
  const { items, loading, error } = useCatalog();
  // Pila de fichas abiertas: navegar por "Combina con" apila, "Volver" desapila.
  const [sheetStack, setSheetStack] = useState([]);
  const initialSection = useMemo(() => {
    const requested = new URLSearchParams(window.location.search).get("cat");
    return ["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes", "outfits"].includes(requested) ? requested : null;
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const selectedId = sheetStack[sheetStack.length - 1] || null;
  const selectedItem = items.find((item) => item.id === selectedId) || null;

  return (
    <div className={`app-shell retail-wardrobe${selectedItem ? " has-selection" : ""}`}>
      <header className="wardrobe-topbar">
        <button className="brand-mark" type="button" onClick={() => navigate("/")}><span>FASHION MARKET</span><small>By Marketplace</small></button>
        <p>Catálogo · Otoño – Invierno 2026</p>
        <div className="topbar-actions">
          <button className="retail-outline-button" type="button" onClick={() => navigate("/outfit")}>Armá tu outfit</button>
          <button className="retail-outline-button" type="button" onClick={() => navigate("/")}><List size={17} /> Volver a la tienda</button>
        </div>
      </header>
      {error && <p className="status error">{error}</p>}
      {loading
        ? <p className="status">Preparando el catálogo…</p>
        : <VirtualTryOn items={items} onOpenItem={(id) => setSheetStack([id])} initialSection={initialSection} />}

      {selectedItem && (
        <ProductSheet
          item={selectedItem}
          items={items}
          onClose={() => setSheetStack([])}
          onOpen={(id) => setSheetStack((stack) => [...stack, id])}
          onBack={sheetStack.length > 1 ? () => setSheetStack((stack) => stack.slice(0, -1)) : null}
        />
      )}
    </div>
  );
}
