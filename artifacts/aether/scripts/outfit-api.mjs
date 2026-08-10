import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAIProvider } from "./ai-provider.mjs";
import { createFsOutfitStore } from "./tryon-store-fs.mjs";
import { garmentCoverage, garmentFitsModel, inferGarmentGender } from "../shared/garment-gender.mjs";
import { defaultModelPreset, findModelPreset, findModelStyle } from "../shared/model-presets.mjs";

const API_ROOT = "/api/tryon";
const PARTS = new Set(["upperbody", "wholebody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);

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

const COMPLEXIONS = {
  esbelta: "slim, slender build",
  media: "average, balanced build",
  atletica: "athletic, toned build",
  curvy: "curvy, fuller figure",
  // Compatibilidad con looks guardados por versiones anteriores.
  1: "slender build",
  2: "average balanced build",
  3: "fuller sturdy build with natural proportions",
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

function outfitPrompt(outfit, garments, profile = {}) {
  const useReference = profile.mode === "preset";
  const build = COMPLEXIONS[profile.complexion] || null;
  const tone = SKIN_TONES[profile.skinTone] || null;
  const onePiece = garments.find((item) => garmentCoverage(item) === "full");
  const top = garments.find((item) => garmentCoverage(item) === "top");
  const bottom = garments.find((item) => garmentCoverage(item) === "bottom");
  const outer = garments.find((item) => item.part === "wholebody_up");
  const extras = garments.filter((item) => ["shoes", "accessories_up"].includes(item.part));
  const offset = useReference ? 2 : 1;
  const list = garments.map((item, index) => `Image ${index + offset}: exact ${item.part} reference — ${item.name}.`).join("\n");
  const layering = outer
    ? `Layer the exact outer garment naturally over the exact ${onePiece ? "one-piece garment" : "top"}. Preserve its real closure construction; never invent an opening, zipper, buttons, or placket. Keep both selected pieces visibly identifiable.`
    : "";
  const baseSentence = onePiece
    ? `one-piece garment "${onePiece.name}"`
    : `top "${top?.name}", exact bottom "${bottom?.name}"`;
  const garmentSentence = `Dress them in the exact ${baseSentence}${outer ? `, exact outer layer "${outer.name}"` : ""}${extras.length ? `, and exact ${extras.map((item) => item.name).join(" and ")}` : ""}. Do not add, replace, or invent any other visible clothing or accessory.`;
  const modelGender = profile.gender === "hombre" ? "male" : "female";
  const subject = useReference
    ? `Subject: Preserve the same fictional model's recognizable face, hair, age, skin tone, build, and skin texture from Image 1. Keep the avatar identity unmistakably consistent. ${garmentSentence}`
    : `Subject: A professional ${modelGender} fashion model with ${build || "an average, balanced build"}${tone ? ` and ${tone}` : ""}, natural realistic features, friendly neutral expression. ${garmentSentence}`;
  const identityLine = useReference ? "\nImage 1: identity reference for the exact fictional model to preserve." : "";
  const primary = useReference
    ? "Primary request: Create a professional square editorial fashion photograph of the fictional model from Image 1 wearing every exact referenced garment, and only those garments."
    : "Primary request: Create a professional square editorial fashion photograph of the described model wearing every exact referenced garment, and only those garments.";
  return `Use case: ${useReference ? "preset-identity-preserve" : "catalog model"}
Asset type: square virtual try-on photograph
${identityLine}
${list}
${primary}

Outfit: ${outfit.name || "Look personalizado"}.
Context: ${outfit.occasion || "everyday"}; ${outfit.season || "all-season"}; ${outfit.climate || "mild"} climate.

${subject}

Style: Photorealistic natural editorial fashion campaign with authentic skin and fabric texture. Full person from head through shoes, centered, relaxed front-facing pose, arms away from clothing, warm natural light and realistic anatomy.

Garment fidelity: Preserve every referenced garment precisely: color, material, fit, silhouette, weight, construction, pattern, graphics, proportions, closures and distinctive details. ${layering}

Avoid: hidden selected garments, invented closures, unnatural layering, extra layers, hats, bags, scarves or jewelry unless referenced, crossed arms, hands blocking clothing, garment redesign, cropped feet, extra people, text, watermark, mockup appearance, or synthetic AI polish.`;
}

// Handler del vestidor desacoplado de Vite: es un middleware Node estándar
// (req, res, next), así que lo monta igual el dev server de Vite (store de
// archivos) y Express en el deployment (store de Postgres). La persistencia
// entra por `store` porque en autoscale el disco es efímero; ver
// scripts/tryon-store-fs.mjs y artifacts/api-server/src/tryon/pgStore.ts.
//
// `resolveSession(req)` devuelve de quién es el avatar y los looks de esta
// solicitud. En el deployment sale de la cookie anónima (un visitante = una
// sesión); en el workspace no hay sesiones y siempre es "default", que es el
// estado único que se cura y se commitea.
export function createTryonHandler({ root, env = {}, store, resolveSession = () => "default" }) {
  const setting = (name, fallback = "") => env[name] || process.env[name] || fallback;
  const ai = createAIProvider(setting);
  const dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
  const libraryFile = path.join(dataDir, "library.json");
  const publicDir = path.resolve(root, "public");

  function presetProfile(preset, styleId, previous = {}) {
    const style = findModelStyle(preset, styleId);
    return {
      mode: "preset",
      gender: preset.gender,
      complexion: preset.complexion,
      skinTone: preset.skinTone,
      preset: preset.id,
      style: style.id,
      hairColor: style.hairColor,
      hairLength: style.hairLength,
      hairTexture: style.hairTexture,
      ageRange: style.ageRange,
      modelUrl: style.image,
      appearance: preset.appearance,
      updatedAt: previous.updatedAt || new Date().toISOString(),
    };
  }

  async function loadProfile(sid) {
    const value = await store.loadProfile(sid);
    if (!value || typeof value !== "object" || !value.preset) return null;
    // Perfiles guardados por versiones anteriores (modo "photo", presets
    // renombrados o eliminados) se migran al catálogo actual de avatares IA
    // para que /config y /generate siempre trabajen con un preset válido.
    const preset = findModelPreset(value.preset) || defaultModelPreset(value.gender);
    const style = findModelStyle(preset, value.style);
    const upToDate = value.mode === "preset" && value.preset === preset.id && value.style === style.id && value.modelUrl === style.image;
    if (upToDate) return value;
    const migrated = presetProfile(preset, value.style, value);
    await store.saveProfile(sid, migrated);
    return migrated;
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

  const loadOutfits = (sid) => store.loadOutfits(sid);

  async function saveOutfit(sid, input) {
    const library = await loadLibrary();
    const ids = [...new Set(Array.isArray(input.garmentIds) ? input.garmentIds : [])];
    const garments = ids.map((id) => library.find((item) => item.id === id)).filter(Boolean);
    if (garments.length !== ids.length) throw Object.assign(new Error("Una o más prendas ya no están disponibles."), { status: 400 });
    const profile = await loadProfile(sid);
    if (profile) {
      const modelGender = profile.gender === "hombre" ? "hombre" : "mujer";
      const incompatible = garments.find((item) => !garmentFitsModel(item, modelGender));
      if (incompatible) {
        const garmentGender = inferGarmentGender(incompatible);
        throw Object.assign(new Error(`“${incompatible.name}” es una prenda para ${garmentGender} y no es compatible con el modelo seleccionado.`), { status: 400 });
      }
    }
    const coverages = garments.map((item) => garmentCoverage(item));
    if (!coverages.includes("full") && !(coverages.includes("top") && coverages.includes("bottom"))) {
      throw Object.assign(new Error("El look necesita un vestido o enterizo, o una prenda superior y una inferior."), { status: 400 });
    }
    const collection = await loadOutfits(sid);
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
    await store.putOutfit(sid, outfit);
    return outfit;
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(API_ROOT)) return next();
    const sid = resolveSession(req);
    try {
      if (url.pathname === `${API_ROOT}/config` && req.method === "GET") {
        return json(res, 200, {
          hasApiKey: ai.hasApiKey,
          provider: ai.name,
          modelMode: "presets",
          hasModelReference: false,
          modelReferenceUrl: null,
          profile: await loadProfile(sid),
        });
      }
      if (url.pathname === `${API_ROOT}/model-profile` && req.method === "POST") {
        const input = await body(req);
        const preset = findModelPreset(input.preset);
        if (!preset) return json(res, 400, { error: "Elegí uno de los modelos IA disponibles." });
        const profile = presetProfile(preset, input.style);
        await store.saveProfile(sid, profile);
        return json(res, 200, profile);
      }
      if (url.pathname === `${API_ROOT}/generate-model` && req.method === "POST") {
        return json(res, 410, { error: "La generación de modelos personalizados fue reemplazada por avatares IA predeterminados." });
      }
      const modelMatch = url.pathname.match(/^\/api\/tryon\/models\/([\w.-]+)$/);
      if (modelMatch && req.method === "GET") {
        return json(res, 410, { error: "Los modelos personalizados fueron reemplazados por avatares IA predeterminados." });
      }
      if (url.pathname === `${API_ROOT}/model-reference` && req.method === "GET") {
        return json(res, 410, { error: "Las fotos personales ya no forman parte del probador." });
      }
      if (url.pathname === `${API_ROOT}/model-reference` && req.method === "POST") {
        return json(res, 410, { error: "La carga de fotos personales está desactivada. Elegí un avatar IA predeterminado." });
      }
      if (url.pathname === `${API_ROOT}/outfits` && req.method === "GET") {
        return json(res, 200, await loadOutfits(sid));
      }
      if (url.pathname === `${API_ROOT}/outfits` && req.method === "POST") {
        return json(res, 200, await saveOutfit(sid, await body(req)));
      }
      const favoriteMatch = url.pathname.match(/^\/api\/tryon\/outfits\/([\w-]+)\/favorite$/);
      if (favoriteMatch && req.method === "POST") {
        const collection = await loadOutfits(sid);
        const outfit = collection.outfits.find((item) => item.id === favoriteMatch[1]);
        if (!outfit) return json(res, 404, { error: "No se encontró el look." });
        outfit.favorite = !outfit.favorite;
        outfit.updatedAt = new Date().toISOString();
        await store.putOutfit(sid, outfit);
        return json(res, 200, outfit);
      }
      if (url.pathname === `${API_ROOT}/generate` && req.method === "POST") {
        if (!ai.hasApiKey) return json(res, 503, { error: `Configurá ${ai.name === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} para generar la prueba virtual.` });
        const profile = await loadProfile(sid);
        const preset = findModelPreset(profile?.preset);
        if (!preset) return json(res, 409, { error: "Elegí primero uno de los modelos IA disponibles." });
        const style = findModelStyle(preset, profile?.style);
        const input = await body(req);
        const outfit = await saveOutfit(sid, input);
        const library = await loadLibrary();
        const garments = outfit.garmentIds.map((id) => library.find((item) => item.id === id)).filter(Boolean);
        const presetFile = path.resolve(publicDir, style.image.replace(/^\/+/, ""));
        if (!presetFile.startsWith(`${publicDir}${path.sep}`)) return json(res, 400, { error: "El preset seleccionado no es válido." });
        const images = [{ data: await readFile(presetFile), name: "model-preset.webp" }];
        for (const garment of garments) {
          if (!PARTS.has(garment.part)) continue;
          const filename = path.basename(new URL(garment.image, "http://localhost").pathname);
          images.push({ data: await readFile(path.join(dataDir, "imported", filename)), name: `${garment.part}.png` });
        }
        const bytes = await ai.generateImage({
          purpose: "outfit",
          aspectRatio: "1:1",
          prompt: outfitPrompt(outfit, garments, profile),
          images,
        });
        const filename = `${outfit.id}.png`;
        await store.writeOutfitImage(sid, filename, bytes);
        const saved = {
          ...outfit,
          image: `${API_ROOT}/images/${filename}`,
          status: "accepted",
          updatedAt: new Date().toISOString(),
        };
        await store.putOutfit(sid, saved);
        return json(res, 200, saved);
      }
      const imageMatch = url.pathname.match(/^\/api\/tryon\/images\/([\w.-]+)$/);
      if (imageMatch && req.method === "GET") {
        const bytes = await store.readOutfitImage(sid, path.basename(imageMatch[1]));
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.end(bytes);
      }
      return json(res, 404, { error: "No encontrado." });
    } catch (error) {
      const status = error.code === "ENOENT" ? 404 : error.status || 500;
      return json(res, status, { error: status === 500 ? "Ocurrió un error interno." : error.message, ...(process.env.NODE_ENV === "development" ? { detail: error.message } : {}) });
    }
  }

  return handler;
}

// Plugin de Vite para el workspace: usa el store de archivos, así los looks y el
// perfil siguen quedando en data/*.json y se commitean como hasta ahora.
export function outfitApi(options = {}) {
  let handler;

  return {
    name: "wardrobe-outfit-api",
    apply: "serve",
    async configResolved(config) {
      const root = config.root;
      const env = options.env || {};
      const dataDir = path.resolve(root, env["WARDROBE_DATA_DIR"] || process.env["WARDROBE_DATA_DIR"] || "data");
      handler = createTryonHandler({
        root,
        env,
        store: await createFsOutfitStore({ dataDir }),
      });
    },
    configureServer(server) { server.middlewares.use((req, res, next) => handler(req, res, next)); },
    configurePreviewServer(server) { server.middlewares.use((req, res, next) => handler(req, res, next)); },
  };
}
