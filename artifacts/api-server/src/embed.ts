// Widget embebible para la tienda Odoo.
//
// 1. GET /api/embed/* sirve el build de artifacts/aether/vite.embed.config.ts
//    (dist/public/embed). Va bajo /api/ porque el dominio raíz manda /api/* a
//    este proceso, y así se pueden poner los headers que hacen falta: Odoo
//    carga fm-embed.js como <script type="module"> y las fuentes desde otro
//    dominio, y los dos exigen CORS.
//
// 2. Modo directo (sin el proxy del módulo de Odoo, p. ej. Odoo Online): si
//    FM_EMBED_ORIGINS lista los orígenes de la tienda ("https://www.tienda.com.py"),
//    /api/landing, /api/catalog y /api/tryon/* responden con CORS con
//    credenciales a esos orígenes y la cookie del probador pasa a
//    SameSite=None (ver tryon/session.ts). Con el módulo instalado no hace falta.
import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";

const distDir = path.dirname(fileURLToPath(import.meta.url));
const AETHER_ROOT = process.env["AETHER_ROOT"] ?? path.resolve(distDir, "../../aether");
const EMBED_DIR = path.resolve(AETHER_ROOT, "dist/public/embed");

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
};

export function embedOrigins(): string[] {
  return String(process.env["FM_EMBED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

const CORS_PREFIXES = ["/api/landing", "/api/catalog", "/api/tryon/"];

export function embedRouter(): IRouter {
  const router = Router();

  router.get("/api/embed/*splat", async (req: Request, res: Response) => {
    const relative = path.normalize(decodeURIComponent(req.path.slice("/api/embed/".length)));
    const file = path.resolve(EMBED_DIR, relative);
    const ext = path.extname(file);
    if (!file.startsWith(EMBED_DIR + path.sep) || !TYPES[ext]) {
      res.status(404).end();
      return;
    }
    try {
      await stat(file);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", TYPES[ext]);
      // chunks/ y assets/ llevan hash en el nombre; la entrada y los CSS no
      // (los referencia Odoo / la entrada con ?v=build).
      const hashed = relative.startsWith("chunks/") || relative.startsWith("assets/");
      res.setHeader("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "public, max-age=300");
      res.end(await readFile(file));
    } catch {
      res.status(404).end();
    }
  });

  const origins = embedOrigins();
  if (origins.length) {
    router.use((req: Request, res: Response, next: NextFunction) => {
      const origin = String(req.headers.origin ?? "");
      if (!origin || !origins.includes(origin) || !CORS_PREFIXES.some((prefix) => req.path.startsWith(prefix))) {
        next();
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Max-Age", "600");
        res.status(204).end();
        return;
      }
      next();
    });
  }

  return router;
}
