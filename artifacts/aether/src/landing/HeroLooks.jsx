import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { GarmentImage } from "../fashion/GarmentImage.jsx";
import { SEASON_SHORT_LABEL } from "../site-config.js";
import { lookSwatches } from "./color-names.js";
import { LOOK_FAMILIES } from "./looks.js";

const PART_ORDER = { accessories_up: 0, wholebody_up: 1, upperbody: 2, wholebody: 3, lowerbody: 4, shoes: 5 };
const SLOT = { accessories_up: "accessory", wholebody_up: "top", upperbody: "top", wholebody: "dress", lowerbody: "bottom", shoes: "shoes" };
const VISIBLE_RADIUS = 3;

// "Primavera – Verano '26" → dos líneas en mobile (en escritorio va en una).
function SeasonTitle() {
  const [first, ...rest] = SEASON_SHORT_LABEL.split(" – ");
  if (!rest.length) return SEASON_SHORT_LABEL;
  return <><span className="ed-display__line">{first} –</span> <span className="ed-display__line">{rest.join(" – ")}</span></>;
}

export const lookLabel = (look, index) => `Look ${String(index + 1).padStart(2, "0")}`;

export function orderedPieces(look) {
  return [...look.pieces].sort((a, b) => (PART_ORDER[a.part] ?? 9) - (PART_ORDER[b.part] ?? 9));
}

function isMobileLayout() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

// Foto del look sobre un avatar IA (scripts/generate-look-models.mjs) con los
// puntos numerados de cada prenda. El marco tiene la proporción de la imagen,
// así los puntos (0–1) caen sobre la prenda a cualquier tamaño.
export function LookModelFrame({ look, pieces, sizes, priority = false, showSpots = false, onSpot, activeId }) {
  const { model } = look;
  const set = model.imageSet;
  // Los puntos aparecen cuando la foto ya cargó (si no, flotan sobre el vacío).
  const [loaded, setLoaded] = useState(false);
  const onImageRef = useCallback((node) => { if (node?.complete && node.naturalWidth) setLoaded(true); }, []);
  return (
    <span className="ed-model-frame" style={{ aspectRatio: `${set.width} / ${set.height}` }}>
      <GarmentImage item={{ imageSet: set, name: model.name }} alt={`Look completo en modelo virtual: ${pieces.map((piece) => piece.name).join(", ")}`} sizes={sizes} priority={priority} ref={onImageRef} onLoad={() => setLoaded(true)} />
      {showSpots && loaded && pieces.map((piece, index) => {
        const spot = model.hotspots.find((entry) => entry.garmentId === piece.id);
        if (!spot) return null;
        const style = { left: `${spot.x * 100}%`, top: `${spot.y * 100}%` };
        const className = `ed-spot${activeId === piece.id ? " is-active" : ""}`;
        return onSpot
          ? <button key={piece.id} type="button" className={className} style={style} onClick={() => onSpot(index)} aria-label={`${index + 1}: ver ${piece.name}`}>{index + 1}</button>
          : <span key={piece.id} className={className} style={style} aria-hidden="true">{index + 1}</span>;
      })}
    </span>
  );
}

// Un look: la foto en modelo si existe; si no, prendas apiladas como silueta.
function LookFigure({ look, priority, active }) {
  const pieces = orderedPieces(look);
  if (look.model) {
    return (
      <span className="ed-look-figure ed-look-figure--model">
        <LookModelFrame look={look} pieces={pieces} sizes="(max-width: 760px) 72vw, 420px" priority={priority} showSpots={active} />
      </span>
    );
  }
  const isDress = pieces.some((piece) => piece.garmentType === "dress" || piece.part === "wholebody");
  return (
    <span className={`ed-look-figure${isDress ? " is-dress" : ""}`}>
      {pieces.map((piece) => {
        const slot = isDress && piece.part === "upperbody" ? "dress" : SLOT[piece.part] || "top";
        return (
          <span className={`ed-look-piece ed-look-piece--${slot}`} key={piece.id}>
            <GarmentImage item={piece} alt={piece.name} sizes="(max-width: 760px) 45vw, 240px" priority={priority} />
          </span>
        );
      })}
    </span>
  );
}

