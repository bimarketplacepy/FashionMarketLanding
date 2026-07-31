import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createAIProvider } from "./ai-provider.mjs";
import { generateModelPhoto, modelKey, normalizePerfil, LOOKBOOK_CAMERA, styleReferences } from "./model-gen.mjs";

const API_ROOT = "/api/tryon";
const PARTS = new Set(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);

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
    if (size > limit) throw Object.assign(new Error("La imagen es demasiado grande."), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("El cuerpo de la solicitud no es válido."), { status: 400 }); }
}

function decodeImage(input) {
  const raw = input.imageDataUrl || input.imageBase64;
  if (!raw || typeof raw !== "string") throw Object.assign(new Error("Falta la imagen."), { status: 400 });
  const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
  const data = Buffer.from(match?.[2] || raw, "base64");
  if (!data.length) throw Object.assign(new Error("La imagen está vacía."), { status: 400 });
  return data;
}

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

async function exists(file) {
  try { return (await stat(file)).isFile(); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

const COMPLEXIONS = {
  esbelta: "slim, slender build",
  media: "average, balanced build",
  atletica: "athletic, toned build",
  curvy: "curvy, fuller figure",
  // complexiones del customizador de modelo personalizado (1|2|3)
  1: "slender build",
  2: "average balanced build",
  3: "fuller sturdy build with natural proportions",
  // complexiones del customizador anterior (perfiles ya guardados)
  menuda: "petite slender build",
  curva: "curvy fuller figure with natural proportions",
  robusta: "broad sturdy plus-size build",
};

const SKIN_TONES = {
  clara: "fair skin",
  "media-clara": "light-medium skin",
  media: "medium warm skin",
  morena: "tan brown skin",
  oscura: "deep dark skin",
};

function outfitPrompt(outfit, garments, profile = {}, style = "studio", styleRefCount = 0) {
  const usePhoto = profile.mode !== "default";
  const build = COMPLEXIONS[profile.complexion] || null;
  const tone = SKIN_TONES[profile.skinTone] || null;
  const top = garments.find((item) => item.part === "upperbody");
  const bottom = garments.find((item) => item.part === "lowerbody");
  const outer = garments.find((item) => item.part === "wholebody_up");
  const extras = garments.filter((item) => ["shoes", "accessories_up"].includes(item.part));
  const offset = usePhoto ? 2 : 1;
  const list = garments.map((item, index) => `Image ${index + offset}: exact ${item.part} reference — ${item.name}.`).join("\n");
  const layering = outer
    ? "Layer the exact outer garment naturally over the exact top. Preserve its real closure construction; never invent an opening, zipper, buttons, or placket. Keep both selected pieces visibly identifiable."
    : "";
  const garmentSentence = `Dress them in the exact top "${top?.name}", exact bottom "${bottom?.name}"${outer ? `, exact outer layer "${outer.name}"` : ""}${extras.length ? `, and exact ${extras.map((item) => item.name).join(" and ")}` : ""}. Do not add, replace, or invent any other visible clothing or accessory.`;
  const modelGender = profile.gender === "hombre" ? "male" : "female";
  const subject = usePhoto
    ? `Subject: Preserve the same person's recognizable face, hair, age, skin tone, and skin texture from Image 1.${build ? ` Render their body with a ${build} while keeping the face and identity unmistakably the same person.` : " Preserve their build and body proportions."} ${garmentSentence}`
    : `Subject: A professional ${modelGender} fashion model with ${build || "an average, balanced build"}${tone ? ` and ${tone}` : ""}, natural realistic features, friendly neutral expression. ${garmentSentence}`;
  const identityLine = usePhoto ? "\nImage 1: identity reference for the exact person to preserve." : "";
  const primary = usePhoto
    ? "Primary request: Create a professional square editorial fashion photograph of the person from Image 1 wearing every exact referenced garment, and only those garments."
    : "Primary request: Create a professional square editorial fashion photograph of the described model wearing every exact referenced garment, and only those garments.";
  // Estilo "lookbook" (cards de outfits con modelo personalizado): luz dorada
  // de jardín calcada de las fotos de referencia; "studio" mantiene el probador.
  const styleLine = style === "lookbook"
    ? `Style: Photorealistic candid fashion-editorial photograph with authentic skin and fabric texture. ${LOOKBOOK_CAMERA.split("\n").slice(1).join(" ")} Full person visible, arms away from clothing, realistic anatomy.`
    : "Style: Photorealistic natural editorial fashion campaign with authentic skin and fabric texture. Full person from head through shoes, centered, relaxed front-facing pose, arms away from clothing, warm natural light and realistic anatomy.";
  const styleRefLine = styleRefCount
    ? `\nThe last ${styleRefCount === 1 ? "attached image is a photographic style reference" : `${styleRefCount} attached images are photographic style references`} only — copy the framing, light and mood, never the person or the clothes shown there.`
    : "";
  return `Use case: ${usePhoto ? "identity-preserve" : "catalog model"}
Asset type: square virtual try-on photograph
${identityLine}
${list}
${styleRefLine}
${primary}

Outfit: ${outfit.name || "Look personalizado"}.
Context: ${outfit.occasion || "everyday"}; ${outfit.season || "all-season"}; ${outfit.climate || "mild"} climate.

${subject}

${styleLine}

Garment fidelity: Preserve every referenced garment precisely: color, material, fit, silhouette, weight, construction, pattern, graphics, proportions, closures and distinctive details. ${layering}

Avoid: hidden selected garments, invented closures, unnatural layering, extra layers, hats, bags, scarves or jewelry unless referenced, crossed arms, hands blocking clothing, garment redesign, cropped feet, extra people, text, watermark, mockup appearance, or synthetic AI polish.`;
}

export function outfitApi(options = {}) {
  let root;
  let dataDir;
  let libraryFile;
  let outfitsFile;
  let outfitImagesDir;
  let modelosDir;
  let modelReference;
  let modelProfileFile;
  const setting = (name, fallback = "") => options.env?.[name] || process.env[name] || fallback;
  const ai = createAIProvider(setting);

  async function loadProfile() {
    try {
      const value = JSON.parse(await readFile(modelProfileFile, "utf8"));
      return value && typeof value === "object" ? value : null;
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function loadLibrary() {
    try {
      const value = JSON.parse(await readFile(libraryFile, "utf8"));
      return Array.isArray(value) ? value : [];
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function loadOutfits() {
    try {
      const value = JSON.parse(await readFile(outfitsFile, "utf8"));
      if (Array.isArray(value)) return { version: 1, outfits: value };
      return { version: 1, outfits: Array.isArray(value.outfits) ? value.outfits : [] };
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, outfits: [] };
      throw error;
    }
  }

  async function saveOutfit(input) {
    const library = await loadLibrary();
    const ids = [...new Set(Array.isArray(input.garmentIds) ? input.garmentIds : [])];
    const garments = ids.map((id) => library.find((item) => item.id === id)).filter(Boolean);
    if (garments.length !== ids.length) throw Object.assign(new Error("Una o más prendas ya no están disponibles."), { status: 400 });
    if (!garments.some((item) => item.part === "upperbody") || !garments.some((item) => item.part === "lowerbody")) {
      throw Object.assign(new Error("El look necesita una prenda superior y una inferior."), { status: 400 });
    }
    const collection = await loadOutfits();
    const key = [...ids].sort().join("|");
    const existing = collection.outfits.find((item) => [...item.garmentIds].sort().join("|") === key);
    const now = new Date().toISOString();
    const outfit = {
      id: existing?.id || `look-${randomUUID()}`,
      name: String(input.name || "Look personalizado").trim().slice(0, 100),
      occasion: String(input.occasion || "casual").slice(0, 40),
      season: String(input.season || "all").slice(0, 30),
      climate: String(input.climate || "mild").slice(0, 30),
      garmentIds: ids,
      reason: String(input.reason || "Combinación creada manualmente.").slice(0, 500),
      score: Math.max(0, Math.min(100, Number(input.score) || 80)),
      source: input.source === "manual" ? "manual" : "suggested",
      favorite: Boolean(input.favorite ?? existing?.favorite),
      image: existing?.image || null,
      status: existing?.status === "accepted" ? "accepted" : "planned",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    collection.outfits = [...collection.outfits.filter((item) => item.id !== outfit.id), outfit];
    await atomicJson(outfitsFile, collection);
    return outfit;
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(API_ROOT)) return next();
    try {
      if (url.pathname === `${API_ROOT}/config` && req.method === "GET") {
        return json(res, 200, {
          hasApiKey: ai.hasApiKey,
          provider: ai.name,
          hasModelReference: await exists(modelReference),
          modelReferenceUrl: await exists(modelReference) ? `${API_ROOT}/model-reference` : null,
          profile: await loadProfile(),
        });
      }
      if (url.pathname === `${API_ROOT}/model-profile` && req.method === "POST") {
        const input = await body(req);
        const mode = input.mode === "default" ? "default" : "photo";
        const profile = {
          mode,
          gender: input.gender === "hombre" ? "hombre" : "mujer",
          complexion: COMPLEXIONS[input.complexion] ? input.complexion : null,
          skinTone: Object.keys(SKIN_TONES).includes(input.skinTone) ? input.skinTone : null,
          preset: typeof input.preset === "string" ? input.preset.trim().slice(0, 40) || null : null,
          // selección del customizador de modelo personalizado (silueta/complexión/tono Monk/pelo)
          custom: input.custom ? normalizePerfil(input.custom) : null,
          updatedAt: new Date().toISOString(),
        };
        profile.modelUrl = profile.custom ? `${API_ROOT}/models/${modelKey(profile.custom)}.png` : null;
        await atomicJson(modelProfileFile, profile);
        return json(res, 200, profile);
      }
      // Genera (o sirve de caché) la foto del modelo personalizado del customizador.
      if (url.pathname === `${API_ROOT}/generate-model` && req.method === "POST") {
        const input = await body(req);
        const perfil = normalizePerfil(input);
        if (!perfil) return json(res, 400, { error: "Completá la selección de tu modelo antes de generarlo." });
        const variant = input.variant === "lookbook" ? "lookbook" : "studio";
        const key = modelKey(perfil, variant);
        const file = path.join(modelosDir, `${key}.png`);
        const modelUrl = `${API_ROOT}/models/${key}.png`;
        if (!input.force && await exists(file)) {
          console.log(`[tryon] caché de modelo HIT: ${key}`);
          if (input.setAsReference) await copyFile(file, modelReference);
          return json(res, 200, { url: modelUrl, key, cached: true, verified: true });
        }
        console.log(`[tryon] caché de modelo MISS: ${key} → generando`);
        if (!ai.hasApiKey) return json(res, 503, { error: `Configurá ${ai.name === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} para generar tu modelo.` });
        let generated;
        try {
          generated = await generateModelPhoto({ ai, dataDir, perfil, variant });
        } catch (error) {
          if (/quota|429/i.test(error.message)) return json(res, 503, { error: "El proveedor de imagen no tiene cuota disponible ahora. Probá de nuevo más tarde." });
          throw error;
        }
        const { bytes, verified, attempts } = generated;
        const normalized = await sharp(bytes).resize({ width: 1200, withoutEnlargement: true }).png().toBuffer();
        await writeFile(file, normalized);
        if (input.setAsReference) await copyFile(file, modelReference);
        return json(res, 200, { url: modelUrl, key, cached: false, verified, attempts });
      }
      const modelMatch = url.pathname.match(/^\/api\/tryon\/models\/([\w.-]+)$/);
      if (modelMatch && req.method === "GET") {
        const file = path.join(modelosDir, path.basename(modelMatch[1]));
        await stat(file);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.end(await readFile(file));
      }
      if (url.pathname === `${API_ROOT}/model-reference` && req.method === "GET") {
        if (!await exists(modelReference)) return json(res, 404, { error: "Todavía no hay una foto de referencia." });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.end(await readFile(modelReference));
      }
      if (url.pathname === `${API_ROOT}/model-reference` && req.method === "POST") {
        const input = await body(req);
        const normalized = await sharp(decodeImage(input))
          .rotate()
          .resize({ width: 1400, height: 1800, fit: "inside", withoutEnlargement: true })
          .toColorspace("srgb")
          .png()
          .toBuffer();
        await writeFile(modelReference, normalized);
        return json(res, 200, { saved: true, modelReferenceUrl: `${API_ROOT}/model-reference?updated=${Date.now()}` });
      }
      if (url.pathname === `${API_ROOT}/outfits` && req.method === "GET") {
        return json(res, 200, await loadOutfits());
      }
      if (url.pathname === `${API_ROOT}/outfits` && req.method === "POST") {
        return json(res, 200, await saveOutfit(await body(req)));
      }
      const favoriteMatch = url.pathname.match(/^\/api\/tryon\/outfits\/([\w-]+)\/favorite$/);
      if (favoriteMatch && req.method === "POST") {
        const collection = await loadOutfits();
        const outfit = collection.outfits.find((item) => item.id === favoriteMatch[1]);
        if (!outfit) return json(res, 404, { error: "No se encontró el look." });
        outfit.favorite = !outfit.favorite;
        outfit.updatedAt = new Date().toISOString();
        await atomicJson(outfitsFile, collection);
        return json(res, 200, outfit);
      }
      if (url.pathname === `${API_ROOT}/generate` && req.method === "POST") {
        if (!ai.hasApiKey) return json(res, 503, { error: `Configurá ${ai.name === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} para generar la prueba virtual.` });
        const profile = await loadProfile() || { mode: "photo" };
        const usePhoto = profile.mode !== "default";
        if (usePhoto && !await exists(modelReference)) return json(res, 409, { error: "Subí primero una foto de referencia o elegí el modelo predeterminado." });
        const input = await body(req);
        const outfit = await saveOutfit(input);
        const library = await loadLibrary();
        const garments = outfit.garmentIds.map((id) => library.find((item) => item.id === id)).filter(Boolean);
        const images = usePhoto ? [{ data: await readFile(modelReference), name: "identity.png" }] : [];
        for (const garment of garments) {
          if (!PARTS.has(garment.part)) continue;
          const filename = path.basename(new URL(garment.image, "http://localhost").pathname);
          images.push({ data: await readFile(path.join(dataDir, "imported", filename)), name: `${garment.part}.png` });
        }
        // Con modelo personalizado, las cards de outfits sugeridos usan el estilo
        // "lookbook" (jardín, luz dorada); el probador manual mantiene el estudio.
        const style = profile.custom && outfit.source === "suggested" ? "lookbook" : "studio";
        const styleRefs = style === "lookbook" ? await styleReferences(dataDir, "lookbook") : [];
        images.push(...styleRefs);
        const bytes = await ai.generateImage({
          purpose: "outfit",
          aspectRatio: "1:1",
          prompt: outfitPrompt(outfit, garments, profile, style, styleRefs.length),
          images,
        });
        const filename = `${outfit.id}.png`;
        await writeFile(path.join(outfitImagesDir, filename), bytes);
        const collection = await loadOutfits();
        const saved = collection.outfits.find((item) => item.id === outfit.id);
        saved.image = `${API_ROOT}/images/${filename}`;
        saved.status = "accepted";
        saved.updatedAt = new Date().toISOString();
        await atomicJson(outfitsFile, collection);
        return json(res, 200, saved);
      }
      const imageMatch = url.pathname.match(/^\/api\/tryon\/images\/([\w.-]+)$/);
      if (imageMatch && req.method === "GET") {
        const file = path.join(outfitImagesDir, path.basename(imageMatch[1]));
        await stat(file);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.end(await readFile(file));
      }
      return json(res, 404, { error: "No encontrado." });
    } catch (error) {
      const status = error.code === "ENOENT" ? 404 : error.status || 500;
      return json(res, status, { error: status === 500 ? "Ocurrió un error interno." : error.message, ...(process.env.NODE_ENV === "development" ? { detail: error.message } : {}) });
    }
  }

  return {
    name: "wardrobe-outfit-api",
    apply: "serve",
    async configResolved(config) {
      root = config.root;
      dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
      libraryFile = path.join(dataDir, "library.json");
      outfitsFile = path.join(dataDir, "outfits.json");
      outfitImagesDir = path.join(dataDir, "outfit-images");
      modelosDir = path.join(dataDir, "modelos");
      modelProfileFile = path.join(dataDir, "model-profile.json");
      modelReference = path.resolve(root, setting("WARDROBE_MODEL_REFERENCE", "data/model-reference.png"));
      await mkdir(dataDir, { recursive: true });
      await mkdir(outfitImagesDir, { recursive: true });
      await mkdir(modelosDir, { recursive: true });
    },
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
