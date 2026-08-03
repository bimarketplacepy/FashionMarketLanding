// Capa de IA intercambiable del importador de catálogo.
// VISION_PROVIDER = "manual" | "gemini" | "openai".
// Interfaz única: analizarPrenda({ imageBytes, fileName, folderName, targetGarment, onStatus })
//   → { nombre, categoria, subcategoria, colores[], descripcion, recorte|null,
//       confianza, prendaCompleta, prendasSecundarias[] }
// Cambiar de proveedor no requiere tocar nada fuera de este módulo.

import { GARMENT_GENDERS, GARMENT_TYPES, inferGarmentGender, normalizeGarmentType } from "../../shared/garment-gender.mjs";

const PUBLIC_CATEGORIES = ["tops", "jackets", "bottoms", "shoes", "accessories"];

export const PUBLIC_TO_INTERNAL = {
  tops: "upperbody",
  jackets: "wholebody_up",
  bottoms: "lowerbody",
  shoes: "shoes",
  accessories: "accessories_up",
};

const INTERNAL_TO_PUBLIC = Object.fromEntries(Object.entries(PUBLIC_TO_INTERNAL).map(([pub, internal]) => [internal, pub]));

export const CATEGORY_LABELS_ES = {
  tops: "prenda superior",
  jackets: "abrigo",
  bottoms: "prenda inferior",
  shoes: "calzado",
  accessories: "accesorio",
};

const HEX = /^#[0-9a-f]{6}$/i;

// Pistas de categoría en el nombre de archivo o carpeta. El nombre manda
// sobre lo que se ve en la foto (regla central del importador).
const FILE_HINTS = [
  [/(jean|denim|pantalon|chino|jogger|bermuda|falda|pollera|legging|cargo)/, "bottoms"],
  [/(zapat|sneaker|shoe|boot|bota|sandalia|calzado|mocasin)/, "shoes"],
  [/(campera|jacket|abrigo|coat|tapado|blazer|parka|cazadora|chaqueta|vestido|dress|piloto|chaleco)/, "jackets"],
  [/(remera|camiseta|t-?shirt|\btee\b|camisa|shirt|blusa|\btop\b|sweater|sueter|buzo|hoodie|polo|cardigan|musculosa)/, "tops"],
  [/(gorra|gorro|\bcap\b|\bhat\b|bufanda|scarf|cinturon|belt|cartera|bolso|\bbag\b|lentes|gafas|collar|pulsera|accesorio|mochila|rinonera)/, "accessories"],
  [/(\bshort\b|shorts)/, "bottoms"],
];

const stripAccents = (value = "") => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function fileHint(fileName = "", folderName = "") {
  const base = stripAccents(`${fileName} ${folderName}`);
  for (const [pattern, categoria] of FILE_HINTS) {
    const match = base.match(pattern);
    if (match) return { categoria, keyword: match[0].trim() };
  }
  return null;
}

// Reglas compartidas por todos los proveedores (y por el prompt manual) para
// elegir la prenda principal en fotos con outfit completo.
const REGLAS_PRINCIPAL = `Reglas para identificar la prenda PRINCIPAL cuando la foto muestra un outfit completo:
- El nombre del archivo o de la carpeta manda: si el archivo se llama "blue-jeans" o está en una carpeta "pantalones", la principal es el jean aunque también se vea un abrigo.
- Sin pista en el nombre: la principal es la prenda más completa, centrada y en foco. Una prenda cortada por el encuadre (se ve solo la mitad) NO puede ser la principal si hay otra completa.
- Foto de mitad para arriba: la principal debe ser del grupo tops/jackets/accessories; ignorá el pantalón que apenas asoma.
- Foto de mitad para abajo: la principal es bottoms o shoes; si se ven pantalón completo y zapatos, la principal es el pantalón salvo que el nombre del archivo indique calzado.
- El calzado solo puede ser principal si se ve el par completo y nítido.
- Todas las demás prendas visibles van en "prendasSecundarias" (nombres cortos en español).
- "prendaCompleta" es false si la prenda principal está parcialmente cortada por el encuadre.`;