export function HeroLooks({ looksByFamily, onOpenLook, loading = false }) {
  const families = LOOK_FAMILIES.filter((family) => looksByFamily[family.id]?.length);
  const [familyId, setFamilyId] = useState(families[0]?.id);
  const looks = useMemo(() => looksByFamily[familyId] || [], [looksByFamily, familyId]);
  // Arranca en el look del medio: la fila queda llena a los dos lados.
  const startIndex = (list) => (isMobileLayout() ? 0 : Math.floor(list.length / 2));
  const [active, setActive] = useState(() => startIndex(looksByFamily[families[0]?.id] || []));
  const hoverTimer = useRef(null);
  const pointer = useRef(null);
  const trackRef = useRef(null);

  useEffect(() => { setActive(startIndex(looks)); trackRef.current?.scrollTo?.({ left: 0 }); }, [looks]);
  useEffect(() => { if (!families.find((family) => family.id === familyId) && families[0]) setFamilyId(families[0].id); }, [families, familyId]);

  const go = useCallback((index) => {
    const next = Math.max(0, Math.min(looks.length - 1, index));
    setActive(next);
    if (isMobileLayout()) {
      const node = trackRef.current?.children[next];
      node?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [looks.length]);

  const onKeyDown = (event) => {
    if (event.key === "ArrowRight") { event.preventDefault(); go(active + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(active - 1); }
    // preventDefault: si no, el mismo Enter activa el botón "Cerrar" que recibe el foco al abrir la ficha.
    if (event.key === "Enter" && looks[active] && event.target === event.currentTarget) { event.preventDefault(); onOpenLook(looks[active], active); }
  };

  // Swipe en escritorio táctil / trackpad (en mobile manda el scroll-snap).
  const onPointerDown = (event) => { pointer.current = { x: event.clientX, y: event.clientY }; };
  const onPointerUp = (event) => {
    const start = pointer.current;
    pointer.current = null;
    if (!start || isMobileLayout()) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(event.clientY - start.y)) go(active + (dx < 0 ? 1 : -1));
  };

  // En mobile el look activo es el más centrado del scroll-snap.
  const onScroll = () => {
    if (!isMobileLayout() || !trackRef.current) return;
    const track = trackRef.current;
    const center = track.scrollLeft + track.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    [...track.children].forEach((child, index) => {
      const distance = Math.abs(child.offsetLeft + child.clientWidth / 2 - center);
      if (distance < bestDistance) { best = index; bestDistance = distance; }
    });
    if (best !== active) setActive(best);
  };

  // El título se pinta enseguida (es el LCP); la fila espera al catálogo.
  if (loading || !looks.length) {
    return (
      <section className="ed-hero" aria-labelledby="ed-hero-title" aria-busy={loading || undefined}>
        <header className="ed-hero__head">
          <h1 id="ed-hero-title" className="ed-display"><SeasonTitle /></h1>
          {loading && (
            <div className="ed-segmented" aria-hidden="true">
              {LOOK_FAMILIES.map((family, index) => <span key={family.id} className={index === 0 ? "is-active" : ""}>{family.label}</span>)}
            </div>
          )}
        </header>
        <div className="ed-hero__placeholder">{loading && <p className="ed-eyebrow">Cargando los looks de la temporada…</p>}</div>
      </section>
    );
  }
  const current = looks[active] || looks[0];
  const pieces = orderedPieces(current);
  const withModels = looks.every((look) => look.model);
  const swatches = lookSwatches(pieces);

  return (
    <section className="ed-hero" aria-labelledby="ed-hero-title">
      <header className="ed-hero__head">
        <h1 id="ed-hero-title" className="ed-display"><SeasonTitle /></h1>
        <div className="ed-segmented" role="tablist" aria-label="Tipo de look">
          {families.map((family) => (
            <button key={family.id} type="button" role="tab" aria-selected={family.id === familyId} className={family.id === familyId ? "is-active" : ""} onClick={() => setFamilyId(family.id)}>
              {family.label}
            </button>
          ))}
        </div>
      </header>

      <div className="ed-hero__body">
        <div
          className={`ed-row${withModels ? " has-models" : ""}`}
          role="group"
          aria-roledescription="carrusel"
          aria-label={`Looks de ${SEASON_SHORT_LABEL}. Usá las flechas para recorrerlos.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
        >
          <div className="ed-row__track" ref={trackRef} onScroll={onScroll}>
            {looks.map((look, index) => {
              const offset = index - active;
              const distance = Math.abs(offset);
              const hidden = distance > VISIBLE_RADIUS;
              return (
                <button
                  key={look.id}
                  type="button"
                  className={`ed-row__look${offset === 0 ? " is-active" : ""}`}
                  style={{ "--offset": offset, "--distance": distance }}
                  aria-label={`${lookLabel(look, index)} de ${looks.length}: ${look.pieces.map((piece) => piece.name).join(", ")}${offset === 0 ? ". Abrir el look" : ""}`}
                  aria-current={offset === 0 ? "true" : undefined}
                  tabIndex={-1}
                  data-hidden={hidden || undefined}
                  onClick={() => (offset === 0 ? onOpenLook(look, index) : go(index))}
                  onMouseEnter={() => {
                    if (offset === 0 || isMobileLayout()) return;
                    clearTimeout(hoverTimer.current);
                    hoverTimer.current = setTimeout(() => go(index), 160);
                  }}
                  onMouseLeave={() => clearTimeout(hoverTimer.current)}
                >
                  <LookFigure look={look} priority={offset === 0} active={offset === 0} />
                </button>
              );
            })}
          </div>
          <div className="ed-row__nav">
            <button className="ed-icon-button" type="button" onClick={() => go(active - 1)} disabled={active === 0} aria-label="Look anterior"><ArrowLeft size={18} /></button>
            <span className="ed-counter" aria-live="polite">{String(active + 1).padStart(2, "0")} / {String(looks.length).padStart(2, "0")}</span>
            <button className="ed-icon-button" type="button" onClick={() => go(active + 1)} disabled={active === looks.length - 1} aria-label="Look siguiente"><ArrowRight size={18} /></button>
          </div>
          {withModels && <p className="ed-ai-note">Modelos virtuales: imágenes generadas con IA a partir de las prendas reales.</p>}
        </div>

        <aside className="ed-look-panel" aria-label={`Piezas del ${lookLabel(current, active)}`}>
          <p className="ed-eyebrow">{lookLabel(current, active)} · {families.find((family) => family.id === familyId)?.label}</p>
          <ul className="ed-look-panel__pieces">
            {pieces.map((piece, index) => (
              <li key={piece.id}>
                {current.model && <span className="ed-num" aria-hidden="true">{index + 1}</span>}
                <span className="ed-thumb"><GarmentImage item={piece} alt="" sizes="64px" /></span>
                <span>{piece.name}</span>
              </li>
            ))}
          </ul>
          <ul className="ed-swatches" aria-label="Colores del look">
            {swatches.map((swatch) => <li key={swatch.hex} title={swatch.name}><i style={{ background: swatch.hex }} aria-hidden="true" /><span className="sr-only">{swatch.name}</span></li>)}
          </ul>
          <button className="ed-pill ed-pill--solid" type="button" onClick={() => onOpenLook(current, active)}>Ver el look <ArrowRight size={16} /></button>
        </aside>
      </div>
    </section>
  );
}
