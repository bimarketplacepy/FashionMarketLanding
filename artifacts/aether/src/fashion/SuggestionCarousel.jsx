import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { formatPriceGs } from "./format.js";

// Outfits guardados, compartidos entre fichas (para el +1 de "aparecen juntas").
let outfitsCache = null;
let outfitsPromise = null;

export function useSavedOutfits() {
  const [state, setState] = useState(() => ({ outfits: outfitsCache || [], ready: Boolean(outfitsCache) }));
  useEffect(() => {
    if (outfitsCache) return;
    outfitsPromise ||= fetch("/api/tryon/outfits")
      .then((response) => (response.ok ? response.json() : { outfits: [] }))
      .then((collection) => { outfitsCache = collection.outfits || []; return outfitsCache; })
      .catch(() => { outfitsCache = []; return outfitsCache; });
    let alive = true;
    outfitsPromise.then((outfits) => alive && setState({ outfits, ready: true }));
    return () => { alive = false; };
  }, []);
  return state;
}

// Carrusel minimalista de sugerencias. `suggestions` = [{ item, deColeccion }].
// action: "open" (ficha: hover "Ver prenda", tap abre) o "add" (builder:
// agrega directo con feedback de tilde). Sin bordes, sin sombras, sin badges.
export function SuggestionCarousel({ title, suggestions, ready = true, action = "open", onOpen, onAdd }) {
  const trackRef = useRef(null);
  const [canScroll, setCanScroll] = useState({ left: false, right: false });
  const [addedId, setAddedId] = useState(null);
  const addedTimer = useRef(null);

  const updateArrows = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScroll({
      left: track.scrollLeft > 4,
      right: track.scrollLeft + track.clientWidth < track.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [updateArrows, suggestions]);

  useEffect(() => () => clearTimeout(addedTimer.current), []);

  if (ready && suggestions.length < 4) return null;

  const scrollBy = (direction) => {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: direction * track.clientWidth * 0.75, behavior: "smooth" });
  };

  const activate = (item) => {
    if (action === "add") {
      onAdd?.(item);
      clearTimeout(addedTimer.current);
      setAddedId(item.id);
      addedTimer.current = setTimeout(() => setAddedId(null), 1000);
    } else {
      onOpen?.(item.id);
    }
  };

  return (
    <section className="sc" aria-label={title}>
      <h3 className="sc-title">{title}</h3>
      {!ready ? (
        <div className="sc-track" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => <span className="sc-skeleton" key={index} />)}
        </div>
      ) : (
        <>
          <div className="sc-track" ref={trackRef} onScroll={updateArrows}>
            {suggestions.map(({ item, deColeccion }) => (
              <button
                className={`sc-card${addedId === item.id ? " is-added" : ""}`}
                type="button"
                key={item.id}
                onClick={() => activate(item)}
                aria-label={action === "add" ? `Agregar ${item.name}` : `Ver ${item.name}`}
              >
                <span className="sc-art">
                  <img src={item.thumbnail || item.image} alt="" loading="lazy" />
                  {addedId === item.id && <span className="sc-check"><Check size={20} weight="light" /></span>}
                </span>
                {deColeccion && <span className="sc-origin">De la colección</span>}
                <span className="sc-name">{item.name}</span>
                <span className="sc-price">{typeof item.price === "number" ? formatPriceGs(item.price) : ""}</span>
                <span className="sc-action">{action === "add" ? "Agregar" : "Ver prenda"}</span>
              </button>
            ))}
          </div>
          <button className="sc-arrow sc-arrow--left" type="button" data-visible={canScroll.left} tabIndex={canScroll.left ? 0 : -1} onClick={() => scrollBy(-1)} aria-label="Anteriores">
            <ArrowLeft size={20} weight="light" />
          </button>
          <button className="sc-arrow sc-arrow--right" type="button" data-visible={canScroll.right} tabIndex={canScroll.right ? 0 : -1} onClick={() => scrollBy(1)} aria-label="Siguientes">
            <ArrowRight size={20} weight="light" />
          </button>
        </>
      )}
    </section>
  );
}
