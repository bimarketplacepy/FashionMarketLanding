// Lectura de data/site-config.json desde los plugins del servidor (Node).
// El front la importa en build desde src/site-config.js.
import { readFileSync } from "node:fs";
import path from "node:path";

// Desde los plugins de Vite el archivo está en ../data; desde el bundle del
// api-server (artifacts/api-server/dist) está en ../../aether/data.
const CANDIDATES = [
  process.env.AETHER_ROOT && path.resolve(process.env.AETHER_ROOT, "data/site-config.json"),
  path.resolve(import.meta.dirname, "../data/site-config.json"),
  path.resolve(import.meta.dirname, "../../aether/data/site-config.json"),
].filter(Boolean);

export function readSiteConfig() {
  for (const file of CANDIDATES) {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      // siguiente candidato
    }
  }
  console.warn("[site-config] No se encontró data/site-config.json");
  return {};
}

// Colección y temporada que reciben las prendas nuevas al entrar al catálogo.
// Se lee en cada import para que cambiar la temporada no requiera reiniciar.
export function importDefaults() {
  const config = readSiteConfig();
  return {
    collection: config.importDefaults?.collection || config.activeSeason || null,
    season: config.importDefaults?.season || "all",
  };
}
