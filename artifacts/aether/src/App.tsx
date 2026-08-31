import React from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useLenis } from "./aether/useLenis";
import { useGtmPageViews } from "./analytics/useGtmPageViews";
import { CatalogProvider } from "./fashion/catalog-context.jsx";
import { AdminPage } from "./fashion/AdminPage.jsx";
import { App as FashionMarketApp } from "./fashion/StandaloneApp.jsx";

const VIEW_PATHS: Record<string, string> = {
  home: "/",
  collection: "/catalogo",
  wardrobe: "/probador",
  admin: "/admin",
};

type FashionRouteProps = {
  view: "home" | "collection" | "wardrobe";
  tryOnInitialSection?: "suggestions" | "builder" | "profile";
};

function FashionRoute({ view, tryOnInitialSection }: FashionRouteProps) {
  const [, navigate] = useLocation();

  return (
    <FashionMarketApp
      initialView={view}
      tryOnInitialSection={tryOnInitialSection}
      onNavigate={(nextView: string) => navigate(VIEW_PATHS[nextView] || "/")}
    />
  );
}

export default function App() {
  useLenis();
  useGtmPageViews();

  return (
    <CatalogProvider>
      <Switch>
        <Route path="/catalogo">
          <FashionRoute view="collection" />
        </Route>
        <Route path="/probador">
          <FashionRoute
            view="wardrobe"
            tryOnInitialSection={
              new URLSearchParams(window.location.search).get("seccion") === "builder"
                ? "builder"
                : "suggestions"
            }
          />
        </Route>
        <Route path="/outfit">
          <Redirect to="/probador?seccion=builder" replace />
        </Route>
        <Route path="/admin" component={AdminPage} />
        <Route>
          <FashionRoute view="home" />
        </Route>
      </Switch>
    </CatalogProvider>
  );
}
