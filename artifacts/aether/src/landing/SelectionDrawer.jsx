import { useEffect, useMemo, useRef } from "react";
import { DownloadSimple, EnvelopeSimple, Minus, Plus, ShoppingBagOpen, Trash, WhatsappLogo, X } from "@phosphor-icons/react";
import { GarmentImage } from "../fashion/GarmentImage.jsx";
import { CONTACT, SEASON_LABEL, whatsappUrl } from "../site-config.js";
import { useSelection } from "./selection.jsx";

function selectionText(lines) {
  const body = lines.map(({ item, entry }) => `• ${item.name}${entry.size ? ` — talle ${entry.size}` : ""} — cantidad ${entry.qty}`).join("\n");
  return `${CONTACT.whatsappGreeting.replace(/…$/, "")} por estas piezas de ${SEASON_LABEL}:\n\n${body}\n`;
}

function downloadSelection(text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "mi-seleccion-fashion-market.txt";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Botón flotante con contador.
export function SelectionButton() {
  const { count, setOpen } = useSelection();
  return (
    <button className="ed-selection-fab" type="button" onClick={() => setOpen(true)} aria-label={`Tu selección: ${count} ${count === 1 ? "pieza" : "piezas"}`}>
      <ShoppingBagOpen size={20} weight="light" aria-hidden="true" />
      <span>Tu selección</span>
      <b aria-hidden="true">{count}</b>
    </button>
  );
}

export function SelectionDrawer() {
  const { entries, update, remove, open, setOpen } = useSelection();
  const closeRef = useRef(null);
  const lines = useMemo(() => entries.map((entry, index) => ({ entry, index, item: { id: entry.id, ...entry.item } })), [entries]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus?.();
    };
  }, [open, setOpen]);

  if (!open) return null;
  const text = selectionText(lines);
  return (
    <div className="ed-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <aside className="ed-drawer" role="dialog" aria-modal="true" aria-labelledby="ed-drawer-title">
        <header>
          <h2 id="ed-drawer-title">Tu selección</h2>
          <button ref={closeRef} className="ed-icon-button" type="button" onClick={() => setOpen(false)} aria-label="Cerrar tu selección"><X size={20} /></button>
        </header>
        {lines.length ? (
          <>
            <ul className="ed-drawer__list">
              {lines.map(({ entry, index, item }) => (
                <li key={`${entry.id}-${entry.size}-${index}`}>
                  <span className="ed-drawer__thumb"><GarmentImage item={item} alt={item.name} sizes="72px" /></span>
                  <div>
                    <p className="ed-drawer__name">{item.name}</p>
                    <label className="ed-drawer__size">
                      <span>Talle</span>
                      <select value={entry.size || ""} onChange={(event) => update(index, { size: event.target.value || null })}>
                        <option value="">Sin elegir</option>
                        {(item.sizes || []).map((size) => <option key={size} value={size}>{size}</option>)}
                      </select>
                    </label>
                    <div className="ed-qty" role="group" aria-label={`Cantidad de ${item.name}`}>
                      <button type="button" onClick={() => update(index, { qty: Math.max(1, entry.qty - 1) })} aria-label="Restar uno" disabled={entry.qty <= 1}><Minus size={14} /></button>
                      <output aria-live="polite">{entry.qty}</output>
                      <button type="button" onClick={() => update(index, { qty: Math.min(9, entry.qty + 1) })} aria-label="Sumar uno" disabled={entry.qty >= 9}><Plus size={14} /></button>
                    </div>
                  </div>
                  <button className="ed-icon-button" type="button" onClick={() => remove(index)} aria-label={`Quitar ${item.name}`}><Trash size={18} /></button>
                </li>
              ))}
            </ul>
            <footer className="ed-drawer__actions">
              {CONTACT.whatsapp ? (
                <a className="ed-pill ed-pill--solid" href={whatsappUrl(text)} target="_blank" rel="noreferrer"><WhatsappLogo size={18} /> Consultar por WhatsApp</a>
              ) : (
                <a className="ed-pill ed-pill--solid" href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("Consulta por mi selección")}&body=${encodeURIComponent(text)}`}><EnvelopeSimple size={18} /> Consultar por email</a>
              )}
              <button className="ed-pill" type="button" onClick={() => downloadSelection(text)}><DownloadSimple size={18} /> Descargar selección</button>
            </footer>
          </>
        ) : (
          <p className="ed-drawer__empty">Todavía no elegiste piezas. Sumalas desde un look o desde el perchero.</p>
        )}
      </aside>
    </div>
  );
}
