// Rescata recortes que quedaron con el fondo croma pegado.
//
//   node scripts/dechroma-garment.mjs <id>...      # procesa esos items
//   node scripts/dechroma-garment.mjs --check      # lista los que tienen croma sin sacar
//   node scripts/dechroma-garment.mjs --check <id> # revisa uno
//
// Por qué existe: `removeChromaBackground` de import-job-api.mjs mide distancia
// euclídea al croma exacto que se le pidió a la IA, y falla en dos casos reales:
//   - `chooseChromaKey()` elige el croma más lejano al color de la prenda, así
//     que para una prenda negra pide cian, pero la IA a veces devuelve verde;
//   - aunque acierte el tono, la IA devuelve un verde apagado (ej. rgb(6,170,76))
//     que queda a ~114 de #00ff00, por encima del tope de tolerancia (110).
// En ambos casos el fondo sobrevive entero y el item entra al catálogo con el
// croma puesto.
//
// Acá el matte se calcula por *verdor relativo* (d = G - max(R,B)) en vez de por
// distancia absoluta: separa igual de bien un croma apagado que uno saturado, y
// no depende de adivinar el tono exacto. El encuadre y la verificación finales
// se delegan en processChromaBackground() para que el resultado sea idéntico en
// convención (lienzo 1024, ocupación 0.88, centrado) al resto del catálogo.
//
// Los originales se respaldan una única vez en data/imported-originals/, igual
// que hace clean-garment-images.py.

import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { processChromaBackground } from "./import-job-api.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMPORTED = path.join(ROOT, "data", "imported");
const BACKUP = path.join(ROOT, "data", "imported-originals");
const LIBRARY = path.join(ROOT, "data", "library.json");

// Umbrales del matte. Medidos sobre los recortes afectados: el cuero/tela cae en
// d≈0 y el croma en d≈95, con menos del 1% de píxeles en el medio (el borde
// antialias). La rampa deja ese borde suave en vez de dentado.
const SOLID = 20; // d <= SOLID  -> prenda, opaca
const CLEAR = 80; // d >= CLEAR  -> fondo, transparente

const greenness = (r, g, b) => g - Math.max(r, b);

// Fracción del área opaca que es croma. Sirve tanto para detectar los items
// afectados como para confirmar que quedaron limpios.
export async function chromaShare(bytes) {
  const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  let chroma = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    opaque += 1;
    if (greenness(data[i], data[i + 1], data[i + 2]) >= CLEAR) chroma += 1;
  }
  return opaque ? chroma / opaque : 0;
}

// Saca el croma y el spill verde, dejando la prenda intacta. Devuelve un PNG con
// el fondo ya transparente, todavía sin reencuadrar.
async function keyOutChroma(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const d = greenness(r, g, b);

    if (d >= CLEAR) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }
    if (d > SOLID) {
      // Borde: el alpha acompaña cuánto croma tiene el píxel.
      data[i + 3] = Math.round(data[i + 3] * (1 - (d - SOLID) / (CLEAR - SOLID)));
      if (data[i + 3] <= 8) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
        continue;
      }
    }
    // Despill: el verde nunca puede superar al canal más alto de los otros dos.
    // Sobre cuero negro esto devuelve el gris real sin lavar la textura.
    if (d > 0) data[i + 1] = Math.max(r, b);
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function dechromaFile(file) {
  const original = await readFile(file);
  const before = await chromaShare(original);
  const keyed = await keyOutChroma(original);
  // Encuadre y verificación con la maquinaria del repo: mismo lienzo, misma
  // ocupación y mismo control de spill que el resto del catálogo.
  const { bytes, verification } = await processChromaBackground(keyed, "#00ff00", { tolerance: 18 });
  const after = await chromaShare(bytes);
  return { bytes, before, after, verification };
}

async function resolveTargets(ids) {
  const library = JSON.parse(await readFile(LIBRARY, "utf8"));
  const wanted = new Set(ids);
  return library
    .filter((item) => item.image && (!ids.length || wanted.has(item.id)))
    .map((item) => ({
      id: item.id,
      name: item.name,
      file: path.join(IMPORTED, path.basename(new URL(item.image, "http://localhost").pathname)),
    }));
}

async function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");
  const ids = argv.filter((value) => !value.startsWith("--"));
  const targets = await resolveTargets(ids);

  if (check) {
    let flagged = 0;
    for (const target of targets) {
      const share = await chromaShare(await readFile(target.file));
      if (share <= 0.01) continue;
      flagged += 1;
      console.log(`${(share * 100).toFixed(1).padStart(5)}%  ${target.id}  ${target.name}`);
    }
    console.log(flagged ? `\n${flagged} item(s) con croma sin sacar.` : "\nSin croma pendiente.");
    return;
  }

  if (!ids.length) {
    console.error("Pasá al menos un id, o usá --check para listar los afectados.");
    process.exitCode = 1;
    return;
  }

  await mkdir(BACKUP, { recursive: true });
  for (const target of targets) {
    const backup = path.join(BACKUP, path.basename(target.file));
    try {
      await copyFile(target.file, backup, /* COPYFILE_EXCL */ 1);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const { bytes, before, after, verification } = await dechromaFile(target.file);
    await writeFile(target.file, bytes);
    console.log(
      `${target.id}  ${target.name}\n` +
        `  croma ${(before * 100).toFixed(1)}% -> ${(after * 100).toFixed(1)}%` +
        `  | spill residual: ${verification.contaminatedPixels}px (max ${verification.maxSpill.toFixed(1)})`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
