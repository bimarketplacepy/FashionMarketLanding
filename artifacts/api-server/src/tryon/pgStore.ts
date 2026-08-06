// Store del vestidor respaldado por Postgres: es el que se usa en el deployment.
//
// El deployment de autoscale tiene disco efímero y no compartido entre
// instancias, así que todo lo que el probador escribe en runtime va a la base.
// Los archivos commiteados bajo artifacts/aether/data/ se siguen usando como
// semilla de sólo lectura, de modo que un deployment recién publicado ya muestra
// los looks curados desde el workspace y la base sólo guarda lo nuevo.
//
// El equivalente para el workspace vive en artifacts/aether/scripts/tryon-store-fs.mjs.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  tryonModelProfileTable,
  tryonOutfitsTable,
  tryonOutfitImagesTable,
} from "@workspace/db";

const PROFILE_ID = "default";

type Outfit = { id: string; [key: string]: unknown };
type OutfitCollection = { version: number; outfits: Outfit[] };

function normalizeOutfits(value: unknown): OutfitCollection {
  if (Array.isArray(value)) return { version: 1, outfits: value as Outfit[] };
  if (value && typeof value === "object" && Array.isArray((value as OutfitCollection).outfits)) {
    return { version: 1, outfits: (value as OutfitCollection).outfits };
  }
  return { version: 1, outfits: [] };
}

async function readJsonFile(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export interface TryonStore {
  name: string;
  loadProfile(): Promise<unknown>;
  saveProfile(profile: unknown): Promise<void>;
  loadOutfits(): Promise<OutfitCollection>;
  putOutfit(outfit: Outfit): Promise<void>;
  readOutfitImage(filename: string): Promise<Buffer>;
  writeOutfitImage(filename: string, bytes: Buffer): Promise<void>;
}

export function createPgOutfitStore({ dataDir }: { dataDir: string }): TryonStore {
  const seedOutfitsFile = path.join(dataDir, "outfits.json");
  const seedProfileFile = path.join(dataDir, "model-profile.json");
  const seedImagesDir = path.join(dataDir, "outfit-images");

  return {
    name: "postgres",

    async loadProfile() {
      const [row] = await db
        .select()
        .from(tryonModelProfileTable)
        .where(eq(tryonModelProfileTable.id, PROFILE_ID))
        .limit(1);
      if (row) return row.profile;
      // Sin elección todavía en esta base: cae al perfil commiteado.
      return readJsonFile(seedProfileFile);
    },

    async saveProfile(profile) {
      await db
        .insert(tryonModelProfileTable)
        .values({ id: PROFILE_ID, profile, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: tryonModelProfileTable.id,
          set: { profile, updatedAt: new Date() },
        });
    },

    async loadOutfits() {
      const seed = normalizeOutfits(await readJsonFile(seedOutfitsFile));
      const rows = await db.select().from(tryonOutfitsTable);
      const stored = new Map(rows.map((row) => [row.id, row.outfit as Outfit]));

      // La semilla manda el orden de los looks curados; lo guardado en la base
      // pisa esas entradas y lo nuevo se agrega al final por fecha de creación.
      const merged = seed.outfits.map((outfit) => stored.get(outfit.id) ?? outfit);
      const seedIds = new Set(seed.outfits.map((outfit) => outfit.id));
      const extra = rows
        .filter((row) => !seedIds.has(row.id))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((row) => row.outfit as Outfit);

      return { version: 1, outfits: [...merged, ...extra] };
    },

    async putOutfit(outfit) {
      const now = new Date();
      await db
        .insert(tryonOutfitsTable)
        .values({ id: outfit.id, outfit, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: tryonOutfitsTable.id,
          set: { outfit, updatedAt: now },
        });
    },

    async readOutfitImage(filename) {
      const name = path.basename(filename);
      const [row] = await db
        .select()
        .from(tryonOutfitImagesTable)
        .where(eq(tryonOutfitImagesTable.filename, name))
        .limit(1);
      if (row) return row.data;
      // Las fotos de los looks curados viajan con el repo; el handler traduce un
      // ENOENT en 404, así que se deja propagar.
      return readFile(path.join(seedImagesDir, name));
    },

    async writeOutfitImage(filename, bytes) {
      const name = path.basename(filename);
      await db
        .insert(tryonOutfitImagesTable)
        .values({ filename: name, contentType: "image/png", data: bytes, createdAt: new Date() })
        .onConflictDoUpdate({
          target: tryonOutfitImagesTable.filename,
          set: { data: bytes, contentType: "image/png" },
        });
    },
  };
}
