import { Suspense, lazy, useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useGtmPageViews } from "./analytics/useGtmPageViews";
import { CatalogProvider } from "./fashion/catalog-context.jsx";
import { HomePage } from "./landing/HomePage.jsx";
import { SelectionProvider } from "./landing/selection.jsx";

// El panel se carga aparte: su código (editor, importación por lotes) no entra
// en el bundle público.
const AdminPage = lazy(() => import("./fashion/AdminPage.jsx"));
// Colección y probador (ficha, sugerencias, vestidor) también van aparte: la
// landing carga sólo lo suyo.
const CollectionPage = lazy(() => import("./landing/CollectionPage.jsx").then((module) => ({ default: module.CollectionPage })));
const TryOnPage = lazy(() => import("./landing/TryOnPage.jsx").then((module) => ({ default: module.TryOnPage })));

function PageFallback() {
  return <p className="status" style={{ padding: 24 }}>Cargando…</p>;
}

function AdminRoute() {
  return (
    <CatalogProvider scope="admin">
      <Suspense fallback={<p className="status">Cargando panel…</p>}>
        <AdminPage />
      </Suspense>
    </CatalogProvider>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

export default function App() {
  useGtmPageViews();
  const [, navigate] = useLocation();
  const tryOnSection =
    new URLSearchParams(window.location.search).get("seccion") === "builder" ? "builder" : "suggestions";

  return (
    <CatalogProvider>
      <SelectionProvider>
      <ScrollToTop />
      <Suspense fallback={<PageFallback />}>
      <Switch>
        <Route path="/catalogo">
          <CollectionPage navigate={navigate} />
        </Route>
        <Route path="/probador">
          <TryOnPage navigate={navigate} initialSection={tryOnSection} />
        </Route>
        <Route path="/outfit">
          <Redirect to="/probador?seccion=builder" replace />
        </Route>
        <Route path="/admin" component={AdminRoute} />
        <Route>
          <HomePage navigate={navigate} />
        </Route>
      </Switch>
      </Suspense>
      </SelectionProvider>
    </CatalogProvider>
  );
}
