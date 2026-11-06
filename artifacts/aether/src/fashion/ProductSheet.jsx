import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowRight, CoatHanger } from "@phosphor-icons/react";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { addToDraft } from "./outfit-draft.js";
import { sugerirPrendas } from "./sugerencias.js";
import { SuggestionCarousel, useSavedOutfits } from "./SuggestionCarousel.jsx";
import { formatPriceGs, GARMENT_TYPE_LABELS, MATERIAL_LABELS, PART_LABELS, SEASON_LABELS, SILHOUETTE_LABELS } from "./format.js";
import { SHOW_PRICES } from "../site-config.js";
import "./shop.css";

// Ficha comercial de solo lectura que ve el público al hacer click en una prenda.
export function ProductSheet({ item, items, onClose, onOpen, onBack }) {
  const [, navigate] = useLocation();
  const closeButtonRef = useRef(null);
  const sheetRef = useRef(null);
  const [added, setAdded] = useState(false);
  const { outfits, ready } = useSavedOutfits();
  const sugerencias = useMemo(
    () => sugerirPrendas({ base: item, items, outfits }),
    [item, items, outfits],
  );

  useEffect(() => {
    setAdded(false);
    sheetRef.current?.scrollTo({ top: 0 });
  }, [item]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    // viewer-lock fija el body en móvil (position: fixed) para que el gesto de
    // scroll no se encadene a la página de fondo y la ficha scrollee completa.
    const scrollY = window.scrollY;
    document.body.classList.add("viewer-open", "viewer-lock");
    document.body.style.top = `-${scrollY}px`;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("viewer-open", "viewer-lock");
      document.body.style.top = "";
      window.scrollTo(0, scrollY);
    };
  }, [onClose]);

  const addToOutfit = () => {
    addToDraft(item);
    setAdded(true);
  };

  return (
    <div className="viewer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="viewer-entry">
        <aside className="viewer product-sheet" data-lenis-prevent role="dialog" aria-modal="true" aria-label={item.name} ref={sheetRef}>
          <button className="sheet-back" type="button" onClick={onBack || onClose} ref={closeButtonRef}>
            <ArrowLeft size={14} /> {onBack ? "Volver" : "Volver al catálogo"}
          </button>

          <div className="product-sheet-layout">
            <div className="product-sheet-art">
              <OptimizedImage
                src={item.image}
                alt={item.name}
                sizes="(max-width: 860px) 84vw, 420px"
                breakpoints={[240, 320, 480, 640, 800]}
                priority
              />
            </div>
            <div className="product-sheet-info">
              <p className="product-part">{PART_LABELS[item.part] || "Prenda"}</p>
              <h2>{item.name}</h2>
              {SHOW_PRICES && typeof item.price === "number" && <p className="product-price">{formatPriceGs(item.price)}</p>}
              {item.description && <p className="product-description">{item.description}</p>}

              <dl className="product-attrs">
                {[
                  ["Tipo", GARMENT_TYPE_LABELS[item.garmentType]],
                  ["Tela", MATERIAL_LABELS[item.material]],
                  ["Silueta", SILHOUETTE_LABELS[item.silhouette]],
                  ["Temporada", SEASON_LABELS[item.season]],
                ].filter(([, value]) => value).map(([label, value]) => (
                  <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
                {item.color && (
                  <div>
                    <dt>Color</dt>
                    <dd className="product-colors">
                      {[item.color, item.secondaryColor].filter(Boolean).map((color) => <i key={color} style={{ background: color }} aria-hidden="true" />)}
                    </dd>
                  </div>
                )}
              </dl>

              <button className="retail-primary-button product-add" type="button" onClick={addToOutfit}>
                <CoatHanger size={17} /> Agregar a mi outfit
              </button>
              {added && (
                <p className="product-added" role="status">
                  Agregada a tu outfit.
                  <button type="button" onClick={() => navigate("/outfit")}>Armar mi outfit <ArrowRight size={13} /></button>
                </p>
              )}
            </div>
          </div>

          <SuggestionCarousel
            title="Combina con"
            suggestions={sugerencias}
            ready={ready}
            action="open"
            onOpen={onOpen}
          />
        </aside>
      </div>
    </div>
  );
}
