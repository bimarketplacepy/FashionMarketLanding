// Genera el prompt maestro del modelo para pegarlo a mano en ChatGPT (u otro
// generador de imágenes) cuando no hay API de imagen disponible. Imprime el
// prompt y el nombre de archivo exacto con el que guardar el resultado en
// data/modelos/ para que la app lo sirva como caché HIT.
//
// Uso:
//   node scripts/model-prompt.mjs --silueta B --complexion 2 --tono 50 --pelo 25
//   node scripts/model-prompt.mjs --silueta A --complexion 3 --tono 80 --pelo 10 --variant lookbook
//
//   --silueta    A (hombre) | B (mujer)          [por defecto B]
//   --complexion 1 | 2 | 3                       [por defecto 2]
//   --tono       0-100 (slider de tono de piel)  [por defecto 50]
//   --pelo       0-100 (slider de color de pelo) [por defecto 25]
//   --variant    studio | lookbook               [por defecto studio]
import path from "node:path";
import { masterPrompt, modelKey, normalizePerfil } from "./model-gen.mjs";

const ARGS = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = ARGS.indexOf(`--${name}`);
  return index >= 0 && ARGS[index + 1] !== undefined ? ARGS[index + 1] : fallback;
};

const perfil = normalizePerfil({
  silueta: arg("silueta", "B").toUpperCase(),
  complexion: Number(arg("complexion", "2")),
  tonoValor: Number(arg("tono", "50")),
  peloValor: Number(arg("pelo", "25")),
});

if (!perfil) {
  console.error("Parámetros inválidos. Ejemplo: node scripts/model-prompt.mjs --silueta B --complexion 2 --tono 50 --pelo 25");
  process.exit(1);
}

const variant = arg("variant", "studio") === "lookbook" ? "lookbook" : "studio";
const file = `${modelKey(perfil, variant)}.png`;
const destination = path.join("artifacts", "aether", "data", "modelos", file);

console.log("═".repeat(72));
console.log(`Perfil: silueta ${perfil.silueta} · complexión ${perfil.complexion} · piel ${perfil.tonoHex} (Monk ${perfil.tonoMonk}) · pelo ${perfil.peloHex}`);
console.log(`Variante: ${variant} · relación de aspecto: 2:3 (vertical)`);
console.log(`Guardar el resultado como: ${destination}`);
console.log("═".repeat(72));
console.log("\n--- PROMPT (pegar completo en ChatGPT) ---\n");
console.log(masterPrompt(perfil, variant, 0));
