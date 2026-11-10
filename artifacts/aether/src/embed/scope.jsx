import { createContext, useContext } from "react";

// Alcance de la experiencia cuando corre dentro de una categoría de Odoo.
//
// El módulo de Odoo pasa qué prendas están publicadas en la categoría que se
// está viendo (por Referencia interna = id de la prenda) y la URL de su ficha en
// la tienda. Con eso la colección, el perchero y los looks muestran sólo "las
// prendas que tenemos" en esa categoría, y cada pieza enlaza a su producto.
//
// Fuera de Odoo no hay proveedor: `allowed` es null (sin filtro) y no hay URLs.
// `embedded`: true dentro de Odoo. Ahí el footer, las redes y el contacto son los de
// la tienda: los footers de Fashion Market no se muestran.
const ScopeContext = createContext({ allowed: null, productUrls: {}, categoryName: "", embedded: false });

export function ScopeProvider({ allowed, productUrls, categoryName, children }) {
  return (
    <ScopeContext.Provider value={{ allowed: allowed || null, productUrls: productUrls || {}, categoryName: categoryName || "", embedded: true }}>
      {children}
    </ScopeContext.Provider>
  );
}

export function useScope() {
  return useContext(ScopeContext);
}

export const inScope = (allowed, id) => !allowed || allowed.has(id);

// Un look entra sólo si todas sus piezas están en la categoría: no se ofrece un
// conjunto con una prenda que la tienda no muestra.
export function scopeLanding(data, allowed) {
  if (!data || !allowed) return data;
  return {
    ...data,
    looks: Object.fromEntries(Object.entries(data.looks || {}).map(([family, list]) => [
      family,
      list.filter((look) => look.pieces.every((piece) => allowed.has(piece.id))),
    ])),
    rack: (data.rack || []).filter((item) => allowed.has(item.id)),
  };
}
