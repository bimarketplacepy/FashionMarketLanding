import { CONTACT, SEASON_LABEL, whatsappUrl } from "../site-config.js";
import { STORE } from "./store-info.js";

export function EditorialFooter({ navigate }) {
  return (
    <footer className="ed-footer">
      <p className="ed-footer__wordmark" aria-hidden="true">{STORE.name}</p>
      <div className="ed-footer__grid">
        <nav aria-label="Secciones">
          <h2>Explorá</h2>
          <button type="button" onClick={() => navigate("/catalogo")}>Colección</button>
          <a href="#perchero">El perchero</a>
          <button type="button" onClick={() => navigate("/probador")}>Probador virtual</button>
        </nav>
        <div>
          <h2>Horario de atención</h2>
          {STORE.hours.map((entry) => <p key={entry.place}><strong>{entry.place}:</strong> {entry.lines.join(" · ")}</p>)}
        </div>
        <div>
          <h2>Contacto</h2>
          {CONTACT.whatsapp && <a href={whatsappUrl()} target="_blank" rel="noreferrer">WhatsApp</a>}
          <a href={`mailto:${STORE.email}`}>{STORE.email}</a>
          <a href={STORE.instagramUrl} target="_blank" rel="noreferrer">Instagram {STORE.instagramLabel}</a>
          <a href={STORE.facebookUrl} target="_blank" rel="noreferrer">Facebook {STORE.facebookLabel}</a>
        </div>
      </div>
      <p className="ed-footer__legal">© 2026 {STORE.name} · {STORE.byline} · {SEASON_LABEL}</p>
    </footer>
  );
}
