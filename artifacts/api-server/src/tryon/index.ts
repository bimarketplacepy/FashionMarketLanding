// Montaje del vestidor virtual.
//
// En el workspace el backend del vestidor corre como plugins del dev server de
// Vite (artifacts/aether/scripts/*.mjs) y este api-server sólo reenvía. En el
// deployment no corre ningún proceso de Vite: se sirve el build estático, así
// que acá se monta el mismo handler directamente sobre Express, con la
// persistencia en Postgres en vez de archivos.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Router, type IRouter, type Request, type Response } from "express";
import { createTryonHandler } from "../../../aether/scripts/outfit-api.mjs";
import { createIpxHandler } from "../../../aether/scripts/responsive-image-api.mjs";
import { createPgOutfitStore } from "./pgStore";
import { aetherProxy } from "../middlewares/aetherProxy";
import { logger } from "../lib/logger";

// El bundle corre desde artifacts/api-server/dist/, y el repo entero viaja al
// deployment (.replitignore sólo excluye .local), así que data/ y public/ de
// aether están disponibles como semilla de sólo lectura.
const distDir = path.dirname(fileURLToPath(import.meta.url));
const AETHER_ROOT = process.env["AETHER_ROOT"] ?? path.resolve(distDir, "../../aether");
const AETHER_DATA_DIR = path.resolve(AETHER_ROOT, process.env["WARDROBE_DATA_DIR"] ?? "data");

// Rutas de administración (importar catálogo con IA, regenerar prendas) que
// siguen viviendo sólo como plugins de Vite: se cargan desde el workspace y el
// resultado se publica commiteado.
const ADMIN_ONLY_PREFIXES = ["/api/import/", "/api/garment-regeneration"];

function isDeployment(): boolean {
  const mode = process.env["TRYON_MODE"];
  if (mode === "local") return true;
  if (mode === "proxy") return false;
  return (
    process.env["REPLIT_DEPLOYMENT"] === "1" ||
    process.env["NODE_ENV"] === "production"
  );
}

export function tryonRouter(): IRouter {
  const router = Router();

  // ipx se monta siempre: es el que sirve las imágenes responsive del catálogo y
  // en el dominio raíz todo /api/* llega acá, tanto en dev como en producción.
  const ipx = createIpxHandler({
    dirs: [
      path.resolve(AETHER_ROOT, "public"),
      path.resolve(AETHER_ROOT, "dist/public"),
    ],
  });
  router.use("/api/_ipx", (req, res) => ipx(req, res));

  if (!isDeployment()) {
    // Workspace: el dev server de Vite es la fuente de verdad y escribe los
    // JSON de data/, que es como se curan los looks que después se commitean.
    router.use(aetherProxy);
    return router;
  }

  router.use(ADMIN_ONLY_PREFIXES, (_req: Request, res: Response) => {
    res.status(503).json({
      error:
        "La administración del catálogo sólo está disponible en el workspace. Importá las prendas ahí y publicá para verlas acá.",
    });
  });

  const handler = createTryonHandler({
    root: AETHER_ROOT,
    env: process.env,
    store: createPgOutfitStore({ dataDir: AETHER_DATA_DIR }),
  });
  router.use((req, res, next) => handler(req, res, next));

  logger.info({ root: AETHER_ROOT, store: "postgres" }, "Vestidor montado en api-server");
  return router;
}
