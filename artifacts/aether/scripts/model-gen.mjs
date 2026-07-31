// Generación del modelo personalizado del vestidor: interpola el PROMPT
// MAESTRO con las 4 variables del customizador (silueta, complexión 1|2|3,
// tono de piel y color de pelo como hex continuos), usa las fotos de referencia de data/ como
// referencia de ESTILO (encuadre/fondo/luz — nunca identidad), valida con el
// modelo de visión que el resultado tenga cuerpo entero y manos correctas
// (hasta 2 regeneraciones si falla) y cachea en data/modelos/.
//
// Referencias de estilo esperadas en data/:
//   - model-reference.png            → estudio: encuadre, fondo e iluminación del probador
//   - lookbook-1.png, lookbook-2.png → jardín: estilo "lookbook" para hero y cards de outfits
//     (también se aceptan lookbook*.jpg/jpeg/webp; si faltan se genera solo con el texto)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { HAIR_STOPS, LEGACY_COMPLEXIONES, LEGACY_PELOS, MONK_TONES } from "../src/fashion/model-avatar.js";

export const SILUETA_PROMPTS = { A: "adult man", B: "adult woman" };

// Estas descripciones existen SOLO en el prompt interno de la API de imagen;
// la UI del customizador nunca muestra palabras sobre el cuerpo.
export const COMPLEXION_PROMPTS = {
  1: "slender frame",
  2: "average balanced frame",
  3: "fuller sturdy frame with natural proportions",
};

const HAIR_STYLE = {
  A: "short, natural texture, slightly tousled",
  B: "long, loose, center-parted, falling naturally over shoulders with realistic flyaway strands",
};

const sliderValue = (value) => {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : null;
  return numeric == null ? null : Math.min(100, Math.max(0, numeric));
};

// Valida y normaliza el perfil del customizador (acepta también el formato
// guardado por el customizador anterior). Devuelve null si es inválido.
// Cuantiza los sliders continuos en buckets para la caché: el hex usado en la
// generación es el del CENTRO del bucket (que coincide con un stop del
// gradiente), no el de la posición exacta del slider.
export function normalizePerfil(input = {}) {
  const silueta = input.silueta === "A" ? "A" : input.silueta === "B" ? "B" : null;
  const complexion = LEGACY_COMPLEXIONES[input.complexion] ?? Number(input.complexion);
  const tonoValor = sliderValue(input.tonoValor) ?? (Number.isInteger(input.tonoMonk) && input.tonoMonk >= 1 && input.tonoMonk <= 10 ? ((input.tonoMonk - 1) / 9) * 100 : null);
  const peloValor = sliderValue(input.peloValor) ?? LEGACY_PELOS[input.pelo] ?? null;
  if (!silueta || ![1, 2, 3].includes(complexion) || tonoValor == null || peloValor == null) return null;
  const tonoBucket = Math.round((tonoValor / 100) * (MONK_TONES.length - 1));
  const peloBucket = Math.round((peloValor / 100) * (HAIR_STOPS.length - 1));
  return {
    silueta,
    complexion,
    tonoValor,
    peloValor,
    tonoBucket,
    peloBucket,
    tonoHex: MONK_TONES[tonoBucket],
    peloHex: HAIR_STOPS[peloBucket],
    tonoMonk: tonoBucket + 1, // tono Monk más cercano, refuerzo del hex en el prompt
  };
}

// Clave de caché: modelos/{silueta}-c{complexion}-t{tonoBucket}-p{peloBucket}
// [-lookbook].png → máx. teórico 2×3×10×9 = 540 combinaciones por variante.
export function modelKey(perfil, variant = "studio") {
  const silueta = perfil.silueta === "A" ? "hombre" : "mujer";
  return `${silueta}-c${perfil.complexion}-t${String(perfil.tonoBucket).padStart(2, "0")}-p${perfil.peloBucket}${variant === "lookbook" ? "-lookbook" : ""}`;
}

const STUDIO_CAMERA = `=== CAMERA & LIGHTING ===
Shot on a full-frame camera, 85mm lens, f/8, ISO 100, camera at model's chest
height, 3.5 meters distance, vertical 2:3 frame. Seamless light-grey studio
backdrop (#e8e8e6) with a soft natural floor shadow directly beneath the model.
Lighting: large octabox key at 45° camera-left slightly above eye level, white
bounce fill camera-right at 1:2 ratio, subtle hair light from behind-above.
Even, commercial-catalog lighting: NO dramatic shadows, NO colored gels,
NO vignette, NO lens flare.`;

export const LOOKBOOK_CAMERA = `=== CAMERA & LIGHTING ===
Golden-hour natural daylight, dappled soft sun, lush out-of-focus garden
foliage background (f/2.8 bokeh), warm editorial grade with gentle contrast,
candid fashion-editorial pose, 3/4 or full body crop.`;

