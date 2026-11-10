// Widget embebible de Fashion Market para la tienda Odoo.
//
// Registra dos custom elements:
//
//   <fm-moda data-base="/fm" data-assets="https://probador.<dominio>" data-view="home|catalogo|probador">
//     <script type="application/json" class="fm-scope">
//       { "category": "Moda", "products": { "<id prenda>": "/shop/<slug>" } }
//     </script>
//     …links a los productos (SEO y respaldo sin JavaScript)…
//   </fm-moda>
//   → la experiencia completa (looks en modelo, perchero, fichas, colección,
//     "Tu selección", probador con los 8 avatares IA) con las prendas de esa
//     categoría. Navegación interna por hash: #/catalogo, #/probador…
//
//   <fm-probar data-base="/fm" data-garment="<id prenda>" data-moda-url="/shop/category/moda-1">
//   → botón "Probalo en un modelo" para la ficha de producto de Odoo: deja la
//     prenda en el borrador del probador y abre el probador de la categoría.
//
// Todo se pinta dentro de un shadow root: el CSS de Odoo (Bootstrap) no toca el
// diseño y el nuestro no se filtra a la tienda. Las fuentes (@font-face) no
// funcionan dentro de un shadow root: van en fm-fonts.css, en el documento.
import { StrictMode, Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { CatalogProvider } from "../fashion/catalog-context.jsx";
import { HomePage } from "../landing/HomePage.jsx";
import { SelectionProvider } from "../landing/selection.jsx";
import { engineFetch, setEngineBase } from "./base.js";
import { ScopeProvider } from "./scope.jsx";
import "../index.css";
import "../landing/landing.css";
import "./embed.css";

const CollectionPage = lazy(() => import("../landing/CollectionPage.jsx").then((module) => ({ default: module.CollectionPage })));
const TryOnPage = lazy(() => import("../landing/TryOnPage.jsx").then((module) => ({ default: module.TryOnPage })));

// fm-embed.css (estilos de la app, reescritos para :host) y fm-fonts.css
// (@font-face) los genera vite.embed.config.ts junto a este archivo.
const BUILD_ID = typeof __FM_BUILD_ID__ === "string" ? __FM_BUILD_ID__ : "dev";
// import.meta.url en una variable a propósito: con `new URL(\`./${x}\`, import.meta.url)`
// Vite intenta resolver el patrón en build contra src/embed/ (y rompe la URL).
const SCRIPT_URL = import.meta.url;
const assetUrl = (name) => new URL(`./${name}?v=${BUILD_ID}`, SCRIPT_URL).href;

// Reglas que tienen que vivir en el documento: el bloqueo de scroll de la ficha
// de producto se aplica sobre <body>, que está fuera del shadow root.
const DOCUMENT_CSS = `
body.viewer-open { overflow: hidden; }
@media (max-width: 860px) { body.viewer-lock { position: fixed; left: 0; right: 0; width: 100%; overflow: hidden; } }
fm-moda { display: block; min-height: 70vh; }
fm-moda:not(:defined) .fm-seo-list { display: block; }
`;

function installDocumentAssets() {
  if (document.getElementById("fm-document-assets")) return;
  const fonts = document.createElement("link");
  fonts.id = "fm-document-assets";
  fonts.rel = "stylesheet";
  fonts.href = assetUrl("fm-fonts.css");
  const style = document.createElement("style");
  style.textContent = DOCUMENT_CSS;
  document.head.append(fonts, style);
}

function readScope(element) {
  const node = element.querySelector("script.fm-scope[type='application/json']");
  if (!node) return { allowed: null, productUrls: {}, categoryName: "" };
  try {
    const value = JSON.parse(node.textContent || "{}");
    const products = value.products && typeof value.products === "object" ? value.products : null;
    return {
      allowed: products ? new Set(Object.keys(products)) : null,
      productUrls: products || {},
      categoryName: String(value.category || ""),
    };
  } catch {
    return { allowed: null, productUrls: {}, categoryName: "" };
  }
}

// Mount del shadow root con su hoja de estilos; se pinta recién cuando la hoja
// cargó para no mostrar la experiencia sin estilos.
function mountShadow(element) {
  const shadow = element.shadowRoot || element.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = assetUrl("fm-embed.css");
  const container = document.createElement("div");
  container.className = "fm-root";
  container.style.visibility = "hidden";
  const reveal = () => { container.style.visibility = ""; };
  link.addEventListener("load", reveal, { once: true });
  link.addEventListener("error", reveal, { once: true });
  shadow.replaceChildren(link, container);
  return container;
}

function PageFallback() {
  return <p className="status" style={{ padding: 24 }}>Cargando…</p>;
}

// Al cambiar de vista interna se sube al comienzo del widget (no de la página:
// arriba está el header de Odoo).
function ScrollToWidget({ host }) {
  const [location] = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const top = host.getBoundingClientRect().top;
    if (top < 0) host.scrollIntoView({ block: "start" });
  }, [location, host]);
  return null;
}

