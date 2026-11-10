import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "@phosphor-icons/react";
import { GarmentImage } from "../fashion/GarmentImage.jsx";
import { colorName, lookSwatches } from "./color-names.js";
import { LookModelFrame } from "./HeroLooks.jsx";
import { useSelection } from "./selection.jsx";
import { useScope } from "../embed/scope.jsx";

// Ficha de un look (varias piezas) o de una prenda suelta (look de una pieza).
// sheet = { title, eyebrow, pieces, model?, look?, related: [{ id, title, pieces, model? }] }
// Con `model` (foto del look en un avatar IA) la ficha arranca en la foto
// completa (current = -1) con puntos numerados que llevan a cada prenda.
export function LookSheet({ sheet, onClose, onOpenRelated }) {
  const { add, setOpen } = useSelection();
  // Embebida en Odoo: cada pieza enlaza a su ficha de la tienda.
  const { productUrls } = useScope();
  const firstView = sheet.model ? -1 : 0;
  const [current, setCurrent] = useState(firstView);
  const [checked, setChecked] = useState(() => new Set(sheet.pieces.map((piece) => piece.id)));
  const [sizes, setSizes] = useState({});
  const [added, setAdded] = useState(false);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    setCurrent(sheet.model ? -1 : 0);
    setChecked(new Set(sheet.pieces.map((piece) => piece.id)));
    setSizes({});
    setAdded(false);
    dialogRef.current?.scrollTo?.({ top: 0 });
  }, [sheet]);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [onClose]);

  const showModel = Boolean(sheet.model) && current === -1;
  const piece = sheet.pieces[current] || sheet.pieces[0];
  const swatches = useMemo(() => lookSwatches(sheet.pieces), [sheet]);
  // La descripción es la de la prenda principal (no la del accesorio, que va primero en la lista).
  const description = [...sheet.pieces].sort((a, b) => (a.part === "accessories_up") - (b.part === "accessories_up")).map((entry) => entry.description).find(Boolean);
  const single = sheet.pieces.length === 1;

  const toggle = (id) => setChecked((set) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const addSelected = () => {
    for (const entry of sheet.pieces) if (checked.has(entry.id)) add(entry, sizes[entry.id] || null);
    setAdded(true);
  };

  return (
    <div className="ed-sheet-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <article className="ed-sheet" role="dialog" aria-modal="true" aria-labelledby="ed-sheet-title" ref={dialogRef}>
        <button ref={closeRef} className="ed-sheet__close" type="button" onClick={onClose}>Cerrar <X size={16} /></button>
        <div className="ed-sheet__grid">
          {!single && (
            <ul className="ed-sheet__thumbs" aria-label="Piezas del look">
              {sheet.model && (
                <li>
                  <button type="button" className={`ed-sheet__thumb-model${showModel ? " is-active" : ""}`} aria-pressed={showModel} onClick={() => setCurrent(-1)} aria-label="Ver el look completo">
                    <GarmentImage item={{ imageSet: sheet.model.imageSet, name: sheet.model.name }} alt="" sizes="80px" />
                  </button>
                </li>
              )}
              {sheet.pieces.map((entry, index) => (
                <li key={entry.id}>
                  <button type="button" className={index === current ? "is-active" : ""} aria-pressed={index === current} onClick={() => setCurrent(index)} aria-label={`Ver ${entry.name}`}>
                    <GarmentImage item={entry} alt="" sizes="80px" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showModel ? (
            <figure className="ed-sheet__stage ed-sheet__stage--model" key="model">
              <LookModelFrame look={sheet} pieces={sheet.pieces} sizes="(max-width: 760px) 80vw, 40vw" priority showSpots onSpot={setCurrent} />
              <figcaption>Imagen generada con IA · Modelo virtual {sheet.model.name}. Tocá un número para ver la prenda.</figcaption>
            </figure>
          ) : (
            <figure className="ed-sheet__stage" key={piece.id}>
              <GarmentImage item={piece} alt={piece.name} sizes="(max-width: 760px) 90vw, 46vw" priority />
              <figcaption>{piece.name}</figcaption>
            </figure>
          )}
          <div className="ed-sheet__info">
            {sheet.eyebrow && <p className="ed-eyebrow">{sheet.eyebrow}</p>}
            <h2 id="ed-sheet-title" className="ed-title">{sheet.title}</h2>
            {description && <p className="ed-sheet__desc">{description}</p>}
            <ul className="ed-swatches ed-swatches--named" aria-label="Colores">
              {swatches.map((swatch) => <li key={swatch.hex}><i style={{ background: swatch.hex }} aria-hidden="true" />{swatch.name}</li>)}
            </ul>
            <fieldset className="ed-sheet__pieces">
              <legend>{single ? "Talle" : "Piezas de este look"}</legend>
              {sheet.pieces.map((entry, index) => (
                <div className="ed-sheet__piece" key={entry.id}>
                  {sheet.model && <button type="button" className={`ed-num${current === index ? " is-active" : ""}`} onClick={() => setCurrent(index)} aria-label={`Ver ${entry.name}`}>{index + 1}</button>}
                  {!single && (
                    <label className="ed-check">
                      <input type="checkbox" checked={checked.has(entry.id)} onChange={() => toggle(entry.id)} />
                      <span>{entry.name}<small>{colorName(entry.color)}</small></span>
                    </label>
                  )}
                  {productUrls[entry.id] && (
                    <a className="ed-shop-link" href={productUrls[entry.id]}>Ver en la tienda</a>
                  )}
                  {(entry.sizes || []).length > 0 && (
                    <label className="ed-size">
                      <span className="sr-only">Talle de {entry.name}</span>
                      <select value={sizes[entry.id] || ""} onChange={(event) => setSizes((current) => ({ ...current, [entry.id]: event.target.value }))} disabled={!checked.has(entry.id)}>
                        <option value="">Talle</option>
                        {entry.sizes.map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              ))}
            </fieldset>
            <div className="ed-sheet__actions">
              <button className="ed-pill ed-pill--solid" type="button" onClick={addSelected} disabled={!checked.size}>
                {added ? <><Check size={16} /> Agregado a tu selección</> : "Agregar a tu selección"}
              </button>
              {added && <button className="ed-pill" type="button" onClick={() => { onClose(); setOpen(true); }}>Ver tu selección</button>}
            </div>
          </div>
        </div>

        {sheet.related?.length > 0 && (
          <section className="ed-sheet__related" aria-labelledby="ed-related-title">
            <h3 id="ed-related-title" className="ed-subtitle">También te puede gustar</h3>
            <ul>
              {sheet.related.map((look) => (
                <li key={look.id}>
                  <button type="button" onClick={() => onOpenRelated(look)} aria-label={`${look.title}: ${look.pieces.map((entry) => entry.name).join(", ")}`}>
                    {look.model ? (
                      <span className="ed-mini-look ed-mini-look--model">
                        <GarmentImage item={{ imageSet: look.model.imageSet, name: look.model.name }} alt="" sizes="160px" />
                      </span>
                    ) : (
                      <span className="ed-mini-look">
                        {look.pieces.slice(0, 3).map((entry) => <GarmentImage key={entry.id} item={entry} alt="" sizes="120px" />)}
                      </span>
                    )}
                    <span>{look.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
