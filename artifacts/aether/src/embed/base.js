// Prefijos de URLs del motor.
//
// En la app propia todo es relativo a la raíz ("/api/catalog", "/garments/…").
// Embebida en Odoo hay dos caminos y el widget los define con setEngineBase()
// antes de montar React (sin eso los dos son "" y la app propia no cambia):
//
// - api: datos y probador. Con el módulo de Odoo es su proxy (`/fm`, mismo
//   dominio que la tienda: la cookie del probador es de primera parte). Sin
//   módulo es el dominio del motor (`https://probador.<dominio>`).
// - assets: imágenes (prendas, avatares, looks en modelo, pruebas generadas).
//   Van directo al dominio del motor para no ocupar un worker de Odoo por cada
//   imagen. Si no se define, es igual a `api`.
//
// Sólo se prefija al pedir o pintar: los datos (library.json, modelUrl que se
// manda al probador) siguen con rutas de raíz, que es lo que entiende el motor.
let apiBase = "";
let assetBase = "";

const clean = (value) => String(value || "").replace(/\/+$/, "");

export function setEngineBase(api, assets) {
  apiBase = clean(api);
  assetBase = clean(assets) || apiBase;
}

const prefix = (root, path) => (!root || typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") ? path : `${root}${path}`);

// Imagen del motor: "/garments/x.webp" → "https://probador…/garments/x.webp".
// URLs absolutas, data: y blob: quedan igual.
export function engineUrl(path) {
  return prefix(assetBase, path);
}

// fetch hacia la API del motor. En modo directo (otro dominio) la cookie del
// probador (fm_sid) tiene que viajar: credentials "include".
export function engineFetch(path, options = {}) {
  const crossOrigin = /^https?:\/\//.test(apiBase);
  return fetch(prefix(apiBase, path), crossOrigin ? { credentials: "include", ...options } : options);
}
