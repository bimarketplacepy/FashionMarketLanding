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
export function activePromotions(items, now = new Date()) {
  return (config.promotions || []).filter((promo) => {
    if (promo.startsAt && new Date(promo.startsAt) > now) return false;
    if (!promo.endsAt || new Date(promo.endsAt) < now) return false;
    const promoItems = promo.collection ? items.filter((item) => item.collection === promo.collection) : items;
    return promoItems.length > 0;
  });
}

// Avisa en desarrollo cuando una sección queda sin prendas (y por eso no se muestra).
export function warnEmptySection(name, list) {
  if (import.meta.env.DEV && list.length === 0) {
    console.warn(`[landing] La sección "${name}" no tiene prendas activas y no se renderiza.`);
  }
}
