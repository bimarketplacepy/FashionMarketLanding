import sharp from "sharp";

const PARTS = ["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"];
const SEASONS = ["all", "spring", "summer", "autumn", "winter"];
const MATERIALS = ["cotton", "linen", "denim", "knit", "wool", "leather", "silk", "synthetic", "mixed"];
const SILHOUETTES = ["fitted", "regular", "relaxed", "oversized", "flowy", "structured"];
const WEIGHTS = ["light", "medium", "heavy"];
const CLIMATES = ["warm", "mild", "cold", "rain"];

const DETECTION_PROMPT = `Identify every distinct wearable clothing item visible in this image. A photo may show one isolated product or a person wearing several items. Return one record per real item that should enter a seasonal fashion catalog. Ignore the person's body and non-wearable background objects.

For each item:
- include a tight bounding box using integer coordinates normalized to a 1000 by 1000 image;
- use only these category ids: upperbody, wholebody_up, lowerbody, accessories_up, shoes;
- suggest a concise specific name, primary hex color, optional genuinely distinct secondary hex color, and 1-4 useful lowercase detail tags;
- infer the most plausible season, material, silhouette, visual weight, compatible climates and occasions only from visible evidence;
- prefer conservative generic metadata when evidence is uncertain.

Return JSON only, matching the supplied schema.`;

function schema(nullableStyle = "array") {
  const nullableString = nullableStyle === "anyOf"
    ? { anyOf: [{ type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, { type: "null" }] }
    : { type: ["string", "null"], pattern: "^#[0-9A-Fa-f]{6}$" };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            part: { type: "string", enum: PARTS },
            color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
            secondaryColor: nullableString,
            tags: { type: "array", items: { type: "string" }, maxItems: 4 },
            season: { type: "string", enum: SEASONS },
            material: { type: "string", enum: MATERIALS },
            silhouette: { type: "string", enum: SILHOUETTES },
            weight: { type: "string", enum: WEIGHTS },
            climates: { type: "array", items: { type: "string", enum: CLIMATES }, maxItems: 4 },
            occasions: { type: "array", items: { type: "string" }, maxItems: 5 },
            boundingBox: {
              type: "object",
              additionalProperties: false,
              properties: {
                x: { type: "integer", minimum: 0, maximum: 999 },
                y: { type: "integer", minimum: 0, maximum: 999 },
                width: { type: "integer", minimum: 1, maximum: 1000 },
                height: { type: "integer", minimum: 1, maximum: 1000 },
              },
              required: ["x", "y", "width", "height"],
            },
          },
          required: ["name", "part", "color", "secondaryColor", "tags", "season", "material", "silhouette", "weight", "climates", "occasions", "boundingBox"],
        },
      },
    },
    required: ["items"],
  };
}

async function normalizeImage(bytes) {
  return sharp(bytes).rotate().toColorspace("srgb").png().toBuffer();
}

