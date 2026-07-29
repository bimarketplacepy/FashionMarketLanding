// Genera con la API de imagen las fotos de los 6 modelos predeterminados
// (mujer y hombre × tez blanca/canela/negra) en pose neutra de catálogo, y
// reemplaza los archivos de public/fashion/models/.
//
//   pnpm --filter @workspace/aether run generate-models
//   pnpm --filter @workspace/aether run generate-models -- modelo-h-negra   # solo ese
//
// Al terminar, avisar a Claude para marcar los presets como `real: true` en
// virtual-tryon.jsx (así pasan a usarse como referencia de identidad).
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createAIProvider } from "./ai-provider.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "fashion", "models");

const MODELS = [
  { file: "modelo-blanca.png", gender: "female", tone: "fair light skin, light brown hair" },
  { file: "modelo-canela.png", gender: "female", tone: "warm medium tan (canela) skin, dark brown hair" },
  { file: "modelo-negra.png", gender: "female", tone: "deep dark brown skin, natural black hair" },
  { file: "modelo-h-blanca.png", gender: "male", tone: "fair light skin, short brown hair" },
  { file: "modelo-h-canela.png", gender: "male", tone: "warm medium tan (canela) skin, short dark hair" },
  { file: "modelo-h-negra.png", gender: "male", tone: "deep dark brown skin, short natural black hair" },
];

const prompt = ({ gender, tone }) => `Professional full-body catalog photograph of a real-looking ${gender} fashion model with ${tone}, natural realistic facial features and skin texture.

Pose: relaxed neutral standing pose, facing the camera straight on, arms naturally at the sides, full body from head to shoes fully inside the frame.

Wardrobe: plain fitted white t-shirt, straight light-wash jeans, clean white sneakers. No logos, no accessories.

Setting: seamless warm cream studio background (#ede8dc), soft even diffuse light, faint natural floor shadow.

Style: photorealistic e-commerce model photography, authentic skin, no retouching artifacts, no text, no watermark, no synthetic AI polish.`;

const envFile = await readFile(path.join(ROOT, ".env"), "utf8").catch(() => "");
for (const line of envFile.split("\n")) {
  const index = line.indexOf("=");
  if (index > 0 && !line.trim().startsWith("#")) {
    const name = line.slice(0, index).trim();
    if (!process.env[name]) process.env[name] = line.slice(index + 1).trim();
  }
}
const ai = createAIProvider((name, fallback = "") => process.env[name] || fallback);
if (!ai.hasApiKey) { console.error("Falta la API key en .env"); process.exit(1); }

const only = new Set(process.argv.slice(2));
let generated = 0;
for (const model of MODELS) {
  if (only.size && !only.has(model.file.replace(/\.png$/, "")) && !only.has(model.file)) continue;
  process.stdout.write(`  · ${model.file} … `);
  try {
    const bytes = await ai.generateImage({ purpose: "modeled", aspectRatio: "3:4", images: [], prompt: prompt(model) });
    await sharp(bytes).resize({ width: 900, withoutEnlargement: true }).png().toFile(path.join(OUT, model.file));
    generated += 1;
    console.log("✓");
  } catch (error) {
    console.log(`✗ ${error.message.slice(0, 140)}`);
    if (/quota|429/i.test(error.message)) { console.log("\nSin cuota de imagen: reintentá más tarde."); break; }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
console.log(`\n${generated}/${MODELS.length} modelos generados en public/fashion/models/.`);
