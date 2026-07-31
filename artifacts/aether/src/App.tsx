import React from 'react';
import { Route, Switch } from 'wouter';
import { useLenis } from './aether/useLenis';
import Intro from './aether/Intro';
import { CatalogProvider } from './fashion/catalog-context.jsx';
import { Landing, CatalogPage } from './fashion/FashionMarket.jsx';
import { OutfitBuilderPage } from './fashion/OutfitBuilderPage.jsx';
import { AdminPage } from './fashion/AdminPage.jsx';

export default function App() {
  useLenis();

  return (
    <CatalogProvider>
      <Switch>
        <Route path="/catalogo" component={CatalogPage} />
        <Route path="/outfit" component={OutfitBuilderPage} />
        <Route path="/admin" component={AdminPage} />
        <Route>
          <Landing intro={<Intro />} />
        </Route>
      </Switch>
    </CatalogProvider>
  );
}
