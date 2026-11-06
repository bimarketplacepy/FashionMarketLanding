// API de importación por carpetas: lotes de fotos de prendas que se revisan
// y aprueban una por una antes de entrar al catálogo (library.json).
// Rutas bajo /api/batches. La IA vive en services/vision-provider.mjs.
import { randomUUID } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  CATEGORY_LABELS_ES,
  PUBLIC_TO_INTERNAL,
  buildAnalysisPrompt,
  createVisionProvider,
  fileHint,
  parseAnalysisResults,
} from "./services/vision-provider.mjs";
import { inferGarmentGender, normalizeGarmentType } from "../shared/garment-gender.mjs";

const ASSET_ROOT = "/api/batches/assets";
const LIBRARY_ASSET_ROOT = "/api/import/library";
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const PARTS = new Set(["upperbody", "wholebody_up", "lowerbody", "shoes", "accessories_up"]);
const HEX = /^#[0-9a-f]{6}$/i;
const INTERNAL_TO_PUBLIC = Object.fromEntries(Object.entries(PUBLIC_TO_INTERNAL).map(([pub, internal]) => [internal, pub]));

const DEFAULT_SIZES = {
  upperbody: ["XS", "S", "M", "L", "XL"],
  wholebody_up: ["XS", "S", "M", "L"],
  lowerbody: ["36", "38", "40", "42", "44"],
  shoes: ["35", "36", "37", "38", "39", "40"],
  accessories_up: ["Único"],
};

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}

async function body(req, limit = 30 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("El archivo supera el tamaño máximo permitido."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("Se esperaba un cuerpo JSON."), { status: 400 }); }
}

function decodeDataUrl(raw, fallbackMime = "image/jpeg") {
  if (!raw || typeof raw !== "string") throw Object.assign(new Error("Falta la imagen."), { status: 400 });
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  const data = Buffer.from(match?.[2] || raw, "base64");
  if (!data.length) throw Object.assign(new Error("La imagen llegó vacía."), { status: 400 });
  return { data, mime: match?.[1] || fallbackMime };
}

async function atomicJson(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  try { await rename(tmp, file); }
  catch (error) {
    if (!["EBUSY", "EXDEV", "EPERM"].includes(error.code)) { await rm(tmp, { force: true }); throw error; }
    await copyFile(tmp, file);
    await rm(tmp, { force: true });
  }
}

// Extractor ZIP mínimo (métodos stored y deflate) sin dependencias nuevas.
function extractZip(buffer) {
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 22 - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw Object.assign(new Error("El archivo ZIP no es válido."), { status: 400 });
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = [];
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    try {
      files.push({ name, data: method === 8 ? inflateRawSync(data) : method === 0 ? Buffer.from(data) : null });
    } catch { files.push({ name, data: null }); }
  }
  return files;
}

function isImportableImage(relativePath) {
  const base = path.posix.basename(relativePath.replaceAll("\\", "/"));
  if (base.startsWith(".") || relativePath.includes("__MACOSX")) return false;
  return IMAGE_EXT.test(base);
}

const prettyName = (fileName) => {
  const base = fileName.replace(/\.[^.]+$/, "").replaceAll(/[-_]+/g, " ").trim();
  return base ? base[0].toUpperCase() + base.slice(1) : "Prenda nueva";
};

// ---------- Detección de duplicados (fuzzy, cross-idioma ES/EN) ----------

