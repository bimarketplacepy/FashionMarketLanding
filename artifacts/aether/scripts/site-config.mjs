// Lectura de data/site-config.json desde los plugins del servidor (Node).
// El front la importa en build desde src/site-config.js.
import { readFileSync } from "node:fs";
import path from "node:path";

const FILE = path.resolve(import.meta.dirname, "../data/site-config.json");

export function readSiteConfig() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
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
