// Store del vestidor respaldado por Postgres: es el que se usa en el deployment.
//
// Dos razones para no usar el disco acá:
//   - el deployment de autoscale tiene disco efímero y no compartido entre
//     instancias, así que lo que el probador escribe se perdería;
//   - el probador es público y sin login, y cada visitante tiene que ver su
//     propio avatar y sus propios looks. Todo se consulta por `sessionId`, que
//     sale de la cookie anónima que emite session.ts.
//
// A diferencia del store de archivos, acá no hay semilla compartida: un
// visitante nuevo arranca sin avatar (el probador lo manda a elegir modelo) y
// con la lista de looks vacía. Los looks curados desde el workspace viven en
// data/outfits.json y son parte del flujo de curaduría, no de la vista pública.
//
// El equivalente para el workspace vive en artifacts/aether/scripts/tryon-store-fs.mjs.

import { and, eq } from "drizzle-orm";
import {
  db,
  tryonModelProfileTable,
  tryonOutfitsTable,
  tryonOutfitImagesTable,
} from "@workspace/db";

type Outfit = { id: string; [key: string]: unknown };
type OutfitCollection = { version: number; outfits: Outfit[] };

export interface TryonStore {
  name: string;
  loadProfile(sessionId: string): Promise<unknown>;
  saveProfile(sessionId: string, profile: unknown): Promise<void>;
  loadOutfits(sessionId: string): Promise<OutfitCollection>;
  putOutfit(sessionId: string, outfit: Outfit): Promise<void>;
  readOutfitImage(sessionId: string, filename: string): Promise<Buffer>;
  writeOutfitImage(sessionId: string, filename: string, bytes: Buffer): Promise<void>;
}

export function createPgOutfitStore(): TryonStore {
  return {
    name: "postgres",

    async loadProfile(sessionId) {
      const [row] = await db
        .select()
        .from(tryonModelProfileTable)
        .where(eq(tryonModelProfileTable.sessionId, sessionId))
        .limit(1);
      // Sin fila = visitante nuevo. El probador lo lleva a "Mi modelo".
      return row?.profile ?? null;
    },

    async saveProfile(sessionId, profile) {
      await db
        .insert(tryonModelProfileTable)
        .values({ sessionId, profile, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: tryonModelProfileTable.sessionId,
          set: { profile, updatedAt: new Date() },
        });
    },

    async loadOutfits(sessionId) {
      const rows = await db
        .select()
        .from(tryonOutfitsTable)
        .where(eq(tryonOutfitsTable.sessionId, sessionId));
      const outfits = rows
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => row.outfit as Outfit);
      return { version: 1, outfits };
    },

    async putOutfit(sessionId, outfit) {
      const now = new Date();
      await db
        .insert(tryonOutfitsTable)
        .values({ id: outfit.id, sessionId, outfit, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: tryonOutfitsTable.id,
          // El filtro por sesión evita que un id adivinado pise el look de otra
          // persona: si no es suyo, el update no toca ninguna fila.
          setWhere: eq(tryonOutfitsTable.sessionId, sessionId),
          set: { outfit, updatedAt: now },
        });
    },

    async readOutfitImage(sessionId, filename) {
      const [row] = await db
        .select()
        .from(tryonOutfitImagesTable)
        .where(
          and(
            eq(tryonOutfitImagesTable.filename, filename),
            eq(tryonOutfitImagesTable.sessionId, sessionId),
          ),
        )
        .limit(1);
      if (!row) {
        // El handler traduce ENOENT en 404, que es lo correcto tanto si la
        // imagen no existe como si es de otra sesión.
        throw Object.assign(new Error("No se encontró la imagen del look."), { code: "ENOENT" });
      }
      return row.data;
    },

    async writeOutfitImage(sessionId, filename, bytes) {
      await db
        .insert(tryonOutfitImagesTable)
        .values({ filename, sessionId, contentType: "image/png", data: bytes, createdAt: new Date() })
        .onConflictDoUpdate({
          target: tryonOutfitImagesTable.filename,
          setWhere: eq(tryonOutfitImagesTable.sessionId, sessionId),
          set: { data: bytes, contentType: "image/png" },
        });
    },
  };
}