const TOKEN_MAP = {
  remera: "tshirt", camiseta: "tshirt", tshirt: "tshirt", tee: "tshirt", playera: "tshirt",
  camisa: "shirt", shirt: "shirt", blusa: "shirt",
  pantalon: "pants", pants: "pants", trousers: "pants", chino: "pants",
  jean: "jeans", jeans: "jeans", denim: "jeans", vaquero: "jeans",
  campera: "jacket", jacket: "jacket", chaqueta: "jacket", cazadora: "jacket",
  buzo: "hoodie", hoodie: "hoodie", sweatshirt: "hoodie",
  sweater: "sweater", sueter: "sweater", pullover: "sweater",
  abrigo: "coat", coat: "coat", tapado: "coat", parka: "coat",
  vestido: "dress", dress: "dress",
  falda: "skirt", pollera: "skirt", skirt: "skirt",
  zapatilla: "sneaker", zapatillas: "sneaker", sneaker: "sneaker", sneakers: "sneaker",
  zapato: "shoe", zapatos: "shoe", shoe: "shoe", shoes: "shoe",
  bota: "boot", botas: "boot", boot: "boot", boots: "boot",
  gorra: "cap", cap: "cap", gorro: "beanie", beanie: "beanie",
  bufanda: "scarf", scarf: "scarf", cinturon: "belt", belt: "belt",
  blanca: "white", blanco: "white", white: "white",
  negra: "black", negro: "black", black: "black",
  azul: "blue", blue: "blue", celeste: "lightblue",
  roja: "red", rojo: "red", red: "red",
  verde: "green", green: "green", oliva: "olive", olive: "olive",
  gris: "gray", grey: "gray", gray: "gray",
  marron: "brown", brown: "brown", camel: "camel", beige: "beige", crema: "cream", cream: "cream",
  bordo: "burgundy", burgundy: "burgundy", vino: "burgundy",
  cuello: "neck", neck: "neck", redondo: "crew", crew: "crew",
  manga: "sleeve", sleeve: "sleeve", corta: "short", corto: "short", short: "short", larga: "long", largo: "long", long: "long",
  grafica: "graphic", grafico: "graphic", graphic: "graphic", estampada: "graphic", estampado: "graphic",
  recta: "straight", recto: "straight", straight: "straight",
  clara: "light", claro: "light", light: "light", oscura: "dark", oscuro: "dark", dark: "dark", lavado: "washed", washed: "washed",
  cuero: "leather", leather: "leather", lana: "wool", wool: "wool", lino: "linen", linen: "linen", algodon: "cotton", cotton: "cotton",
};

const STOPWORDS = new Set(["de", "la", "el", "con", "para", "en", "the", "and", "un", "una"]);

function nameTokens(value = "") {
  const normalized = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return new Set(
    normalized.split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !STOPWORDS.has(token))
      .map((token) => TOKEN_MAP[token] || token),
  );
}

