// Carpetas de trabajo del workspace que NO viajan al deployment.
//
// Fotos crudas de los lotes, originales de prendas y respaldos de
// deduplicación viven en <repo>/.local/aether-archive (excluido por
// .replitignore y por .gitignore). Hay copia verificada en App Storage bajo
// archivo/2026-11-06/ (scripts/maintenance/archive-to-storage.mjs).
// Se puede apuntar a otro lugar con AETHER_PRIVATE_DATA.
import path from "node:path";

export const PRIVATE_DATA = process.env.AETHER_PRIVATE_DATA
  || path.resolve(import.meta.dirname, "../../../.local/aether-archive");

export const BATCHES_DIR = path.join(PRIVATE_DATA, "batches");
export const ORIGINALS_DIR = path.join(PRIVATE_DATA, "imported-originals");