const FORMATO_JSON = `{ "archivo": "nombre-exacto-del-archivo.jpg", "nombre": "...", "categoria": "tops|jackets|bottoms|shoes|accessories", "garmentType": "...", "gender": "mujer|hombre|unisex",
  "subcategoria": "...", "colores": ["#hex1","#hex2"], "descripcion": "...",
  "prendaCompleta": true, "prendaPrincipal": "...", "prendasSecundarias": ["..."] }`;

// Prompt del modo manual: se copia al portapapeles para pegarlo en Claude Code
// junto con las rutas de las imágenes. Soporta lote (varias imágenes).
export function buildAnalysisPrompt(items) {
  const lines = items.map((item, index) => {
    const context = [`archivo: ${item.fileName}`];
    if (item.folderName) context.push(`carpeta: ${item.folderName}`);
    if (item.targetGarment) context.push(`prenda objetivo: "${item.targetGarment}" — analizá SOLO esa prenda de la imagen`);
    return `${index + 1}. ${item.serverPath}  (${context.join(" · ")})`;
  });
  return `Analizá las siguientes ${items.length === 1 ? "foto de prenda" : `${items.length} fotos de prendas`} para un catálogo de moda. Abrí cada archivo listado al final y devolvé un resultado por imagen.

${REGLAS_PRINCIPAL}

Contenido de cada resultado:
- "archivo": el nombre exacto del archivo analizado (obligatorio, se usa para matchear).
- "nombre": nombre comercial en español rioplatense, estilo catálogo (ej: "Jean recto azul lavado").
- "categoria": una de tops | jackets | bottoms | shoes | accessories (la de la prenda principal).
- "garmentType": tipo exacto en inglés del enum indicado por el schema. Usá top para tops de moda; para prendas neutras o masculinas preferí tshirt, shirt, sweater u otro tipo específico.
- "gender": mujer | hombre | unisex según la PRENDA, su corte y construcción, no según la persona que posa. Tops de moda, blusas, vestidos, polleras, tacones y accesorios claramente femeninos son mujer. Usá unisex sólo cuando sea realmente neutra o ambigua.
- "subcategoria": tipo específico en español (ej: "jean recto", "remera manga corta", "campera de cuero").
- "colores": 1 a 3 colores hex dominantes de la prenda principal.
- "descripcion": 1 a 2 frases comerciales en español, sin inventar detalles que no se vean.
- "prendaPrincipal": qué prenda elegiste como principal y por qué en pocas palabras.

Respondé ÚNICAMENTE con un array JSON válido (sin markdown, sin texto extra), un objeto por imagen, con este formato exacto:
[${FORMATO_JSON}]

Imágenes:
${lines.join("\n")}`;
}

