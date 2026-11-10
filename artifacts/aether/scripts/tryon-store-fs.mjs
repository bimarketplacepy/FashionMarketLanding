// Store del vestidor respaldado por archivos: es el que se usa en el workspace.
// Mantiene el formato histórico (data/model-profile.json, data/outfits.json y
// los PNG en data/outfit-images/) para que los looks curados se sigan
// commiteando y viajen al deployment como semilla de sólo lectura.
//
// El equivalente para producción vive en artifacts/api-server/src/tryon/pgStore.ts.

import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

async function atomicJson(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try {
    await rename(tmp, file);
  } catch (error) {
    if (!["EBUSY", "EXDEV", "EPERM"].includes(error.code)) {
      await rm(tmp, { force: true });
      throw error;
    }
    await copyFile(tmp, file);
    await rm(tmp, { force: true });
  }
}

// Normaliza el archivo de looks: versiones viejas guardaban un array pelado.
export function normalizeOutfits(value) {
  if (Array.isArray(value)) return { version: 1, outfits: value };
  if (value && typeof value === "object" && Array.isArray(value.outfits)) {
    return { version: 1, outfits: value.outfits };
  }
  return { version: 1, outfits: [] };
}

// Lee los looks commiteados en data/outfits.json. En producción son la semilla
// de sólo lectura sobre la que el store de Postgres superpone lo generado.
export async function readSeedOutfits(outfitsFile) {
  try {
    return normalizeOutfits(JSON.parse(await readFile(outfitsFile, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, outfits: [] };
    throw error;
  }
}

export async function readSeedProfile(modelProfileFile) {
  try {
    return JSON.parse(await readFile(modelProfileFile, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function createFsOutfitStore({ dataDir }) {
  const outfitsFile = path.join(dataDir, "outfits.json");
  const modelProfileFile = path.join(dataDir, "model-profile.json");
  const outfitImagesDir = path.join(dataDir, "outfit-images");

  await mkdir(dataDir, { recursive: true });
  await mkdir(outfitImagesDir, { recursive: true });

  // El parámetro `sessionId` se recibe y se ignora a propósito: el workspace lo
  // usa una sola persona curando el catálogo, y el estado tiene que quedar en
  // los archivos que después se commitean. Las sesiones por visitante son cosa
  // del deployment (ver pgStore.ts).
  return {
    name: "fs",

    loadProfile: (_sessionId) => readSeedProfile(modelProfileFile),

    saveProfile: (_sessionId, profile) => atomicJson(modelProfileFile, profile),

    loadOutfits: (_sessionId) => readSeedOutfits(outfitsFile),

    async putOutfit(_sessionId, outfit) {
      const collection = await readSeedOutfits(outfitsFile);
      collection.outfits = [
        ...collection.outfits.filter((item) => item.id !== outfit.id),
        outfit,
      ];
      await atomicJson(outfitsFile, collection);
    },

    readOutfitImage: (_sessionId, filename) =>
      readFile(path.join(outfitImagesDir, path.basename(filename))),

    writeOutfitImage: (_sessionId, filename, bytes) =>
      writeFile(path.join(outfitImagesDir, path.basename(filename)), bytes),
  };
}