// Distancia RGB entre dos hex; null si alguno no es válido.
function colorDistance(a, b) {
  if (!/^#[0-9a-f]{6}$/i.test(a || "") || !/^#[0-9a-f]{6}$/i.test(b || "")) return null;
  const rgb = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// Dos prendas con nombre parecido pero color claramente distinto no son duplicadas
// (ej. "Top escote cuadrado rojo" vs "Top corset blanco con escote cuadrado").
const DISTINCT_COLOR = 90;

// Un duplicado real es el mismo producto de la misma marca: con batchId sólo se
// compara contra prendas importadas desde ese lote, y el nombre tiene que
// coincidir en la mayoría de sus palabras (no en genéricas como "pantalón tiro alto").
export function findDuplicate(nombre, categoriaInterna, records, color = null, batchId = null) {
  const tokens = nameTokens(nombre);
  if (!tokens.size) return null;
  let best = null;
  for (const record of records) {
    if (categoriaInterna && record.part !== categoriaInterna) continue;
    if (batchId && record.importBatch?.id !== batchId) continue;
    if ((colorDistance(color, record.color) ?? 0) > DISTINCT_COLOR) continue;
    const other = nameTokens(record.name);
    if (!other.size) continue;
    const shared = [...tokens].filter((token) => other.has(token)).length;
    const score = shared / (batchId ? Math.max(tokens.size, other.size) : Math.min(tokens.size, other.size));
    if (shared >= 2 && score >= 0.6 && (!best || score > best.score)) best = { id: record.id, name: record.name, score: Math.round(score * 100) / 100 };
  }
  return best;
}

// ---------- Estados de item ----------
// pendiente → (en_cola → analizando → esperando_cuota)* → analizada | error
// analizada → importada | descartada. La advertencia es un texto adjunto.

function counters(batch) {
  const result = { total: 0, pendientes: 0, analizadas: 0, aprobadas: 0, descartadas: 0, errores: 0 };
  for (const item of batch.items) {
    result.total += 1;
    if (item.estado === "importada") result.aprobadas += 1;
    else if (item.estado === "descartada") result.descartadas += 1;
    else if (item.estado === "error") result.errores += 1;
    else if (item.estado === "analizada") result.analizadas += 1;
    else result.pendientes += 1;
  }
  return result;
}

function publicItem(item) {
  const { errorDetail, ...rest } = item;
  return rest;
}

export function batchImportApi(options = {}) {
  let root;
  let batchesDir;
  let libraryFile;
  let libraryAssetDir;
  const setting = (name, fallback = "") => options.env?.[name] || process.env[name] || fallback;
  const vision = createVisionProvider(setting);
  const runners = new Map();
  // Bandera global de cuota agotada: la UI la muestra como UN banner, nunca
  // como error repetido por item.
  let quotaExhausted = false;

  async function loadBatch(id) {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return null;
    try { return JSON.parse(await readFile(path.join(batchesDir, id, "batch.json"), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }

  async function saveBatch(batch) {
    batch.updatedAt = new Date().toISOString();
    await atomicJson(path.join(batchesDir, batch.id, "batch.json"), batch);
  }

  async function loadLibrary() {
    try { return JSON.parse(await readFile(libraryFile, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }

  async function addItem(batch, { data, fileName, folderName }) {
    const id = randomUUID();
    const ext = (fileName.match(/\.(jpe?g|png|webp)$/i)?.[0] || ".jpg").toLowerCase();
    const file = `${id}${ext}`;
    await writeFile(path.join(batchesDir, batch.id, file), data);
    const hint = fileHint(fileName, folderName);
    const item = {
      id,
      fileName,
      folderName: folderName || null,
      file,
      estado: "pendiente",
      error: null,
      advertencia: null,
      duplicateOf: null,
      targetGarment: null,
      importedId: null,
      analysisRaw: null,
      ficha: {
        nombre: prettyName(fileName),
        categoriaInterna: hint ? PUBLIC_TO_INTERNAL[hint.categoria] : null,
        subcategoria: "",
        colores: [],
        descripcion: "",
        precio: null,
        prendaCompleta: true,
        prendaPrincipal: "",
        prendasSecundarias: [],
        confianza: null,
      },
      createdAt: new Date().toISOString(),
    };
    batch.items.push(item);
    return item;
  }

  // Vuelca un resultado de análisis validado sobre un item del lote.
  async function applyAnalysis(batch, item, result, rawSource) {
    const records = await loadLibrary();
    item.ficha = {
      ...item.ficha,
      nombre: result.nombre,
      categoriaInterna: result.categoriaInterna,
      garmentType: result.garmentType,
      gender: result.gender,
      subcategoria: result.subcategoria,
      colores: result.colores,
      descripcion: result.descripcion,
      prendaCompleta: result.prendaCompleta,
      prendaPrincipal: result.prendaPrincipal,
      prendasSecundarias: result.prendasSecundarias,
      confianza: result.confianza,
    };
    item.analysisRaw = rawSource || result;
    const warnings = [];
    if (!result.prendaCompleta) warnings.push("Prenda incompleta en foto — revisar; conviene reemplazar la imagen.");
    const hint = fileHint(item.fileName, item.folderName || "");
    if (hint && PUBLIC_TO_INTERNAL[hint.categoria] !== result.categoriaInterna) {
      warnings.push(`El nombre del archivo sugiere ${CATEGORY_LABELS_ES[hint.categoria]} ("${hint.keyword}") pero el análisis propuso otra categoría.`);
    }
    item.advertencia = warnings.length ? warnings.join(" ") : null;
    item.duplicateOf = findDuplicate(result.nombre, result.categoriaInterna, records, result.colores?.[0], batch.id);
    item.estado = "analizada";
    item.error = null;
    item.errorDetail = null;
  }

  // Corre el análisis automático (gemini/openai) sobre los items en cola.
  function runAnalysis(batchId) {
    if (runners.has(batchId)) return runners.get(batchId);
    const task = (async () => {
      for (;;) {
        const batch = await loadBatch(batchId);
        if (!batch) return;
        const item = batch.items.find((entry) => entry.estado === "en_cola");
        if (!item) return;
        item.estado = "analizando";
        await saveBatch(batch);
        try {
          const imageBytes = await readFile(path.join(batchesDir, batchId, item.file));
          const result = await vision.analizarPrenda({
            imageBytes,
            fileName: item.fileName,
            folderName: item.folderName,
            targetGarment: item.targetGarment,
            onStatus: (estado) => {
              // Estado transitorio visible en la UI durante el backoff por cuota.
              loadBatch(batchId).then((fresh) => {
                if (!fresh) return;
                const entry = fresh.items.find((candidate) => candidate.id === item.id);
                if (entry && ["analizando", "esperando_cuota"].includes(entry.estado)) {
                  entry.estado = estado;
                  return saveBatch(fresh);
                }
              }).catch(() => {});
            },
          });
          const fresh = await loadBatch(batchId);
          if (!fresh) return;
          const entry = fresh.items.find((candidate) => candidate.id === item.id);
          if (!entry) continue;
          await applyAnalysis(fresh, entry, result, result);
          quotaExhausted = false;
          await saveBatch(fresh);
        } catch (error) {
          const fresh = await loadBatch(batchId);
          if (!fresh) return;
          const entry = fresh.items.find((candidate) => candidate.id === item.id);
          if (!entry) continue;
          if (error.quota) {
            // Sin cuota: banner único global; los items vuelven a pendiente
            // para reintentarlos cuando haya cuota, sin error por item.
            quotaExhausted = true;
            entry.estado = "pendiente";
            for (const other of fresh.items) if (other.estado === "en_cola") other.estado = "pendiente";
            await saveBatch(fresh);
            return;
          }
          entry.estado = "error";
          entry.error = error.humano || "El análisis falló. Probá de nuevo.";
          entry.errorDetail = error.detail || error.message;
          await saveBatch(fresh);
        }
      }
    })().finally(() => runners.delete(batchId));
    runners.set(batchId, task);
    return task;
  }

  // Importa un item aprobado al catálogo real (library.json).
  async function importItem(batch, item, { unifyWith = null, force = false } = {}) {
    if (!item.ficha?.nombre || !item.ficha.categoriaInterna) {
      throw Object.assign(new Error("La ficha necesita nombre y categoría antes de importar."), { status: 409 });
    }
    if (item.estado === "importada") throw Object.assign(new Error("Esta prenda ya fue importada."), { status: 409 });
    const records = await loadLibrary();
    const sourceFile = path.join(batchesDir, batch.id, item.file);
    await mkdir(libraryAssetDir, { recursive: true });
    if (unifyWith) {
      const target = records.find((record) => record.id === unifyWith);
      if (!target) throw Object.assign(new Error("No se encontró la prenda existente para unificar."), { status: 404 });
      const extraName = `${target.id}-extra-${item.id}.png`;
      await writeFile(path.join(libraryAssetDir, extraName), await sharp(sourceFile).rotate().png().toBuffer());
      target.extraImages = [...(target.extraImages || []), `${LIBRARY_ASSET_ROOT}/${extraName}`];
      await atomicJson(libraryFile, records);
      item.estado = "importada";
      item.importedId = target.id;
      item.duplicateOf = null;
      return { unified: true, record: target };
    }
    if (item.duplicateOf && !force) {
      throw Object.assign(new Error(`Posible duplicado de "${item.duplicateOf.name}": elegí Unificar o Crear igual.`), { status: 409 });
    }
    const id = `import-${randomUUID()}`;
    const garmentName = `${id}-garment.png`;
    let image = sharp(sourceFile).rotate();
    if (item.ficha.recorte) {
      const meta = await image.metadata();
      const box = item.ficha.recorte;
      image = image.extract({
        left: Math.max(0, Math.round((box.x / 1000) * meta.width)),
        top: Math.max(0, Math.round((box.y / 1000) * meta.height)),
        width: Math.min(meta.width, Math.round((box.width / 1000) * meta.width)) || meta.width,
        height: Math.min(meta.height, Math.round((box.height / 1000) * meta.height)) || meta.height,
      });
    }
    await writeFile(path.join(libraryAssetDir, garmentName), await image.png().toBuffer());
    const ficha = item.ficha;
    const record = {
      id,
      name: ficha.nombre,
      part: ficha.categoriaInterna,
      garmentType: normalizeGarmentType(ficha.garmentType, ficha.categoriaInterna),
      color: ficha.colores[0] || "#d8d0c2",
      secondaryColor: ficha.colores[1] || null,
      palette: ficha.colores.length ? ficha.colores : ["#d8d0c2"],
      tags: [ficha.subcategoria].filter(Boolean).map((tag) => tag.toLowerCase().slice(0, 40)),
      season: "all",
      material: "mixed",
      silhouette: "regular",
      weight: "medium",
      climates: ["mild"],
      occasions: ["casual"],
      image: `${LIBRARY_ASSET_ROOT}/${garmentName}`,
      thumbnail: `${LIBRARY_ASSET_ROOT}/${garmentName}`,
      modeledImage: null,
      importJobId: null,
      gender: inferGarmentGender({
        name: ficha.nombre,
        part: ficha.categoriaInterna,
        garmentType: ficha.garmentType,
        gender: ficha.gender,
        tags: [ficha.subcategoria],
      }),
      sizes: DEFAULT_SIZES[ficha.categoriaInterna] || ["Único"],
      description: ficha.descripcion || "",
      price: Number.isFinite(ficha.precio) ? ficha.precio : null,
      importBatch: { id: batch.id, name: batch.name },
      importedAt: new Date().toISOString(),
      analysis: item.analysisRaw || null,
    };
    await atomicJson(libraryFile, [...records, record]);
    item.estado = "importada";
    item.importedId = id;
    return { unified: false, record };
  }

  function patchFicha(item, input) {
    const ficha = item.ficha;
    if (typeof input.nombre === "string" && input.nombre.trim()) ficha.nombre = input.nombre.trim().slice(0, 120);
    if (PARTS.has(input.categoriaInterna)) ficha.categoriaInterna = input.categoriaInterna;
    else if (PUBLIC_TO_INTERNAL[input.categoria]) ficha.categoriaInterna = PUBLIC_TO_INTERNAL[input.categoria];
    if (Array.isArray(input.colores)) {
      ficha.colores = input.colores.filter((color) => typeof color === "string" && HEX.test(color.trim())).map((color) => color.trim().toLowerCase()).slice(0, 3);
    }
    if ("precio" in input) {
      const parsed = Number(input.precio);
      ficha.precio = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    }
    if (typeof input.descripcion === "string") ficha.descripcion = input.descripcion.trim().slice(0, 600);
    if (typeof input.subcategoria === "string") ficha.subcategoria = input.subcategoria.trim().slice(0, 80);
    if (typeof input.garmentType === "string") ficha.garmentType = normalizeGarmentType(input.garmentType, ficha.categoriaInterna);
    if (["mujer", "hombre", "unisex"].includes(input.gender)) ficha.gender = inferGarmentGender({ ...ficha, name: ficha.nombre, tags: [ficha.subcategoria], gender: input.gender });
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/batches")) return next();
    try {
      if (url.pathname === "/api/batches/config" && req.method === "GET") {
        return json(res, 200, { provider: vision.name, auto: vision.auto, hasApiKey: vision.hasApiKey, quotaExhausted });
      }
      const assetMatch = url.pathname.match(/^\/api\/batches\/assets\/([a-f0-9-]{36})\/([\w.-]+)$/i);
      if (assetMatch && req.method === "GET") {
        const file = path.join(batchesDir, assetMatch[1], path.basename(assetMatch[2]));
        await stat(file);
        const mime = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.end(await readFile(file));
      }
      if (url.pathname === "/api/batches" && req.method === "GET") {
        const ids = await readdir(batchesDir).catch(() => []);
        const batches = (await Promise.all(ids.map((id) => loadBatch(id)))).filter(Boolean)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return json(res, 200, batches.map((batch) => ({ id: batch.id, name: batch.name, createdAt: batch.createdAt, counters: counters(batch) })));
      }
      if (url.pathname === "/api/batches" && req.method === "POST") {
        const input = await body(req);
        const id = randomUUID();
        const name = typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 80) : `Lote ${new Date().toLocaleDateString("es")}`;
        const batch = { id, name, createdAt: new Date().toISOString(), items: [] };
        await mkdir(path.join(batchesDir, id), { recursive: true });
        await saveBatch(batch);
        return json(res, 201, { id, name, createdAt: batch.createdAt, counters: counters(batch) });
      }
      const match = url.pathname.match(/^\/api\/batches\/([a-f0-9-]{36})(?:\/(.*))?$/i);
      if (!match) return json(res, 404, { error: "Ruta no encontrada." });
      const batch = await loadBatch(match[1]);
      if (!batch) return json(res, 404, { error: "El lote no existe." });
      const action = match[2] || "";

      if (!action && req.method === "GET") {
        return json(res, 200, { ...batch, items: batch.items.map(publicItem), counters: counters(batch), quotaExhausted });
      }
      if (!action && req.method === "DELETE") {
        await rm(path.join(batchesDir, batch.id), { recursive: true, force: true });
        return json(res, 200, { deleted: true });
      }
      if (action === "images" && req.method === "POST") {
        const input = await body(req);
        const fileName = typeof input.fileName === "string" && input.fileName.trim() ? path.basename(input.fileName.trim()) : "imagen.jpg";
        if (!isImportableImage(fileName)) return json(res, 415, { error: `"${fileName}" no es un formato de imagen soportado (jpg, jpeg, png, webp).` });
        const { data } = decodeDataUrl(input.imageDataUrl || input.imageBase64);
        const item = await addItem(batch, { data, fileName, folderName: typeof input.folderName === "string" ? input.folderName.trim().slice(0, 80) || null : null });
        await saveBatch(batch);
        return json(res, 201, publicItem(item));
      }
      if (action === "zip" && req.method === "POST") {
        const input = await body(req, 300 * 1024 * 1024);
        const { data } = decodeDataUrl(input.zipDataUrl || input.zipBase64, "application/zip");
        const entries = extractZip(data);
        let agregadas = 0;
        let ignoradas = 0;
        for (const entry of entries) {
          if (!entry.data || !isImportableImage(entry.name)) { ignoradas += 1; continue; }
          const parts = entry.name.replaceAll("\\", "/").split("/").filter(Boolean);
          await addItem(batch, {
            data: entry.data,
            fileName: parts[parts.length - 1],
            folderName: parts.length > 1 ? parts[parts.length - 2] : null,
          });
          agregadas += 1;
        }
        await saveBatch(batch);
        return json(res, 200, { agregadas, ignoradas, counters: counters(batch) });
      }
      if (action === "prompt" && req.method === "GET") {
        const requestedIds = (url.searchParams.get("items") || "").split(",").filter(Boolean);
        const pendientes = batch.items.filter((item) => (requestedIds.length ? requestedIds.includes(item.id) : ["pendiente", "error"].includes(item.estado)));
        if (!pendientes.length) return json(res, 200, { prompt: "", count: 0 });
        const prompt = buildAnalysisPrompt(pendientes.map((item) => ({
          fileName: item.fileName,
          folderName: item.folderName,
          targetGarment: item.targetGarment,
          serverPath: path.join(batchesDir, batch.id, item.file),
        })));
        return json(res, 200, { prompt, count: pendientes.length });
      }
      if (action === "results" && req.method === "POST") {
        const input = await body(req);
        const { results, errors } = parseAnalysisResults(input.text || "");
        const summary = { aplicadas: 0, sinCoincidencia: [], errores: errors };
        const pendingTargets = batch.items.filter((item) => !["importada", "descartada"].includes(item.estado));
        for (const result of results) {
          let target = null;
          if (result.archivo) {
            const wanted = result.archivo.toLowerCase();
            const wantedBase = wanted.replace(/\.[^.]+$/, "");
            target = pendingTargets.find((item) => item.fileName.toLowerCase() === wanted)
              || pendingTargets.find((item) => item.fileName.toLowerCase().replace(/\.[^.]+$/, "") === wantedBase);
          } else if (results.length === 1 && pendingTargets.filter((item) => ["pendiente", "error"].includes(item.estado)).length === 1) {
            target = pendingTargets.find((item) => ["pendiente", "error"].includes(item.estado));
          }
          if (!target) { summary.sinCoincidencia.push(result.archivo || result.nombre); continue; }
          await applyAnalysis(batch, target, result, result);
          summary.aplicadas += 1;
        }
        await saveBatch(batch);
        return json(res, 200, { ...summary, batch: { ...batch, items: batch.items.map(publicItem), counters: counters(batch) } });
      }
      if (action === "analyze" && req.method === "POST") {
        if (!vision.auto) return json(res, 409, { error: "El proveedor manual no analiza automáticamente: usá \"Copiar prompt de análisis\"." });
        quotaExhausted = false;
        for (const item of batch.items) if (["pendiente", "error"].includes(item.estado)) item.estado = "en_cola";
        await saveBatch(batch);
        void runAnalysis(batch.id);
        return json(res, 202, { queued: true });
      }
      if (action === "import-analyzed" && req.method === "POST") {
        let importadas = 0;
        let saltadas = 0;
        const imported = [];
        for (const item of batch.items) {
          if (item.estado !== "analizada") continue;
          if (item.duplicateOf) { saltadas += 1; continue; }
          const { record } = await importItem(batch, item);
          imported.push(record);
          importadas += 1;
        }
        await saveBatch(batch);
        return json(res, 200, { importadas, saltadas, records: imported, counters: counters(batch) });
      }
      if (action === "discard-all" && req.method === "POST") {
        for (const item of batch.items) if (item.estado !== "importada") item.estado = "descartada";
        await saveBatch(batch);
        return json(res, 200, { counters: counters(batch) });
      }
      if (action === "retry-errors" && req.method === "POST") {
        for (const item of batch.items) {
          if (item.estado !== "error") continue;
          item.error = null;
          item.errorDetail = null;
          item.estado = vision.auto ? "en_cola" : "pendiente";
        }
        await saveBatch(batch);
        if (vision.auto) { quotaExhausted = false; void runAnalysis(batch.id); }
        return json(res, 200, { counters: counters(batch) });
      }

      const itemMatch = action.match(/^items\/([a-f0-9-]{36})(?:\/(analyze|import|discard|restore|secondary))?$/i);
      if (itemMatch) {
        const item = batch.items.find((entry) => entry.id === itemMatch[1]);
        if (!item) return json(res, 404, { error: "La prenda no existe en este lote." });
        const verb = itemMatch[2] || "";
        if (!verb && req.method === "PATCH") {
          const input = await body(req);
          patchFicha(item, input);
          if (item.ficha.nombre) item.duplicateOf = findDuplicate(item.ficha.nombre, item.ficha.categoriaInterna, await loadLibrary(), item.ficha.colores?.[0], batch.id);
          await saveBatch(batch);
          return json(res, 200, publicItem(item));
        }
        if (verb === "analyze" && req.method === "POST") {
          item.error = null;
          item.errorDetail = null;
          if (vision.auto) {
            quotaExhausted = false;
            item.estado = "en_cola";
            await saveBatch(batch);
            void runAnalysis(batch.id);
          } else {
            item.estado = "pendiente";
            await saveBatch(batch);
          }
          return json(res, 202, publicItem(item));
        }
        if (verb === "import" && req.method === "POST") {
          const input = await body(req);
          const result = await importItem(batch, item, { unifyWith: input.unifyWith || null, force: Boolean(input.force) });
          await saveBatch(batch);
          return json(res, 200, { ...result, item: publicItem(item) });
        }
        if (verb === "discard" && req.method === "POST") {
          if (item.estado === "importada") return json(res, 409, { error: "Esta prenda ya fue importada al catálogo." });
          item.estado = "descartada";
          await saveBatch(batch);
          return json(res, 200, publicItem(item));
        }
        if (verb === "restore" && req.method === "POST") {
          if (item.estado !== "descartada") return json(res, 409, { error: "Solo se pueden recuperar prendas descartadas." });
          item.estado = item.analysisRaw ? "analizada" : "pendiente";
          await saveBatch(batch);
          return json(res, 200, publicItem(item));
        }
        if (verb === "secondary" && req.method === "POST") {
          const input = await body(req);
          const nombre = typeof input.nombre === "string" ? input.nombre.trim().slice(0, 80) : "";
          if (!nombre) return json(res, 400, { error: "Falta el nombre de la prenda secundaria." });
          const data = await readFile(path.join(batchesDir, batch.id, item.file));
          const created = await addItem(batch, { data, fileName: item.fileName, folderName: item.folderName });
          created.targetGarment = nombre;
          created.ficha.nombre = nombre[0].toUpperCase() + nombre.slice(1);
          const hint = fileHint(nombre, "");
          created.ficha.categoriaInterna = hint ? PUBLIC_TO_INTERNAL[hint.categoria] : null;
          await saveBatch(batch);
          return json(res, 201, publicItem(created));
        }
      }
      return json(res, 404, { error: "Ruta no encontrada." });
    } catch (error) {
      const statusCode = error.code === "ENOENT" ? 404 : error.status || 500;
      return json(res, statusCode, { error: statusCode === 500 ? "Error interno del servidor." : error.message });
    }
  }

  return {
    name: "batch-import-api",
    apply: "serve",
    async configResolved(config) {
      root = config.root;
      const dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
      batchesDir = path.join(dataDir, "batches");
      libraryFile = path.join(dataDir, "library.json");
      libraryAssetDir = path.join(dataDir, "imported");
      await mkdir(batchesDir, { recursive: true });
      // Items que quedaron a mitad de análisis en un reinicio vuelven a pendiente.
      const ids = await readdir(batchesDir).catch(() => []);
      for (const id of ids) {
        const batch = await loadBatch(id);
        if (!batch) continue;
        let dirty = false;
        for (const item of batch.items) {
          if (["analizando", "en_cola", "esperando_cuota"].includes(item.estado)) { item.estado = "pendiente"; dirty = true; }
        }
        if (dirty) await saveBatch(batch);
      }
    },
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
