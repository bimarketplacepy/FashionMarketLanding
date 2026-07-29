import type { Request, Response, NextFunction } from "express";
import http from "node:http";

// El vestidor de Aether (importación de prendas y probador virtual) corre como
// middlewares del dev server de Vite en artifacts/aether. El dominio raíz del
// workspace enruta todo /api/* a este api-server, así que estas rutas se
// reenvían al servidor de Aether para que la landing funcione sin :3000.
const AETHER_API_PREFIXES = ["/api/import/", "/api/tryon/"];
const AETHER_PORT = Number(process.env["AETHER_PORT"] || 24696);

export function aetherProxy(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    !AETHER_API_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix))
  ) {
    next();
    return;
  }

  const proxied = http.request(
    {
      host: "127.0.0.1",
      port: AETHER_PORT,
      path: req.originalUrl,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${AETHER_PORT}` },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    },
  );

  proxied.on("error", () => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res
      .status(502)
      .json({ error: "El servidor del vestidor (Aether) no está corriendo." });
  });

  req.pipe(proxied);
}
