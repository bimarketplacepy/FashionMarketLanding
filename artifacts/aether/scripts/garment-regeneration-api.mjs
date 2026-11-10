import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createAIProvider } from "./ai-provider.mjs";
import { withLibraryLock } from "./library-lock.mjs";

const API_ROOT = "/api/garment-regeneration";

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(value));
}
async function body(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error("La solicitud es demasiado grande."), { status: 413 });
    chunks.push(chunk);
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; }
  catch { throw Object.assign(new Error("El cuerpo de la solicitud no es válido."), { status: 400 }); }
}

async function exists(file) {
  try { return (await stat(file)).isFile(); }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function atomicJson(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  try { await rename(temporary, file); }
  catch (error) {
    if (!["EBUSY", "EXDEV", "EPERM"].includes(error.code)) { await rm(temporary, { force: true }); throw error; }
    await copyFile(temporary, file);
    await rm(temporary, { force: true });
  }
}

const assetName = (item) => `${item.id}-garment.png`;

async function transparentGarmentCandidate(bytes) {
  const { data, info } = await sharp(bytes)
    .rotate()
    .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 255, b: 0, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => (y * info.width + x) * 4;
  const corners = [pixel(0, 0), pixel(info.width - 1, 0), pixel(0, info.height - 1), pixel(info.width - 1, info.height - 1)];
  const cornerAlpha = corners.reduce((sum, index) => sum + data[index + 3], 0) / corners.length;

  if (cornerAlpha > 24) {
    const key = corners.reduce((value, index) => ({
      r: value.r + data[index],
      g: value.g + data[index + 1],
      b: value.b + data[index + 2],
    }), { r: 0, g: 0, b: 0 });
    key.r /= corners.length; key.g /= corners.length; key.b /= corners.length;
    if (key.g < 145 || key.g - Math.max(key.r, key.b) < 55) {
      throw Object.assign(new Error("Gemini no devolvió un fondo croma uniforme. Probá otra versión con una indicación más específica."), { status: 422 });
    }
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index]; const green = data[index + 1]; const blue = data[index + 2];
      const distance = Math.hypot(red - key.r, green - key.g, blue - key.b);
      const greenDominance = green - Math.max(red, blue);
      if (distance <= 38 && greenDominance > 45) data[index + 3] = 0;
      else if (distance < 120 && greenDominance > 22) {
        data[index + 3] = Math.min(data[index + 3], Math.round(255 * (distance - 38) / 82));
        data[index + 1] = Math.min(green, Math.max(red, blue) + Math.round(data[index + 3] * 0.08));
      }
    }
  }

  let visible = 0;
  for (let index = 3; index < data.length; index += 4) if (data[index] > 24) visible += 1;
  const coverage = visible / (info.width * info.height);
  if (coverage < 0.025 || coverage > 0.86) {
    throw Object.assign(new Error("La extracción automática no produjo una prenda completa y aislada."), { status: 422 });
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

function regenerationPrompt(item, instruction = "") {
  const secondary = item.secondaryColor ? ` and secondary color ${item.secondaryColor}` : "";
  const details = [...(item.tags || []), item.material, item.silhouette, item.weight].filter(Boolean).join(", ");
  return `Use case: background-extraction
Asset type: transparent retailer catalog garment PNG
Image 1: authoritative reference for the exact existing garment.

Primary request: Reconstruct only the complete empty garment from Image 1 as a clean, straight-on product photograph. Remove any person, mannequin, hanger, supporting garment, prop, shadow and background. Keep one garment only, centered with generous even padding.

Garment identity: ${item.name}; category ${item.part}; primary color ${item.color}${secondary}; supported details: ${details || "use only what is visible in the reference"}.

Fidelity: preserve the exact silhouette, proportions, neckline, sleeves, hem, waistband, pockets, seams, panels, material grain, fabric weight, construction, closures, hardware, pattern, graphics and legible text visible in Image 1. Do not redesign, beautify, simplify or make the garment more symmetrical than the evidence supports. Prefer omission over inventing an unseen or uncertain detail.

Output preparation: perfectly flat solid chroma-key background chosen to contrast with the garment; no floor plane, gradient, texture, cast shadow, contact shadow or reflection. Crisp separable outline, no chroma color inside the garment, no cropping.
${instruction ? `\nRequested correction: ${instruction}` : ""}

Avoid: body, skin, hair, extra layer, mannequin, hanger, tag, invented logo or text, fake pocket, altered closure, duplicated sleeve, missing extremity, watermark, caption, border, halo or synthetic product redesign.`;
}

export function garmentRegenerationApi(options = {}) {
  let root;
  let dataDir;
  let libraryFile;
  let importedDir;
  let regenerationDir;
  let originalsDir;
  let candidatesDir;
  let versionsDir;
  let manifestFile;
  let queueFile;
  const setting = (name, fallback = "") => options.env?.[name] || process.env[name] || fallback;
  const ai = createAIProvider(setting);
  const generationMode = setting("WARDROBE_GENERATION_MODE", "api").trim().toLowerCase() === "chat" ? "chat" : "api";

  async function loadLibrary() {
    const value = JSON.parse(await readFile(libraryFile, "utf8").catch(() => "[]"));
    return Array.isArray(value) ? value : [];
  }

  async function loadManifest() {
    const value = JSON.parse(await readFile(manifestFile, "utf8").catch(() => '{"version":1,"entries":{}}'));
    return { version: 1, entries: value?.entries && typeof value.entries === "object" ? value.entries : {} };
  }

  async function loadQueue() {
    const value = JSON.parse(await readFile(queueFile, "utf8").catch(() => '{"version":1,"requests":[]}'));
    return { version: 1, requests: Array.isArray(value?.requests) ? value.requests : [] };
  }

  function publicEntry(item, entry = {}) {
    const requests = Array.isArray(entry.requests) ? entry.requests : [];
    const latest = requests.find((request) => request.id === entry.currentRequestId) || requests.at(-1) || null;
    return {
      garmentId: item.id,
      name: item.name,
      generationMode,
      provider: ai.name,
      hasApiKey: ai.hasApiKey,
      currentImage: item.image,
      originalImage: entry.originalName ? `${API_ROOT}/assets/original/${entry.originalName}` : null,
      latest: latest ? {
        id: latest.id,
        status: latest.status,
        createdAt: latest.createdAt,
        updatedAt: latest.updatedAt,
        instruction: latest.instruction,
        candidateImage: latest.candidateName ? `${API_ROOT}/assets/candidate/${latest.candidateName}?v=${encodeURIComponent(latest.updatedAt || "")}` : null,
        error: latest.error || null,
        reviewNotes: latest.reviewNotes || null,
      } : null,
      versions: Array.isArray(entry.versions) ? entry.versions : [],
    };
  }

  async function requestRegeneration(item, input) {
    const currentFile = path.join(importedDir, assetName(item));
    if (!await exists(currentFile)) throw Object.assign(new Error("No se encontró la imagen actual de la prenda."), { status: 404 });
    const manifest = await loadManifest();
    const entry = manifest.entries[item.id] || { garmentId: item.id, requests: [], versions: [] };
    const originalName = `${item.id}.png`;
    if (!await exists(path.join(originalsDir, originalName))) await copyFile(currentFile, path.join(originalsDir, originalName));
    entry.originalName = originalName;

    const id = `garment-${randomUUID()}`;
    const now = new Date().toISOString();
    const instruction = typeof input.instruction === "string" ? input.instruction.trim().slice(0, 1200) : "";
    const candidateName = `${item.id}--${id}.png`;
    const request = {
      id,
      type: "garment-regeneration",
      garmentId: item.id,
      garmentName: item.name,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      instruction,
      prompt: regenerationPrompt(item, instruction),
      metadata: item,
      references: { source: path.relative(root, currentFile).replaceAll("\\", "/") },
      targetPath: path.relative(root, path.join(candidatesDir, candidateName)).replaceAll("\\", "/"),
      candidateName,
    };
    entry.requests = [...(entry.requests || []), request];
    entry.currentRequestId = id;
    entry.updatedAt = now;
    manifest.entries[item.id] = entry;
    const queue = await loadQueue();
    if (generationMode === "chat") {
      queue.requests.push(request);
      await Promise.all([atomicJson(manifestFile, manifest), atomicJson(queueFile, queue)]);
      return publicEntry(item, entry);
    }

    request.status = "processing";
    request.updatedAt = new Date().toISOString();
    await atomicJson(manifestFile, manifest);
    if (!ai.hasApiKey) {
      request.status = "failed";
      request.error = `Configurá ${ai.name === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} para regenerar la prenda.`;
      request.updatedAt = new Date().toISOString();
      await atomicJson(manifestFile, manifest);
      throw Object.assign(new Error(request.error), { status: 503 });
    }
    try {
      const generated = await ai.generateImage({
        purpose: "garment",
        aspectRatio: "1:1",
        prompt: request.prompt,
        images: [{ data: await readFile(currentFile), name: assetName(item) }],
      });
      const candidate = await transparentGarmentCandidate(generated);
      await writeFile(path.join(candidatesDir, candidateName), candidate);
      request.status = "ready_for_review";
      request.reviewNotes = `Generada directamente con ${ai.name === "gemini" ? "Gemini" : "OpenAI"}; transparencia y encuadre validados automáticamente.`;
      request.updatedAt = new Date().toISOString();
      entry.updatedAt = request.updatedAt;
      await atomicJson(manifestFile, manifest);
      return publicEntry(item, entry);
    } catch (error) {
      request.status = "failed";
      request.error = error.message;
      request.updatedAt = new Date().toISOString();
      entry.updatedAt = request.updatedAt;
      await atomicJson(manifestFile, manifest);
      throw error;
    }
  }

  async function decide(item, requestId, decision) {
    const manifest = await loadManifest();
    const entry = manifest.entries[item.id];
    const request = entry?.requests?.find((value) => value.id === requestId);
    if (!request) throw Object.assign(new Error("No se encontró esta regeneración."), { status: 404 });
    if (request.status !== "ready_for_review") throw Object.assign(new Error("La imagen todavía no está lista para revisión."), { status: 409 });
    const now = new Date().toISOString();
    if (decision === "approved") {
      const candidate = path.join(candidatesDir, request.candidateName);
      if (!await exists(candidate)) throw Object.assign(new Error("No se encontró la imagen candidata."), { status: 404 });
      const current = path.join(importedDir, assetName(item));
      const versionName = `${item.id}--${now.replaceAll(":", "-")}.png`;
      if (await exists(current)) await copyFile(current, path.join(versionsDir, versionName));
      await copyFile(candidate, current);
      entry.versions = [...(entry.versions || []), { name: versionName, archivedAt: now, sourceRequestId: requestId }];
      await withLibraryLock(async () => {
      const library = await loadLibrary();
      const record = library.find((value) => value.id === item.id);
      if (record) {
        const versionToken = Date.parse(now);
        const imageBase = String(record.image || `/api/import/library/${assetName(item)}`).split("?")[0];
        const thumbnailBase = String(record.thumbnail || imageBase).split("?")[0];
        record.image = `${imageBase}?v=${versionToken}`;
        record.thumbnail = `${thumbnailBase}?v=${versionToken}`;
        record.imageVersion = now;
        record.regeneration = { status: "approved", requestId, approvedAt: now };
        await atomicJson(libraryFile, library);
      }
      });
    }
    request.status = decision;
    request.updatedAt = now;
    entry.updatedAt = now;
    await atomicJson(manifestFile, manifest);
    const queue = await loadQueue();
    const queued = queue.requests.find((value) => value.id === requestId);
    if (queued) { queued.status = decision; queued.updatedAt = now; await atomicJson(queueFile, queue); }
    return publicEntry(item, entry);
  }

  async function handler(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(API_ROOT)) return next();
    try {
      const assetMatch = url.pathname.match(/^\/api\/garment-regeneration\/assets\/(original|candidate|version)\/([\w.-]+)$/);
      if (assetMatch && req.method === "GET") {
        const directory = { original: originalsDir, candidate: candidatesDir, version: versionsDir }[assetMatch[1]];
        const file = path.join(directory, path.basename(assetMatch[2]));
        await stat(file);
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "no-store");
        return res.end(await readFile(file));
      }
      const library = await loadLibrary();
      const manifest = await loadManifest();
      if (url.pathname === API_ROOT && req.method === "GET") {
        return json(res, 200, { items: library.map((item) => publicEntry(item, manifest.entries[item.id])) });
      }
      const match = url.pathname.match(/^\/api\/garment-regeneration\/(import-[a-f0-9-]{36})(?:\/(request|approve|reject))?$/i);
      if (!match) return json(res, 404, { error: "No encontrado." });
      const item = library.find((value) => value.id === match[1]);
      if (!item) return json(res, 404, { error: "No se encontró la prenda." });
      const action = match[2] || "";
      if (!action && req.method === "GET") return json(res, 200, publicEntry(item, manifest.entries[item.id]));
      if (action === "request" && req.method === "POST") return json(res, generationMode === "chat" ? 202 : 200, await requestRegeneration(item, await body(req)));
      if (["approve", "reject"].includes(action) && req.method === "POST") {
        const input = await body(req);
        if (!input.requestId) throw Object.assign(new Error("Falta requestId."), { status: 400 });
        return json(res, 200, await decide(item, input.requestId, action === "approve" ? "approved" : "rejected"));
      }
      return json(res, 404, { error: "No encontrado." });
    } catch (error) {
      const status = error.code === "ENOENT" ? 404 : error.status || 500;
      return json(res, status, {
        error: status === 500 ? "Ocurrió un error interno." : error.message,
        ...(error.code ? { code: error.code } : {}),
        ...(error.helpUrl ? { helpUrl: error.helpUrl } : {}),
        ...(process.env.NODE_ENV === "development" ? { detail: error.upstreamMessage || error.message } : {}),
      });
    }
  }

  return {
    name: "wardrobe-garment-regeneration-api",
    apply: "serve",
    async configResolved(config) {
      root = config.root;
      dataDir = path.resolve(root, setting("WARDROBE_DATA_DIR", "data"));
      libraryFile = path.join(dataDir, "library.json");
      importedDir = path.join(dataDir, "imported");
      regenerationDir = path.join(dataDir, "garment-regeneration");
      originalsDir = path.join(regenerationDir, "originals");
      candidatesDir = path.join(regenerationDir, "candidates");
      versionsDir = path.join(regenerationDir, "versions");
      manifestFile = path.join(dataDir, "garment-regeneration.json");
      queueFile = path.join(dataDir, "garment-regeneration-queue.json");
      await Promise.all([mkdir(originalsDir, { recursive: true }), mkdir(candidatesDir, { recursive: true }), mkdir(versionsDir, { recursive: true })]);
    },
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
