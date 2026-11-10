// Build del widget embebible para Odoo (src/embed/fm-embed.jsx).
//
//   pnpm --filter @workspace/aether run build:embed
//
// Sale en dist/public/embed/ (lo sirve el deployment junto al resto del build):
//   fm-embed.js      entrada (ES module, nombre fijo: lo referencia Odoo)
//   chunks/*.js      colección y probador, cargados al abrirlos (con hash)
//   fm-embed.css     estilos de la app, reescritos para vivir en un shadow root
//   fm-fonts.css     @font-face (no funcionan dentro de un shadow root)
//   assets/*         fuentes
//
// No es "library mode" a propósito: en ese modo Vite incrusta las fuentes en
// base64 dentro del CSS (cientos de kB). Con un build normal sin HTML los
// assets salen como archivos y con base "./" las URLs quedan relativas al
// script, así funciona igual detrás del proxy de Odoo (/fm/embed/) o en el
// dominio del motor (/embed/).
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const BUILD_ID = Date.now().toString(36);

// Separa el CSS en lo que va dentro del shadow root y lo que va en el documento.
export function splitShadowCss(css: string): { shadow: string; fonts: string } {
  const fonts: string[] = [];
  let shadow = css.replace(/@font-face\s*\{[^}]*\}/g, (rule) => {
    fonts.push(rule);
    return "";
  });
  shadow = shadow
    // Variables y estilos base de la app apuntan a :root/html/body; adentro del
    // shadow root el equivalente es :host. `body.viewer-open` y similares no se
    // tocan (los resuelve DOCUMENT_CSS en fm-embed.jsx).
    .replace(/:root\b/g, ":host")
    .replace(/(^|[{},;\s])(html|body)(?=\s*[,{])/g, "$1:host");
  // Vite resolvió url(./x.woff2) relativo al CSS dentro de assets/; los .css
  // finales quedan un nivel arriba.
  const fixUrls = (text: string) => text.replace(/url\(\.\/(?!assets\/)/g, "url(./assets/");
  return { shadow: fixUrls(shadow), fonts: fixUrls(fonts.join("\n")) };
}

function shadowCssPlugin(): Plugin {
  return {
    name: "fm-shadow-css",
    enforce: "post",
    generateBundle(_options, bundle) {
      // Puede haber más de un .css (uno por entrada/chunk aun sin code
      // splitting): se juntan en orden y se emiten una sola vez.
      const sources: string[] = [];
      for (const [fileName, asset] of Object.entries(bundle)) {
        if (asset.type !== "asset" || !fileName.endsWith(".css")) continue;
        sources.push(String(asset.source));
        delete bundle[fileName];
      }
      const { shadow, fonts } = splitShadowCss(sources.join("\n"));
      this.emitFile({ type: "asset", fileName: "fm-embed.css", source: shadow });
      this.emitFile({ type: "asset", fileName: "fm-fonts.css", source: fonts });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), shadowCssPlugin()],
  define: {
    __FM_BUILD_ID__: JSON.stringify(BUILD_ID),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  publicDir: false,
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public/embed"),
    emptyOutDir: true,
    // Un solo CSS: con code splitting Vite inyectaría el CSS de cada chunk en
    // <head> del documento, fuera del shadow root.
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/embed/fm-embed.jsx"),
      // Sin esto Rollup puede quitar los exports y dejar vacía la entrada.
      preserveEntrySignatures: "exports-only",
      output: {
        format: "es",
        entryFileNames: "fm-embed.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