function cleanJsonText(value = "") {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

async function openAIImage({ key, baseUrl, model, quality, prompt, images, aspectRatio }) {
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("size", aspectRatio === "3:2" ? "1536x1024" : "1024x1024");
  form.set("quality", quality || "high");
  form.set("output_format", "png");
  for (const [index, image] of images.entries()) {
    const normalized = await normalizeImage(image.data);
    form.append("image[]", new Blob([normalized], { type: "image/png" }), image.name?.replace(/\.[^.]+$/, ".png") || `image-${index + 1}.png`);
  }
  const response = await fetch(`${baseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `OpenAI image request failed (${response.status})`);
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error("OpenAI response did not contain image data");
  return Buffer.from(encoded, "base64");
}

async function openAIAnalyze({ key, baseUrl, model, image }) {
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content: [
        { type: "input_text", text: DETECTION_PROMPT },
        { type: "input_image", image_url: `data:image/png;base64,${image.toString("base64")}` },
      ] }],
      text: { format: { type: "json_schema", name: "wardrobe_items", strict: true, schema: schema("anyOf") } },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || `OpenAI analysis failed (${response.status})`);
  const outputText = result.output_text || result.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
  if (!outputText) throw new Error("OpenAI analysis returned no structured result");
  const parsed = JSON.parse(cleanJsonText(outputText));
  if (!Array.isArray(parsed.items)) throw new Error("OpenAI analysis returned an invalid clothing list");
  return parsed.items;
}

// Gemini's response_schema accepts only an OpenAPI subset: no additionalProperties,
// and nullability is expressed with `nullable: true` instead of type arrays.
function geminiSchema(node) {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== "object") return node;
  const { additionalProperties, ...rest } = node;
  const out = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === "type" && Array.isArray(value)) {
      const types = value.filter((entry) => entry !== "null");
      out.type = types[0] || "string";
      if (value.includes("null")) out.nullable = true;
      continue;
    }
    out[key] = geminiSchema(value);
  }
  return out;
}

async function geminiRequest({ key, baseUrl, model, payload }) {
  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.error?.message || `Gemini request failed (${response.status})`;
    throw new Error(message);
  }
  return result;
}

async function geminiAnalyze({ key, baseUrl, model, image }) {
  const result = await geminiRequest({
    key,
    baseUrl,
    model,
    payload: {
      contents: [{
        role: "user",
        parts: [
          { text: DETECTION_PROMPT },
          { inlineData: { mimeType: "image/png", data: image.toString("base64") } },
        ],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: geminiSchema(schema("array")),
      },
    },
  });
  const outputText = result.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!outputText) throw new Error("Gemini analysis returned no structured result");
  const parsed = JSON.parse(cleanJsonText(outputText));
  if (!Array.isArray(parsed.items)) throw new Error("Gemini analysis returned an invalid clothing list");
  return parsed.items;
}

async function geminiImage({ key, baseUrl, model, prompt, images, aspectRatio }) {
  const parts = [{ text: prompt }];
  for (const image of images) {
    const normalized = await normalizeImage(image.data);
    parts.push({ inlineData: { mimeType: "image/png", data: normalized.toString("base64") } });
  }
  const aspectRatioEnums = {
    "1:1": "ASPECT_RATIO_ONE_BY_ONE",
    "2:3": "ASPECT_RATIO_TWO_BY_THREE",
    "3:2": "ASPECT_RATIO_THREE_BY_TWO",
    "3:4": "ASPECT_RATIO_THREE_BY_FOUR",
    "4:3": "ASPECT_RATIO_FOUR_BY_THREE",
    "4:5": "ASPECT_RATIO_FOUR_BY_FIVE",
    "5:4": "ASPECT_RATIO_FIVE_BY_FOUR",
    "9:16": "ASPECT_RATIO_NINE_BY_SIXTEEN",
    "16:9": "ASPECT_RATIO_SIXTEEN_BY_NINE",
    "21:9": "ASPECT_RATIO_TWENTY_ONE_BY_NINE",
  };
  const imageFormat = {
    aspectRatio: aspectRatioEnums[aspectRatio] || aspectRatioEnums["1:1"],
  };
  if (!model.includes("2.5")) imageFormat.imageSize = "IMAGE_SIZE_ONE_K";
  const result = await geminiRequest({
    key,
    baseUrl,
    model,
    payload: {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        responseFormat: { image: imageFormat },
      },
    },
  });
  const output = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data || part.inline_data?.data);
  const encoded = output?.inlineData?.data || output?.inline_data?.data;
  if (!encoded) {
    const text = result.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
    throw new Error(text ? `Gemini did not return an image: ${text.slice(0, 240)}` : "Gemini did not return image data");
  }
  return normalizeImage(Buffer.from(encoded, "base64"));
}

export function createAIProvider(setting) {
  const geminiKey = setting("GEMINI_API_KEY", setting("GEMINI-API-KEY", setting("GOOGLE_API_KEY", ""))).trim();
  const openAIKey = setting("OPENAI_API_KEY", "").trim();
  const configured = setting("AI_PROVIDER", "").trim().toLowerCase();
  const provider = configured === "gemini" || configured === "openai"
    ? configured
    : geminiKey ? "gemini" : "openai";
  const key = provider === "gemini" ? geminiKey : openAIKey;

  return {
    name: provider,
    hasApiKey: Boolean(key),
    async analyze({ image }) {
      const normalized = await normalizeImage(image);
      if (!key) throw new Error(`${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is not configured`);
      if (provider === "gemini") {
        return geminiAnalyze({
          key,
          baseUrl: setting("GEMINI_API_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, ""),
          model: setting("GEMINI_VISION_MODEL", "gemini-3.6-flash"),
          image: normalized,
        });
      }
      return openAIAnalyze({
        key,
        baseUrl: setting("OPENAI_API_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
        model: setting("OPENAI_VISION_MODEL", "gpt-5.4-mini"),
        image: normalized,
      });
    },
    async generateImage({ prompt, images, aspectRatio = "1:1", purpose = "image" }) {
      if (!key) throw new Error(`${provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"} is not configured`);
      if (provider === "gemini") {
        const model = purpose === "outfit"
          ? setting("GEMINI_OUTFIT_MODEL", setting("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image"))
          : setting("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image");
        return geminiImage({
          key,
          baseUrl: setting("GEMINI_IMAGE_API_BASE_URL", "https://generativelanguage.googleapis.com/v1").replace(/\/$/, ""),
          model,
          prompt,
          images,
          aspectRatio,
        });
      }
      const model = purpose === "outfit"
        ? setting("OPENAI_OUTFIT_MODEL", setting("OPENAI_IMAGE_MODEL", "gpt-image-2"))
        : purpose === "garment"
          ? setting("OPENAI_GARMENT_MODEL", setting("OPENAI_IMAGE_MODEL", "gpt-image-2"))
          : setting("OPENAI_MODELED_MODEL", setting("OPENAI_IMAGE_MODEL", "gpt-image-2"));
      return openAIImage({
        key,
        baseUrl: setting("OPENAI_API_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
        model,
        quality: setting("OPENAI_IMAGE_QUALITY", "high"),
        prompt,
        images,
        aspectRatio,
      });
    },
  };
}