// Normaliza y valida un resultado de análisis (venga de la IA o de un pegado
// manual). Devuelve { result } o { error } con mensaje humano de una línea.
export function validateAnalysis(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Cada resultado debe ser un objeto JSON." };
  const nombre = typeof raw.nombre === "string" ? raw.nombre.trim().slice(0, 120) : "";
  if (!nombre) return { error: "Falta el campo \"nombre\"." };
  let categoria = typeof raw.categoria === "string" ? stripAccents(raw.categoria.trim()) : "";
  if (INTERNAL_TO_PUBLIC[categoria]) categoria = INTERNAL_TO_PUBLIC[categoria];
  if (!PUBLIC_CATEGORIES.includes(categoria)) return { error: `Categoría inválida: "${raw.categoria || "(vacía)"}".` };
  const colores = Array.isArray(raw.colores)
    ? raw.colores.filter((color) => typeof color === "string" && HEX.test(color.trim())).map((color) => color.trim().toLowerCase()).slice(0, 3)
    : [];
  if (!colores.length) return { error: "Falta al menos un color hex válido en \"colores\"." };
  const recorte = raw.recorte && typeof raw.recorte === "object" && !Array.isArray(raw.recorte)
    && ["x", "y", "width", "height"].every((key) => Number.isFinite(Number(raw.recorte[key])))
    ? { x: Number(raw.recorte.x), y: Number(raw.recorte.y), width: Number(raw.recorte.width), height: Number(raw.recorte.height) }
    : null;
  const garmentType = normalizeGarmentType(raw.garmentType, PUBLIC_TO_INTERNAL[categoria]);
  const gender = inferGarmentGender({ name: nombre, garmentType, gender: raw.gender, tags: [raw.subcategoria] });
  return {
    result: {
      archivo: typeof raw.archivo === "string" ? raw.archivo.trim() : null,
      nombre,
      categoria,
      categoriaInterna: PUBLIC_TO_INTERNAL[categoria],
      garmentType,
      gender,
      subcategoria: typeof raw.subcategoria === "string" ? raw.subcategoria.trim().slice(0, 80) : "",
      colores,
      descripcion: typeof raw.descripcion === "string" ? raw.descripcion.trim().slice(0, 600) : "",
      recorte,
      confianza: Number.isFinite(Number(raw.confianza)) ? Math.max(0, Math.min(1, Number(raw.confianza))) : null,
      prendaCompleta: raw.prendaCompleta !== false,
      prendaPrincipal: typeof raw.prendaPrincipal === "string" ? raw.prendaPrincipal.trim().slice(0, 200) : "",
      prendasSecundarias: Array.isArray(raw.prendasSecundarias)
        ? raw.prendasSecundarias.filter((entry) => typeof entry === "string").map((entry) => entry.trim().slice(0, 80)).filter(Boolean).slice(0, 6)
        : [],
    },
  };
}

// Parsea el texto pegado en el modo manual: un objeto suelto o un array (batch).
export function parseAnalysisResults(text = "") {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!cleaned) return { results: [], errors: ["No hay nada para procesar."] };
  let parsed;
  try { parsed = JSON.parse(cleaned); }
  catch { return { results: [], errors: ["El texto pegado no es JSON válido."] }; }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const results = [];
  const errors = [];
  entries.forEach((entry, index) => {
    const { result, error } = validateAnalysis(entry);
    if (result) results.push(result);
    else errors.push(`Resultado ${index + 1}: ${error}`);
  });
  return { results, errors };
}

// ---------- Proveedor Gemini (implementado pero apagado por defecto) ----------

// Schema en el subset OpenAPI que acepta responseSchema de Gemini (sin
// additionalProperties). Solo parámetros vigentes de la API: contents +
// generationConfig.responseMimeType/responseSchema. Nada de aspect_ratio ni
// image_size: son parámetros de generación de imagen, no de análisis.
const GEMINI_SCHEMA = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    categoria: { type: "string", enum: PUBLIC_CATEGORIES },
    garmentType: { type: "string", enum: GARMENT_TYPES },
    gender: { type: "string", enum: GARMENT_GENDERS },
    subcategoria: { type: "string" },
    colores: { type: "array", items: { type: "string" }, maxItems: 3 },
    descripcion: { type: "string" },
    confianza: { type: "number" },
    prendaCompleta: { type: "boolean" },
    prendaPrincipal: { type: "string" },
    prendasSecundarias: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: ["nombre", "categoria", "garmentType", "gender", "subcategoria", "colores", "descripcion", "prendaCompleta", "prendaPrincipal", "prendasSecundarias"],
};

function humanError(message, detail) {
  const error = new Error(message);
  error.humano = message;
  if (detail) error.detail = detail;
  return error;
}

