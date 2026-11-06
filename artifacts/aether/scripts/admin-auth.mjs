// Autenticación del panel /admin, validada en el servidor.
//
// La clave vive en ADMIN_KEY (Secrets / .env, sin prefijo VITE_, así nunca
// entra al bundle del cliente). El panel la envía una vez a
// POST /api/admin/session; si coincide, el servidor emite una cookie httpOnly
// firmada con HMAC y de corta duración. Las rutas de escritura del catálogo
// exigen esa cookie (ver requireAdmin / adminGuard).
//
// Sin ADMIN_KEY configurada el panel queda cerrado: no hay clave por defecto.
import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "fm_admin";
const SESSION_HOURS = 8;

// Prefijos que son sólo de administración. Cualquier método que no sea de
// lectura pública sobre ellos exige sesión de admin.
const ADMIN_PREFIXES = ["/api/import/", "/api/batches", "/api/garment-regeneration"];
// Lecturas públicas: alimentan el catálogo y el probador.
const PUBLIC_READS = [/^\/api\/import\/wardrobe$/, /^\/api\/import\/library\/[\w.-]+$/];

function keyOf(env) {
  return String(env?.ADMIN_KEY || process.env.ADMIN_KEY || "");
}

function signingKey(adminKey) {
  // Cambiar ADMIN_KEY invalida todas las sesiones emitidas.
  return createHmac("sha256", "fashion-market-admin").update(adminKey).digest();
}

function sign(adminKey, payload) {
  return createHmac("sha256", signingKey(adminKey)).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookie(req, name) {
  const header = req.headers?.cookie || "";
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

function issueToken(adminKey) {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = `v1.${expires}`;
  return { token: `${payload}.${sign(adminKey, payload)}`, expires };
}

export function isAdminRequest(req, env) {
  const adminKey = keyOf(env);
  if (!adminKey) return false;
  // Scripts locales (import-catalog, reclassify-parts) se autentican con la
  // misma clave en un header; el navegador usa siempre la cookie.
  const headerKey = req.headers?.["x-admin-key"];
  if (typeof headerKey === "string" && headerKey) return safeEqual(headerKey, adminKey);
  const token = readCookie(req, ADMIN_COOKIE);
  if (!token) return false;
  const [version, expires, signature] = token.split(".");
  if (version !== "v1" || !expires || !signature) return false;
  if (!(Number(expires) > Date.now())) return false;
  return safeEqual(signature, sign(adminKey, `${version}.${expires}`));
}

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new Error("Body demasiado grande");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

function cookieHeader(value, { maxAgeSeconds, secure }) {
  return [
    `${ADMIN_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`,
    secure ? "Secure" : null,
  ].filter(Boolean).join("; ");
}

// Freno simple contra fuerza bruta: 10 intentos fallidos por IP cada 15 min.
const failures = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now - entry.since > 15 * 60 * 1000) return false;
  return entry.count >= 10;
}
function recordFailure(ip) {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || now - entry.since > 15 * 60 * 1000) failures.set(ip, { since: now, count: 1 });
  else entry.count += 1;
}

// Middleware Node (req, res, next) para /api/admin/session y para custodiar
// las rutas de escritura. Sirve tanto en Vite como en Express.
export function createAdminHandler({ env = process.env, secure = false } = {}) {
  return async function adminHandler(req, res, next) {
    const url = new URL(req.originalUrl || req.url, "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api/admin/session") {
      const adminKey = keyOf(env);
      if (req.method === "GET") return sendJson(res, 200, { authenticated: isAdminRequest(req, env), configured: Boolean(adminKey) });
      if (req.method === "DELETE") {
        res.setHeader("Set-Cookie", cookieHeader("", { maxAgeSeconds: 0, secure }));
        return sendJson(res, 200, { authenticated: false });
      }
      if (req.method === "POST") {
        if (!adminKey) return sendJson(res, 503, { error: "El panel no tiene clave configurada (falta ADMIN_KEY en el servidor)." });
        const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
        if (tooManyAttempts(ip)) return sendJson(res, 429, { error: "Demasiados intentos. Probá de nuevo en unos minutos." });
        const input = await readBody(req).catch(() => ({}));
        if (typeof input.key !== "string" || !safeEqual(input.key, adminKey)) {
          recordFailure(ip);
          return sendJson(res, 401, { error: "Clave incorrecta." });
        }
        failures.delete(ip);
        const { token } = issueToken(adminKey);
        res.setHeader("Set-Cookie", cookieHeader(token, { maxAgeSeconds: SESSION_HOURS * 3600, secure }));
        return sendJson(res, 200, { authenticated: true });
      }
      return sendJson(res, 405, { error: "Método no permitido." });
    }

    const isAdminPath = ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    const isPublicRead = (req.method === "GET" || req.method === "HEAD") && PUBLIC_READS.some((pattern) => pattern.test(pathname));
    if (isAdminPath && !isPublicRead && !isAdminRequest(req, env)) {
      return sendJson(res, 401, { error: "Necesitás iniciar sesión en el panel de administración." });
    }
    return next();
  };
}

// Plugin de Vite: monta el handler antes que los demás plugins de API.
export function adminAuthApi(options = {}) {
  return {
    name: "fashion-market-admin-auth",
    configureServer(server) {
      server.middlewares.use(createAdminHandler({ env: options.env, secure: false }));
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAdminHandler({ env: options.env, secure: false }));
    },
  };
}
