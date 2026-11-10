// Freno de costo para la prueba virtual (cada POST /api/tryon/generate es una
// llamada paga a Gemini). Hasta ahora sólo la usaba la app propia; embebida en
// la tienda Odoo recibe mucho más tráfico.
//
// Límite diario por sesión del probador (cookie fm_sid) y por IP. En memoria:
// en autoscale cada instancia lleva su cuenta, así que el tope real es
// aproximado (alcanza como freno, no como facturación). Configurable con
// TRYON_MAX_PER_SESSION_DAY y TRYON_MAX_PER_IP_DAY (0 = sin límite).
import type { NextFunction, Request, Response } from "express";

const DAY_MS = 24 * 60 * 60 * 1000;
const counters = new Map<string, { count: number; resetAt: number }>();

const limitFrom = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

function hit(key: string, max: number, now: number): boolean {
  if (!max) return true;
  const entry = counters.get(key);
  if (!entry || entry.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + DAY_MS });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

export function clientIp(req: Request): string {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0]!.trim();
}

export function generationLimit() {
  const perSession = limitFrom("TRYON_MAX_PER_SESSION_DAY", 15);
  const perIp = limitFrom("TRYON_MAX_PER_IP_DAY", 60);
  return function generationLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== "POST" || req.path !== "/api/tryon/generate") {
      next();
      return;
    }
    const now = Date.now();
    if (counters.size > 50_000) {
      for (const [key, entry] of counters) if (entry.resetAt <= now) counters.delete(key);
    }
    const sid = (req as Request & { tryonSessionId?: string }).tryonSessionId || "sin-sesion";
    if (!hit(`s:${sid}`, perSession, now) || !hit(`ip:${clientIp(req)}`, perIp, now)) {
      res.status(429).json({ error: "Llegaste al límite de pruebas virtuales por hoy. Volvé a intentarlo mañana." });
      return;
    }
    next();
  };
}