// PROMPT MAESTRO con las 4 variables interpoladas.
export function masterPrompt(perfil, variant = "studio", styleReferenceCount = 0) {
  const sujeto = SILUETA_PROMPTS[perfil.silueta];
  const referencia = styleReferenceCount
    ? `\n=== STYLE REFERENCES (attached images) ===
The ${styleReferenceCount === 1 ? "attached reference photo defines" : `${styleReferenceCount} attached reference photos define`} ONLY the framing, backdrop, lighting, camera
distance and overall color grade to reproduce. Do NOT copy the person, face,
identity, skin tone, body build, hair or clothing from the reference photos —
the subject must match the SUBJECT section below exactly.\n`
    : "";
  return `PHOTOREALISTIC FULL-BODY FASHION CATALOG PHOTOGRAPH.
${referencia}
=== SUBJECT ===
A real human fashion model, ${sujeto}, age appearance 22-30.
Body build: ${COMPLEXION_PROMPTS[perfil.complexion]}.
Rendered with complete anatomical realism: natural body asymmetries, visible
collarbones/soft tissue as appropriate to build, no idealized retouching, no
waist slimming, no limb elongation beyond natural proportion (7.5 heads tall).

Skin: Skin tone exactly matching hex ${perfil.tonoHex}, on the Monk Skin Tone
spectrum, closest to Monk scale value ${perfil.tonoMonk}. Render skin
with photographic realism: visible pores at close range, subtle natural sheen on
forehead and nose bridge, faint blue/green undertones in shadow areas for lighter
tones and warm golden/red undertones for deeper tones, natural color variation
between face, hands and arms. NO plastic smoothing, NO beauty-filter look, NO
grey ashy rendering of deep skin tones — deep tones must be luminous and rich.

Hair: hair color exactly matching hex ${perfil.peloHex}, natural realistic
strands, styled ${HAIR_STYLE[perfil.silueta]}.
Individual strand detail, natural shine, no helmet-like solidity.

Face: neutral-friendly relaxed expression, lips gently closed, eyes looking
directly into camera, natural eyebrows, minimal no-makeup-makeup look
(subtle mascara and lip tint only). Facial features must be generically
attractive but NOT resemble any real celebrity or public figure.

=== WARDROBE (base layer for try-on) ===
Fitted plain heather-grey cotton t-shirt and straight mid-grey trousers,
barefoot-style neutral grey minimal sneakers. NO logos, NO patterns, NO
accessories, NO jewelry. Garments fit true to the stated body build with
realistic fabric tension, natural wrinkles at elbows and knees, and
gravity-correct drape.

=== POSE (identical across every generation) ===
Standing, full body visible head to shoes with 5% margin above head and below
feet. Weight on right leg, left leg relaxed and slightly forward. Right hand
resting inside trouser pocket, left arm hanging naturally with fingers relaxed.
Shoulders level, chin neutral, torso facing camera with a 5-degree hip turn.
This exact pose must be reproducible identically in every generation.

${variant === "lookbook" ? LOOKBOOK_CAMERA : STUDIO_CAMERA}

=== COLOR & FINISH ===
Neutral white balance 5400K, true-to-life color reproduction (skin tone hex
must remain accurate — this is critical), soft matte editorial grade with
slightly lifted blacks, fine natural film grain. Sharp focus head to toe.

=== NEGATIVE / FORBIDDEN ===
No text, no watermark, no props, no furniture, no plants, no outdoor elements,
no extra limbs, no distorted hands (5 fingers each, anatomically correct),
no exaggerated hourglass/muscle idealization, no skin lightening or darkening
away from the specified hex, no duplicate person, no cropping of head or feet.`;
}

// Fotos de referencia de estilo según variante (las que existan en data/).
export async function styleReferences(dataDir, variant = "studio") {
  const references = [];
  const push = async (file) => {
    try {
      references.push({ data: await readFile(path.join(dataDir, file)), name: file });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  };
  if (variant === "lookbook") {
    const entries = await readdir(dataDir).catch(() => []);
    for (const file of entries.filter((name) => /^lookbook.*\.(png|jpe?g|webp)$/i.test(name)).sort().slice(0, 2)) await push(file);
  } else {
    await push("model-reference.png");
  }
  return references;
}

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    fullBody: { type: "boolean" },
    handsCorrect: { type: "boolean" },
    singlePerson: { type: "boolean" },
    issues: { type: "string" },
  },
  required: ["fullBody", "handsCorrect", "singlePerson", "issues"],
};

const CHECK_PROMPT = `You are validating an AI-generated full-body fashion catalog photograph before it enters production.
Answer strictly about THIS image:
- fullBody: true only if one entire person is visible from the top of the head to the soles of the shoes, with nothing cropped by the frame.
- handsCorrect: true only if every visible hand is anatomically plausible (five fingers, no fused, extra, or warped fingers). A hand naturally hidden in a pocket is fine.
- singlePerson: true only if exactly one person appears.
- issues: short English description of any problem found, or an empty string.
Return JSON only, matching the supplied schema.`;

// Genera el modelo con validación (cuerpo entero + manos) y hasta 2 regeneraciones.
export async function generateModelPhoto({ ai, dataDir, perfil, variant = "studio" }) {
  const references = await styleReferences(dataDir, variant);
  const prompt = masterPrompt(perfil, variant, references.length);
  let bytes = null;
  let verified = false;
  let attempts = 0;
  let lastIssues = "";
  while (attempts < 3 && !verified) {
    attempts += 1;
    const retryNote = lastIssues ? `\n\nPrevious attempt was rejected for: ${lastIssues}. Fix that in this generation.` : "";
    bytes = await ai.generateImage({
      purpose: "modeled",
      aspectRatio: "2:3",
      prompt: prompt + retryNote,
      images: references,
    });
    try {
      const check = await ai.inspect({ image: bytes, prompt: CHECK_PROMPT, schema: CHECK_SCHEMA });
      verified = Boolean(check.fullBody && check.handsCorrect && check.singlePerson);
      lastIssues = check.issues || (verified ? "" : "full body or hands check failed");
    } catch {
      // Sin visión disponible no se puede validar: se acepta el resultado tal cual.
      break;
    }
  }
  return { bytes, verified, attempts };
}
