// Montaje del vestidor virtual.
//
// En el workspace el backend del vestidor corre como plugins del dev server de
// Vite (artifacts/aether/scripts/*.mjs) y este api-server sólo reenvía. En el
// deployment no corre ningún proceso de Vite: se sirve el build estático, así
// que acá se monta el mismo handler directamente sobre Express, con la
// persistencia en Postgres en vez de archivos.

import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import cookieParser from "cookie-parser";
import { Router, type IRouter, type Request, type Response } from "express";
import { createTryonHandler } from "../../../aether/scripts/outfit-api.mjs";
import { createIpxHandler } from "../../../aether/scripts/responsive-image-api.mjs";
import { createAdminHandler } from "../../../aether/scripts/admin-auth.mjs";
import { toPublicCatalog } from "../../../aether/scripts/public-catalog.mjs";
import { buildLandingPayload } from "../../../aether/scripts/landing-payload.mjs";
import { createPgOutfitStore } from "./pgStore";
import { tryonSession, sessionOf } from "./session";
import { aetherProxy } from "../middlewares/aetherProxy";
import { logger } from "../lib/logger";

// El bundle corre desde artifacts/api-server/dist/, y el repo entero viaja al
// deployment (.replitignore sólo excluye .local), así que data/ y public/ de
// aether están disponibles como semilla de sólo lectura.
const distDir = path.dirname(fileURLToPath(import.meta.url));
const AETHER_ROOT = process.env["AETHER_ROOT"] ?? path.resolve(distDir, "../../aether");

// Rutas de administración (importar catálogo con IA, regenerar prendas) que
// siguen viviendo sólo como plugins de Vite: se cargan desde el workspace y el
// resultado se publica commiteado.
const ADMIN_ONLY_PREFIXES = ["/api/import/", "/api/batches", "/api/garment-regeneration"];

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

  // Catálogo público de sólo lectura: la fuente de verdad sigue siendo
  // data/library.json + data/imported/, que se curan en el workspace y viajan
  // commiteados al deployment. Acá sólo se sirven; todo lo que escribe o usa IA
  // de importación queda detrás del 503 de abajo.
  const libraryFile = path.resolve(AETHER_ROOT, "data/library.json");
  const libraryAssetDir = path.resolve(AETHER_ROOT, "data/imported");
  const garmentDirs = [
    path.resolve(AETHER_ROOT, "dist/public/garments"),
    path.resolve(AETHER_ROOT, "public/garments"),
  ];
  async function largestGarmentVariant(stem: string): Promise<string | null> {
    for (const dir of garmentDirs) {
      const names = await readdir(dir).catch(() => [] as string[]);
      const matches = names
        .filter((name) => name.startsWith(`${stem}.`) && name.endsWith(".webp"))
        .map((name) => ({ name, width: Number(/-(\d+)\.webp$/.exec(name)?.[1] ?? 0) }))
        .sort((a, b) => b.width - a.width);
      if (matches[0]) return path.join(dir, matches[0].name);
    }
    return null;
  }

  router.get("/api/import/wardrobe", async (_req: Request, res: Response) => {
    try {
      res.type("application/json").send(await readFile(libraryFile, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        res.json([]);
        return;
      }
      logger.error({ err: error }, "No se pudo leer library.json");
      res.status(500).json({ error: "No pudimos cargar la colección." });
    }
  });

  // Catálogo público liviano (prendas activas, campos públicos). Se arma una
  // vez por proceso: library.json sólo cambia al republicar.
  // Respuestas JSON derivadas de library.json, armadas una vez por proceso
  // (library.json sólo cambia al republicar) y guardadas también comprimidas.
  type CachedJson = { json: Buffer; gzip: Buffer };
  const jsonCache = new Map<string, CachedJson>();
  function cachedJsonRoute(route: string, build: (records: Array<Record<string, unknown>>) => unknown) {
    router.get(route, async (req: Request, res: Response) => {
      try {
        let cached = jsonCache.get(route);
        if (!cached) {
          const json = Buffer.from(JSON.stringify(build(JSON.parse(await readFile(libraryFile, "utf8")))));
          cached = { json, gzip: gzipSync(json, { level: 9 }) };
          jsonCache.set(route, cached);
        }
        res.setHeader("Cache-Control", "public, max-age=300");
        res.setHeader("Vary", "Accept-Encoding");
        res.type("application/json");
        if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
          res.setHeader("Content-Encoding", "gzip");
          res.end(cached.gzip);
          return;
        }
        res.end(cached.json);
      } catch (error) {
        logger.error({ err: error, route }, "No se pudo armar la respuesta del catálogo");
        res.status(500).json({ error: "No pudimos cargar la colección." });
      }
    });
  }
  cachedJsonRoute("/api/catalog", toPublicCatalog);
  cachedJsonRoute("/api/landing", buildLandingPayload);

  router.get("/api/import/library/:file", async (req: Request, res: Response) => {
    const file = path.join(libraryAssetDir, path.basename(String(req.params["file"])));
    try {
      // Los PNG del catálogo se retocan en el workspace sin cambiar de nombre,
      // así que nada de "immutable": ETag por mtime+tamaño y revalidación con
      // 304 baratos. Un retoque queda visible con sólo republicar.
      const info = await stat(file);
      const etag = `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`;
      res.setHeader("Cache-Control", "public, no-cache");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      res.setHeader("Content-Type", "image/png");
      res.end(await readFile(file));
    } catch {
      // Los PNG maestros no viajan al deployment: se sirve la variante WebP más
      // grande de la prenda (public/garments, copiada a dist/public en el build).
      const stem = path.basename(String(req.params["file"])).replace(/\.png$/i, "");
      const variant = await largestGarmentVariant(stem);
      if (variant) {
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Content-Type", "image/webp");
        res.end(await readFile(variant));
        return;
      }
      res.status(404).json({ error: "Not found" });
    }
  });

  // Sesión del panel /admin (clave en ADMIN_KEY, cookie httpOnly firmada) y
  // custodia de las rutas de escritura: sin sesión válida responden 401 antes
  // de llegar al 503 de abajo.
  const adminAuth = createAdminHandler({
    env: process.env,
    secure: process.env["REPLIT_DEPLOYMENT"] === "1",
  });
  router.use((req, res, next) => adminAuth(req, res, next));

  router.use(ADMIN_ONLY_PREFIXES, (_req: Request, res: Response) => {
    res.status(503).json({
      error:
        "La administración del catálogo sólo está disponible en el workspace. Importá las prendas ahí y publicá para verlas acá.",
    });
  });

  const handler = createTryonHandler({
    root: AETHER_ROOT,
    env: process.env,
    store: createPgOutfitStore(),
    resolveSession: sessionOf,
  });

  // La cookie se emite sólo en las rutas del vestidor: /api/_ipx sirve imágenes
  // públicas del catálogo y no necesita identificar a nadie.
  router.use(
    "/api/tryon",
    cookieParser(),
    tryonSession({ secure: process.env["REPLIT_DEPLOYMENT"] === "1" }),
  );
  router.use((req, res, next) => handler(req, res, next));

  logger.info({ root: AETHER_ROOT, store: "postgres" }, "Vestidor montado en api-server (sesión por visitante)");
  return router;
}
