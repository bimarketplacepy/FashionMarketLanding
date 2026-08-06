import path from "node:path";
import { createIPX, createIPXNodeServer, ipxFSStorage } from "ipx";

const DEFAULT_MAX_AGE = 24 * 60 * 60;

// Handler de imágenes responsive desacoplado de Vite, para que lo pueda montar
// también Express en el deployment (ahí no corre ningún servidor de Vite).
export function createIpxHandler({ dirs, maxAge = DEFAULT_MAX_AGE }) {
  const storage = ipxFSStorage({ dir: dirs, maxAge });
  return createIPXNodeServer(createIPX({ storage }));
}

export function responsiveImageApi(options = {}) {
  let handler;

  const attach = (server) => {
    server.middlewares.use("/api/_ipx", (req, res, next) => {
      if (!handler) return next();
      return handler(req, res);
    });
  };

  return {
    name: "wardrobe-responsive-images",
    apply: "serve",
    configResolved(config) {
      const publicDir = path.resolve(config.publicDir || path.join(config.root, "public"));
      const buildDir = path.resolve(config.root, config.build.outDir || "dist");
      handler = createIpxHandler({
        dirs: [publicDir, buildDir],
        maxAge: options.maxAge || DEFAULT_MAX_AGE,
      });
    },
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