function EmbedApp({ host, scope, initialView }) {
  const [location, navigate] = useLocation();
  // Primera visita sin hash: la vista que pidió Odoo (subcategorías → colección).
  useEffect(() => {
    if (location === "/" && initialView && initialView !== "home") navigate(`/${initialView}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <ScopeProvider {...scope}>
      <CatalogProvider>
        <SelectionProvider>
          <ScrollToWidget host={host} />
          <Suspense fallback={<PageFallback />}>
            <Switch>
              <Route path="/catalogo"><CollectionPage navigate={navigate} /></Route>
              <Route path="/probador/builder"><TryOnPage navigate={navigate} initialSection="builder" /></Route>
              <Route path="/probador"><TryOnPage navigate={navigate} initialSection="suggestions" /></Route>
              <Route path="/outfit"><Redirect to="/probador/builder" replace /></Route>
              <Route><HomePage navigate={navigate} /></Route>
            </Switch>
          </Suspense>
        </SelectionProvider>
      </CatalogProvider>
    </ScopeProvider>
  );
}

// Alto del header de Odoo cuando queda fijo arriba (sticky/fixed): los headers
// sticky del widget se ubican debajo. Odoo lo renderiza como <header id="top">.
function trackOdooHeader(host) {
  const header = document.querySelector("header#top");
  if (!header || typeof ResizeObserver === "undefined") return () => {};
  const update = () => {
    const position = getComputedStyle(header).position;
    const offset = position === "fixed" || position === "sticky" ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    host.style.setProperty("--fm-top", `${Math.round(offset)}px`);
  };
  const observer = new ResizeObserver(update);
  observer.observe(header);
  window.addEventListener("scroll", update, { passive: true });
  update();
  return () => { observer.disconnect(); window.removeEventListener("scroll", update); };
}

class FmModa extends HTMLElement {
  connectedCallback() {
    if (this._root) return;
    this._untrack = trackOdooHeader(this);
    setEngineBase(this.dataset.base || "", this.dataset.assets || "");
    installDocumentAssets();
    const scope = readScope(this);
    const view = ["catalogo", "probador"].includes(this.dataset.view) ? this.dataset.view : "home";
    this._root = createRoot(mountShadow(this));
    this._root.render(
      <StrictMode>
        <Router hook={useHashLocation}>
          <EmbedApp host={this} scope={scope} initialView={view} />
        </Router>
      </StrictMode>,
    );
  }

  disconnectedCallback() {
    this._untrack?.();
    this._root?.unmount();
    this._root = null;
  }
}

// Botón de la ficha de producto de Odoo. Pide la prenda al catálogo público
// recién al tocarlo (para saber su `part`) y la deja en el borrador del
// probador, el mismo que usa "Agregar a mi outfit".
function ProbarButton({ garmentId, modaUrl }) {
  const [busy, setBusy] = useState(false);
  const label = busy ? "Abriendo el probador…" : "Probalo en un modelo";
  const onClick = async () => {
    setBusy(true);
    try {
      const { addToDraft } = await import("../fashion/outfit-draft.js");
      const response = await engineFetch("/api/catalog");
      const items = response.ok ? await response.json() : [];
      const item = items.find((candidate) => candidate.id === garmentId);
      if (item) addToDraft(item);
    } catch { /* sin borrador: el probador abre igual */ }
    window.location.href = `${modaUrl}#/probador/builder`;
  };
  return (
    <div className="fm-probar">
      <button className="ed-pill ed-pill--solid" type="button" onClick={onClick} disabled={busy}>{label}</button>
      <p className="fm-probar__note">Elegí uno de nuestros ocho modelos IA y mirá cómo te queda el look completo.</p>
    </div>
  );
}

class FmProbar extends HTMLElement {
  connectedCallback() {
    if (this._root || !this.dataset.garment) return;
    setEngineBase(this.dataset.base || "", this.dataset.assets || "");
    installDocumentAssets();
    this._root = createRoot(mountShadow(this));
    this._root.render(<ProbarButton garmentId={this.dataset.garment} modaUrl={this.dataset.modaUrl || "/shop"} />);
  }

  disconnectedCallback() {
    this._root?.unmount();
    this._root = null;
  }
}

if (!customElements.get("fm-moda")) customElements.define("fm-moda", FmModa);
if (!customElements.get("fm-probar")) customElements.define("fm-probar", FmProbar);