function parseRetrySeconds(response, payload) {
  const header = Number(response.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return header;
  const info = payload?.error?.details?.find((detail) => String(detail["@type"] || "").includes("RetryInfo"));
  const parsed = Number.parseFloat(info?.retryDelay);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const wait = (seconds) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

function geminiProvider(setting) {
  const key = (setting("GEMINI_API_KEY", setting("GOOGLE_API_KEY", "")) || "").trim();
  const baseUrl = (setting("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta") || "").replace(/\/$/, "");
  const model = setting("GEMINI_VISION_MODEL", "gemini-3.6-flash");
  // Cola secuencial: una llamada a la vez para no quemar la cuota en ráfaga.
  let queue = Promise.resolve();

  async function callOnce(prompt, imageBytes) {
    let response;
    try {
      response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: imageBytes.toString("base64") } },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: GEMINI_SCHEMA,
          },
        }),
      });
    } catch (networkError) {
      throw humanError("No se pudo conectar con la API de Gemini.", networkError.message);
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 429) {
      const quotaError = humanError("API de Gemini sin cuota disponible — revisá tu plan.", payload.error?.message);
      quotaError.quota = true;
      quotaError.retryAfter = parseRetrySeconds(response, payload);
      throw quotaError;
    }
    if (!response.ok) {
      throw humanError(`El análisis de Gemini falló (HTTP ${response.status}).`, payload.error?.message);
    }
    const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
    if (!text) throw humanError("Gemini no devolvió un análisis utilizable.");
    let parsed;
    try { parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
    catch { throw humanError("Gemini devolvió un JSON inválido."); }
    const { result, error } = validateAnalysis(parsed);
    if (error) throw humanError(`El análisis de Gemini vino incompleto: ${error}`);
    return result;
  }

  return {
    name: "gemini",
    auto: true,
    hasApiKey: Boolean(key),
    analizarPrenda({ imageBytes, fileName, folderName, targetGarment, onStatus }) {
      const task = queue.then(async () => {
        if (!key) throw humanError("Falta configurar GEMINI_API_KEY en .env.");
        const context = [`Nombre de archivo: "${fileName}"`];
        if (folderName) context.push(`Carpeta de origen: "${folderName}"`);
        if (targetGarment) context.push(`Prenda objetivo: "${targetGarment}" — analizá SOLO esa prenda de la imagen.`);
        const prompt = `Analizá esta foto de prenda para un catálogo de moda.\n\n${context.join("\n")}\n\n${REGLAS_PRINCIPAL}\n\n"nombre", "subcategoria" y "descripcion" en español rioplatense, estilo catálogo. "colores": 1 a 3 hex dominantes. Clasificá garmentType y gender por la prenda, nunca por quien posa: tops de moda, blusas, vestidos, polleras, tacones y accesorios femeninos son mujer; hombre para prendas masculinas; unisex sólo si es realmente neutral. Respondé según el schema JSON.`;
        // Hasta 3 intentos ante 429, con backoff exponencial que respeta el
        // retry-after informado por la API.
        let lastError;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            return await callOnce(prompt, imageBytes);
          } catch (error) {
            lastError = error;
            if (!error.quota || attempt === 3) throw error;
            const delay = Math.max(error.retryAfter || 0, 2 ** attempt);
            onStatus?.("esperando_cuota", delay);
            await wait(delay);
            onStatus?.("analizando");
          }
        }
        throw lastError;
      });
      // La cola no debe cortarse si un item falla.
      queue = task.catch(() => {});
      return task;
    },
  };
}

export function createVisionProvider(setting) {
  const name = (setting("VISION_PROVIDER", "manual") || "manual").trim().toLowerCase();
  if (name === "gemini") return geminiProvider(setting);
  if (name === "openai") {
    return {
      name: "openai",
      auto: true,
      hasApiKey: Boolean((setting("OPENAI_API_KEY", "") || "").trim()),
      async analizarPrenda() { throw humanError("El proveedor OpenAI no está implementado todavía."); },
    };
  }
  return {
    name: "manual",
    auto: false,
    hasApiKey: true,
    async analizarPrenda() { throw humanError("El proveedor manual no analiza automáticamente: usá \"Copiar prompt de análisis\"."); },
  };
}
