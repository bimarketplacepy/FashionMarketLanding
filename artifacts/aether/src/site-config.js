// Configuración única del sitio (temporada, promociones, precios).
// Fuente: data/site-config.json — se edita ahí y se publica junto al catálogo.
import config from "../data/site-config.json";

export const siteConfig = config;
export const ACTIVE_SEASON = config.activeSeason;
export const SEASON_LABEL = config.seasonLabel;
export const SEASON_SHORT_LABEL = config.seasonShortLabel || config.seasonLabel;
export const SHOW_PRICES = config.showPrices === true;

// Una promo se muestra sólo si está dentro de su ventana y su colección tiene
// prendas activas. Una promo vencida o vacía no se renderiza nunca.
// `activeCollections`: colecciones que tienen al menos una prenda activa.
export function activePromotions(activeCollections, now = new Date()) {
  const collections = new Set(activeCollections);
  return (config.promotions || []).filter((promo) => {
    if (promo.startsAt && new Date(promo.startsAt) > now) return false;
    if (!promo.endsAt || new Date(promo.endsAt) < now) return false;
    return promo.collection ? collections.has(promo.collection) : collections.size > 0;
  });
}

// Avisa en desarrollo cuando una sección queda sin prendas (y por eso no se muestra).
export function warnEmptySection(name, list) {
  if (import.meta.env.DEV && list.length === 0) {
    console.warn(`[landing] La sección "${name}" no tiene prendas activas y no se renderiza.`);
  }
}

// Canal de consulta de "Tu selección". WhatsApp sólo si está configurado
// (número internacional sin "+", ej. 5959XXXXXXXX); si no, se ofrece email.
export const CONTACT = {
  whatsapp: typeof config.contact?.whatsapp === "string" && /^\d{8,15}$/.test(config.contact.whatsapp) ? config.contact.whatsapp : null,
  email: config.contact?.email || "info@marketplace.com.py",
  whatsappGreeting: config.contact?.whatsappGreeting || "Hola, quisiera consultar…",
};

// Enlace de WhatsApp en el formato de api.whatsapp.com que usa la tienda.
export function whatsappUrl(text = CONTACT.whatsappGreeting) {
  const params = new URLSearchParams({ phone: CONTACT.whatsapp, text, type: "phone_number", app_absent: "0" });
  return `https://api.whatsapp.com/send/?${params}`;
}
