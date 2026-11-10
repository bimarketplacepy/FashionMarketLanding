import { ACTIVE_SEASON, SEASON_LABEL } from "../site-config.js";
import { STORE } from "./store-info.js";
import { useScope } from "../embed/scope.jsx";

// Banda con mensajes reales de la tienda en loop. Se pausa al pasar el mouse
// o con foco; con prefers-reduced-motion queda quieta.
export function Marquee() {
  const { embedded } = useScope();
  // Dentro de Odoo, redes, email y horario son los de la tienda: no van acá.
  const messages = [
    `Nueva temporada ${ACTIVE_SEASON}`,
    SEASON_LABEL,
    "Probador virtual con IA",
    ...(embedded ? [] : [STORE.instagramLabel, STORE.email, `${STORE.hours[0].place} · ${STORE.hours[0].lines[0]}`]),
  ];
  return (
    <section className="ed-marquee" aria-label="Novedades de la tienda">
      <ul className="sr-only">{messages.map((message) => <li key={message}>{message}</li>)}</ul>
      <div className="ed-marquee__track" aria-hidden="true">
        {[0, 1].map((copy) => (
          <div className="ed-marquee__group" key={copy}>
            {messages.map((message) => <span key={`${copy}-${message}`}>{message}<i>✦</i></span>)}
          </div>
        ))}
      </div>
    </section>
  );
}
