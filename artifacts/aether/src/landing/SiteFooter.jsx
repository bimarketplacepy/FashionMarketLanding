import { EnvelopeSimple, FacebookLogo, InstagramLogo } from "@phosphor-icons/react";
import { BrandLogo } from "../fashion/BrandLogo.jsx";
import { SEASON_LABEL } from "../site-config.js";
import { STORE } from "./store-info.js";

export function SiteFooter({ tagline }) {
  return (
    <footer className="retail-footer">
      <div className="retail-footer__top">
        <div className="brand-mark"><BrandLogo /><small>{STORE.byline}</small></div>
        <p>{tagline}</p>
        <small>{SEASON_LABEL}</small>
      </div>
      <div className="retail-footer__columns">
        <section>
          <h3>Horario de Atención</h3>
          {STORE.hours.map((entry) => (
            <div key={entry.place}>
              <p><strong>{entry.place}:</strong></p>
              {entry.lines.map((line) => <p key={line}>{line}</p>)}
            </div>
          ))}
        </section>
        <section>
          <h3>Contacto</h3>
          <a className="retail-social" href={`mailto:${STORE.email}`}><EnvelopeSimple size={16} /> {STORE.email}</a>
        </section>
        <section>
          <h3>Encontranos en</h3>
          <a className="retail-social" href={STORE.facebookUrl} target="_blank" rel="noreferrer" aria-label="Facebook de Fashion Market"><FacebookLogo size={16} /> {STORE.facebookLabel}</a>
          <a className="retail-social" href={STORE.instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram de Fashion Market"><InstagramLogo size={16} /> {STORE.instagramLabel}</a>
        </section>
      </div>
      <p className="retail-footer__legal">© 2026 {STORE.name}. Todos los derechos reservados.</p>
    </footer>
  );
}
