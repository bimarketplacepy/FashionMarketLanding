// Sesión anónima del probador.
//
// El probador es público y no tiene login, pero cada visitante necesita su
// propio avatar y sus propios looks: sin esto, dos personas navegando a la vez
// se pisan el modelo en vivo y se ven los looks generados entre ellas.
//
// La identidad es un uuid opaco en una cookie httpOnly. No identifica a la
// persona ni guarda nada suyo: sólo separa un navegador de otro.

import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const SESSION_COOKIE = "fm_sid";
const MAX_AGE_DAYS = 30;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

// Formato uuid v4 exacto: cualquier otra cosa en la cookie se descarta y se
// emite una nueva, así un valor manipulado no llega a las consultas.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tryonSessionId?: string;
    }
  }
}

export function tryonSession(options: { secure: boolean }) {
  return function tryonSessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const existing = req.cookies?.[SESSION_COOKIE];
    const sessionId = typeof existing === "string" && UUID.test(existing) ? existing : randomUUID();

    // Se reemite siempre para que la ventana de 30 días se renueve mientras la
    // persona siga usando el probador.
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: options.secure,
      maxAge: MAX_AGE_MS,
      path: "/",
    });

    req.tryonSessionId = sessionId;
    next();
  };
}

export function sessionOf(req: { tryonSessionId?: string }): string {
  const sessionId = req.tryonSessionId;
  if (!sessionId) throw new Error("Falta la sesión del probador en la solicitud");
  return sessionId;
}
