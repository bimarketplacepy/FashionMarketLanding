// Plugin de Vite (sólo build): agrega a index.html la precarga de las imágenes
// del look que el hero muestra primero, para que el navegador las pida en
// paralelo con el JS en vez de esperar a que corra React y llegue /api/landing.
// Sólo se activa en la ruta "/" (index.html es el mismo para todas las rutas).
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildLandingPayload } from "./landing-payload.mjs";

const MOBILE = "(max-width: 760px)";

function preloadsFor(look, sizes, media) {
  // Con foto en modelo, el LCP es esa foto; si no, las prendas apiladas.
  const sources = look.model ? [look.model] : look.pieces;
  return sources.filter((piece) => piece.imageSet).map((piece) => {
    const set = piece.imageSet;
    return {
      media,
      type: "image/avif",
      imagesrcset: set.widths.map((width) => `${set.src}.${set.hash}-${width}.avif ${width}w`).join(", "),
      imagesizes: sizes,
    };
  });
}

export function landingPreloadPlugin({ root }) {
  return {
    name: "fashion-market-landing-preload",
    apply: "build",
    transformIndexHtml() {
      let payload;
      try {
        payload = buildLandingPayload(JSON.parse(readFileSync(path.join(root, "data/library.json"), "utf8")));
      } catch (error) {
        this.warn?.(`No se pudo armar la precarga de la landing: ${error.message}`);
        return [];
      }
      // Mismo criterio que HomePage (preferModelLooks): con 3+ fotos en modelo, sólo esas.
      const firstFamily = (Object.values(payload.looks).find((list) => list.length) || [])
        .filter((look, _, list) => (list.filter((entry) => entry.model).length >= 3 ? look.model : true));
      if (!firstFamily.length) return [];
      // Mismo criterio que HeroLooks: mobile arranca en el primero, escritorio en el del medio.
      const mobileLook = firstFamily[0];
      const desktopLook = firstFamily[Math.floor(firstFamily.length / 2)];
      const links = [
        ...preloadsFor(mobileLook, mobileLook.model ? "72vw" : "45vw", MOBILE),
        ...preloadsFor(desktopLook, desktopLook.model ? "420px" : "240px", "(min-width: 761px)"),
      ];
      const script = `(function(){if(location.pathname!=="/")return;var l=${JSON.stringify(links)};for(var i=0;i<l.length;i++){var e=document.createElement("link");e.rel="preload";e.as="image";e.fetchPriority="high";for(var k in l[i])e.setAttribute(k,l[i][k]);document.head.appendChild(e);}})();`;
      return [{ tag: "script", children: script, injectTo: "head" }];
    },
  };
}
