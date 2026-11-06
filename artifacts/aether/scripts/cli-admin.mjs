// Header de autenticación para los scripts de línea de comandos que llaman a
// las rutas de administración del dev server (ver scripts/admin-auth.mjs).
import { readFileSync } from "node:fs";
import path from "node:path";

function readAdminKey() {
  if (process.env.ADMIN_KEY) return process.env.ADMIN_KEY;
  try {
    const env = readFileSync(path.resolve(import.meta.dirname, "../.env"), "utf8");
    const line = env.split(/\r?\n/).find((entry) => entry.startsWith("ADMIN_KEY="));
    return line ? line.slice("ADMIN_KEY=".length).trim() : "";
  } catch {
    return "";
  }
}

export function adminHeaders() {
  const key = readAdminKey();
  return key ? { "X-Admin-Key": key } : {};
}
