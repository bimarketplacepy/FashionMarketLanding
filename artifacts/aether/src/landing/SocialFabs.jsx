import { useEffect, useState } from "react";
import { InstagramLogo, WhatsappLogo } from "@phosphor-icons/react";
import { CONTACT, whatsappUrl } from "../site-config.js";
import { STORE } from "./store-info.js";

// Px de scroll a partir de los cuales aparecen los botones: el hero queda
// limpio y los botones acompañan el resto de la página.
const SHOW_AFTER = 320;

// Botones flotantes de WhatsApp e Instagram, sólo en la página de inicio.
// `anchorRef` es el contenido de la página: se mide su posición (no
// window.scrollY) para que funcione igual embebida en Odoo, donde arriba está
// el header de la tienda.
export function SocialFabs({ anchorRef }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = anchorRef.current?.getBoundingClientRect().top ?? 0;
      setVisible(top < -SHOW_AFTER);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [anchorRef]);

  return (
    <div className={`ed-social-fabs${visible ? " is-visible" : ""}`} aria-hidden={!visible}>
      {CONTACT.whatsapp && (
        <a className="ed-social-fab ed-social-fab--whatsapp" href={whatsappUrl()} target="_blank" rel="noreferrer" aria-label="Escribinos por WhatsApp" tabIndex={visible ? 0 : -1}>
          <WhatsappLogo size={24} weight="regular" aria-hidden="true" />
        </a>
      )}
      <a className="ed-social-fab ed-social-fab--instagram" href={STORE.instagramUrl} target="_blank" rel="noreferrer" aria-label={`Seguinos en Instagram (${STORE.instagramLabel})`} tabIndex={visible ? 0 : -1}>
        <InstagramLogo size={24} weight="regular" aria-hidden="true" />
      </a>
    </div>
  );
}
