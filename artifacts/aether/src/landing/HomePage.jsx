import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import { BrandLogo } from "../fashion/BrandLogo.jsx";
import { ACTIVE_SEASON, activePromotions, warnEmptySection } from "../site-config.js";
import { EditorialFooter } from "./EditorialFooter.jsx";
import { GarmentRack } from "./GarmentRack.jsx";
import { HeroLooks, lookLabel, orderedPieces } from "./HeroLooks.jsx";
import { LookSheet } from "./LookSheet.jsx";
import { Marquee } from "./Marquee.jsx";
import { SelectionButton, SelectionDrawer } from "./SelectionDrawer.jsx";
import { SocialFabs } from "./SocialFabs.jsx";
import { LOOK_FAMILIES } from "./looks.js";
import { engineFetch } from "../embed/base.js";
import { scopeLanding, useScope } from "../embed/scope.jsx";
import "./landing.css";

function familyLabel(id) {
  return LOOK_FAMILIES.find((family) => family.id === id)?.label || "";
}

// Looks y perchero armados en el servidor (/api/landing, precargado desde
// index.html): la landing no descarga ni procesa el catálogo completo.
function useLandingData() {
  const [state, setState] = useState({ loading: true, data: null });
  useEffect(() => {
    let alive = true;
    engineFetch("/api/landing")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data) => alive && setState({ loading: false, data }))
      .catch(() => alive && setState({ loading: false, data: null }));
    return () => { alive = false; };
  }, []);
  return state;
}

const EMPTY_LOOKS = {};

// Fotos en modelo y prendas apiladas no se mezclan en una misma fila: si una
// familia tiene al menos 3 looks con foto aprobada, se muestran sólo esos.
function preferModelLooks(looks) {
  return Object.fromEntries(Object.entries(looks).map(([family, list]) => {
    const withModel = list.filter((look) => look.model);
    return [family, withModel.length >= 3 ? withModel : list.map(({ model, ...look }) => look)];
  }));
}

export function HomePage({ navigate }) {
  const { allowed } = useScope();
  const { loading, data: rawData } = useLandingData();
  // En una categoría de Odoo: sólo looks y perchero con prendas de esa categoría.
  const data = useMemo(() => scopeLanding(rawData, allowed), [rawData, allowed]);
  const looksByFamily = useMemo(() => (data?.looks ? preferModelLooks(data.looks) : EMPTY_LOOKS), [data]);
  const allLooks = useMemo(
    () => LOOK_FAMILIES.flatMap((family) => (looksByFamily[family.id] || []).map((look, index) => ({ ...look, title: lookLabel(look, index), eyebrow: familyLabel(family.id) }))),
    [looksByFamily],
  );
  const rackItems = useMemo(() => data?.rack || [], [data]);
  const promotions = useMemo(() => activePromotions(data?.activeCollections || []), [data]);
  const [sheet, setSheet] = useState(null);
  const mainRef = useRef(null);

  if (!loading) {
    warnEmptySection("La fila de la temporada", allLooks);
    warnEmptySection("El perchero", rackItems);
  }

  const relatedFor = useCallback((exclude, family) => allLooks
    .filter((look) => look.id !== exclude && (!family || look.family === family))
    .slice(0, 4), [allLooks]);

  const openLook = useCallback((look) => {
    const full = allLooks.find((candidate) => candidate.id === look.id) || look;
    setSheet({ title: full.title, eyebrow: `${full.eyebrow} · ${ACTIVE_SEASON}`, pieces: orderedPieces(full), model: full.model || null, look: full, related: relatedFor(full.id, full.family) });
  }, [allLooks, relatedFor]);

  const openItem = useCallback((item) => {
    const look = allLooks.find((candidate) => candidate.pieces.some((piece) => piece.id === item.id));
    setSheet({
      title: item.name,
      eyebrow: ACTIVE_SEASON,
      pieces: [item],
      related: look ? [look, ...relatedFor(look.id, look.family)].slice(0, 4) : relatedFor(null),
    });
  }, [allLooks, relatedFor]);

  const closeSheet = useCallback(() => setSheet(null), []);

  return (
    <div className="ed-page">
      <a className="ed-skip" href="#contenido">Saltar al contenido</a>
      <header className="ed-nav">
        <button className="ed-brand" type="button" onClick={() => navigate("/")} aria-label="Fashion Market"><BrandLogo /></button>
        <nav aria-label="Navegación principal">
          <button type="button" onClick={() => navigate("/catalogo")}>Colección</button>
          <a className="ed-nav-optional" href="#perchero">Perchero</a>
          <button type="button" onClick={() => navigate("/probador")}>Probador</button>
        </nav>
      </header>

      <main id="contenido" ref={mainRef}>
        <HeroLooks looksByFamily={looksByFamily} onOpenLook={openLook} loading={loading} />

        <Marquee />

        {promotions.map((promo) => (
          <section className="ed-promo" key={promo.id} aria-label={promo.title}>
            <p className="ed-eyebrow">{promo.title}</p>
            <p>{promo.text}</p>
          </section>
        ))}

        {!loading && <GarmentRack items={rackItems} onOpenItem={openItem} />}

        <section className="ed-tryon" aria-labelledby="ed-tryon-title">
          <p className="ed-eyebrow">Probador virtual</p>
          <h2 id="ed-tryon-title" className="ed-title">Armá tu look y <em>probalo en un modelo.</em></h2>
          <p className="ed-lede">Elegí uno de nuestros ocho modelos IA y mirá cómo se ve la combinación completa.</p>
          <div className="ed-tryon__actions">
            <button className="ed-pill ed-pill--solid" type="button" onClick={() => navigate("/probador")}>Abrí el probador <ArrowRight size={16} /></button>
            <button className="ed-pill" type="button" onClick={() => navigate("/catalogo")}>Ver toda la colección</button>
          </div>
        </section>
      </main>

      <EditorialFooter navigate={navigate} />
      <SocialFabs anchorRef={mainRef} />
      <SelectionButton />
      <SelectionDrawer />
      {sheet && <LookSheet sheet={sheet} onClose={closeSheet} onOpenRelated={openLook} />}
    </div>
  );
}
