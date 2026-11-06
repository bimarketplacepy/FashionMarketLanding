import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "@phosphor-icons/react";
import { GarmentImage } from "../fashion/GarmentImage.jsx";
import { SEASON_LABEL } from "../site-config.js";

// Percha de madera dibujada en SVG (gancho metálico + barra curva).
function Hanger() {
  return (
    <svg className="ed-hanger" viewBox="0 0 120 52" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ed-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c69a6d" />
          <stop offset="1" stopColor="#8f6440" />
        </linearGradient>
      </defs>
      <path d="M60 22 V13 a6 6 0 1 1 6 -6" fill="none" stroke="#8b8b8b" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M6 44 Q60 14 114 44 L111 49 Q60 24 9 49 Z" fill="url(#ed-wood)" />
      <circle cx="60" cy="25" r="3.2" fill="#7a5434" />
    </svg>
  );
}

const pad = (value) => String(value).padStart(2, "0");

export function GarmentRack({ items, onOpenItem }) {
  const [hovered, setHovered] = useState(null);
  const [focus, setFocus] = useState(null);
  const closeRef = useRef(null);
  const pointer = useRef(null);
  const lastTrigger = useRef(null);

  const move = (delta) => setFocus((current) => (current === null ? current : (current + delta + items.length) % items.length));

  useEffect(() => {
    if (focus === null) return undefined;
    closeRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") setFocus(null);
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      lastTrigger.current?.focus?.();
    };
    // move usa el setter funcional: no necesita estar en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus === null]);

  if (items.length < 4) return null;
  const focused = focus === null ? null : items[focus];

  return (
    <section className="ed-rack-section" id="perchero" aria-labelledby="ed-rack-title">
      <header className="ed-section-head">
        <p className="ed-eyebrow">{SEASON_LABEL}</p>
        <h2 id="ed-rack-title" className="ed-title">El perchero</h2>
        <p className="ed-lede">Pasá por las perchas: cada prenda gira al frente. Tocá una para verla de cerca.</p>
      </header>

      <div className={`ed-rack${focused ? " is-dimmed" : ""}`} onMouseLeave={() => setHovered(null)}>
        <div className="ed-rack__bar" aria-hidden="true" />
        <ul className="ed-rack__items">
          {items.map((item, index) => {
            const side = hovered === null ? 0 : Math.sign(index - hovered);
            return (
              <li
                key={item.id}
                className={`ed-rack__item${hovered === index ? " is-front" : ""}`}
                style={{ "--side": side, zIndex: hovered === index ? 40 : 20 - Math.abs(index - (hovered ?? index)) }}
              >
                <button
                  type="button"
                  onMouseEnter={() => setHovered(index)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  onClick={(event) => { lastTrigger.current = event.currentTarget; setFocus(index); }}
                  aria-label={`${item.name}. Ver de cerca`}
                >
                  <Hanger />
                  <span className="ed-rack__garment"><GarmentImage item={item} alt={item.name} sizes="(max-width: 760px) 44vw, 200px" /></span>
                  <span className="ed-rack__name" aria-hidden="true">{item.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {focused && (
        <div
          className="ed-rack-focus"
          role="dialog"
          aria-modal="true"
          aria-label={`${focused.name}, prenda ${focus + 1} de ${items.length}`}
          onPointerDown={(event) => { pointer.current = event.clientX; }}
          onPointerUp={(event) => {
            const start = pointer.current;
            pointer.current = null;
            if (start !== null && Math.abs(event.clientX - start) > 50) move(event.clientX < start ? 1 : -1);
          }}
          onMouseDown={(event) => event.target === event.currentTarget && setFocus(null)}
        >
          <button ref={closeRef} className="ed-rack-focus__close" type="button" onClick={() => setFocus(null)}>Cerrar <X size={16} /></button>
          <figure className="ed-rack-focus__figure" key={focused.id}>
            <Hanger />
            <GarmentImage item={focused} alt={focused.name} sizes="(max-width: 760px) 80vw, 520px" priority />
          </figure>
          <div className="ed-rack-focus__meta">
            <span className="ed-counter" aria-live="polite">{pad(focus + 1)} / {pad(items.length)}</span>
            <p className="ed-rack-focus__name">{focused.name}</p>
            <div className="ed-rack-focus__nav">
              <button className="ed-icon-button" type="button" onClick={() => move(-1)} aria-label="Prenda anterior"><ArrowLeft size={18} /></button>
              <button className="ed-pill ed-pill--solid" type="button" onClick={() => { const item = focused; setFocus(null); onOpenItem(item); }}>Ver prenda</button>
              <button className="ed-icon-button" type="button" onClick={() => move(1)} aria-label="Prenda siguiente"><ArrowRight size={18} /></button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
