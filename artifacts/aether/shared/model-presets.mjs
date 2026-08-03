const modelPath = (filename) => `/fashion/models/ai/${filename}.webp`;
const thumbPath = (filename) => `/fashion/models/ai/${filename}-thumb.webp`;

function style(id, label, filename, hairColor, hairColorLabel, hairLength, hairLengthLabel, hairTexture, hairTextureLabel, ageRange) {
  return { id, label, image: modelPath(filename), thumbnail: thumbPath(filename), hairColor, hairColorLabel, hairLength, hairLengthLabel, hairTexture, hairTextureLabel, ageRange, ageRangeLabel: `${ageRange} años` };
}

export const MODEL_PRESETS = [
  {
    id: "mujer-americana-calida", gender: "mujer", label: "Maya", appearance: "Rasgos norteamericanos diversos",
    skinTone: "media-calida", skinToneLabel: "Cálida media", skinToneColor: "#c58c69", complexion: "atletica", complexionLabel: "Atlética equilibrada",
    image: modelPath("mujer-americana-calida"), thumbnail: thumbPath("mujer-americana-calida"),
    styles: [
      style("castano-largo-24-28", "Castaño suave", "mujer-americana-calida", "castano", "Castaño", "largo", "Largo", "ondulado", "Ondulado suave", "24–28"),
      style("rubio-medio-29-34", "Luz miel", "mujer-americana-rubio-medio", "rubio-miel", "Rubio miel", "medio", "A los hombros", "ondas-pulidas", "Ondas pulidas", "29–34"),
    ],
  },
  {
    id: "mujer-europea-clara", gender: "mujer", label: "Elise", appearance: "Rasgos europeos diversos",
    skinTone: "clara", skinToneLabel: "Clara neutral", skinToneColor: "#ebcbb5", complexion: "curvy", complexionLabel: "Curvas suaves",
    image: modelPath("mujer-europea-clara"), thumbnail: thumbPath("mujer-europea-clara"),
    styles: [
      style("castano-medio-29-34", "Castaño natural", "mujer-europea-clara", "castano-claro", "Castaño claro", "medio", "A los hombros", "ondulado", "Ondulado", "29–34"),
      style("rubio-largo-24-28", "Rubio pulido", "mujer-europea-rubio-largo", "rubio-oscuro", "Rubio oscuro", "largo", "Largo", "liso", "Liso natural", "24–28"),
    ],
  },
  {
    id: "mujer-asiatica-dorada", gender: "mujer", label: "Hana", appearance: "Rasgos de Asia oriental",
    skinTone: "dorada", skinToneLabel: "Dorada clara", skinToneColor: "#d9aa83", complexion: "esbelta", complexionLabel: "Esbelta tonificada",
    image: modelPath("mujer-asiatica-dorada"), thumbnail: thumbPath("mujer-asiatica-dorada"),
    styles: [
      style("negro-largo-24-28", "Negro fluido", "mujer-asiatica-dorada", "negro", "Negro", "largo", "Largo", "ondulado", "Ondulado suave", "24–28"),
      style("castano-medio-29-34", "Bob castaño", "mujer-asiatica-castano-medio", "castano-oscuro", "Castaño oscuro", "medio", "A la clavícula", "liso", "Liso natural", "29–34"),
    ],
  },
  {
    id: "mujer-africana-profunda", gender: "mujer", label: "Zuri", appearance: "Rasgos africanos diversos",
    skinTone: "profunda", skinToneLabel: "Profunda", skinToneColor: "#623f2d", complexion: "atletica", complexionLabel: "Atlética estilizada",
    image: modelPath("mujer-africana-profunda"), thumbnail: thumbPath("mujer-africana-profunda"),
    styles: [
      style("negro-medio-24-28", "Rizos definidos", "mujer-africana-profunda", "negro", "Negro", "medio", "Medio", "rizado", "Rizado natural", "24–28"),
      style("castano-corto-29-34", "Coily esculpido", "mujer-africana-castano-corto", "castano-profundo", "Castaño profundo", "corto", "Corto", "coily", "Coily definido", "29–34"),
    ],
  },
  {
    id: "hombre-americano-calido", gender: "hombre", label: "Ethan", appearance: "Rasgos norteamericanos diversos",
    skinTone: "media-calida", skinToneLabel: "Cálida media", skinToneColor: "#c58c69", complexion: "atletica", complexionLabel: "Atlética equilibrada",
    image: modelPath("hombre-americano-calido"), thumbnail: thumbPath("hombre-americano-calido"),
    styles: [
      style("castano-corto-29-34", "Castaño clásico", "hombre-americano-calido", "castano", "Castaño", "corto", "Corto", "ondulado", "Ondulado", "29–34"),
      style("castano-oscuro-medio-24-28", "Textura joven", "hombre-americano-castano-oscuro", "castano-oscuro", "Castaño oscuro", "medio-corto", "Medio corto", "texturizado", "Texturizado suave", "24–28"),
    ],
  },
  {
    id: "hombre-europeo-claro", gender: "hombre", label: "Luca", appearance: "Rasgos europeos diversos",
    skinTone: "clara", skinToneLabel: "Clara neutral", skinToneColor: "#ebcbb5", complexion: "esbelta", complexionLabel: "Esbelta equilibrada",
    image: modelPath("hombre-europeo-claro"), thumbnail: thumbPath("hombre-europeo-claro"),
    styles: [
      style("rubio-corto-29-34", "Rubio natural", "hombre-europeo-claro", "rubio-oscuro", "Rubio oscuro", "corto", "Corto", "ondulado", "Ondulado", "29–34"),
      style("castano-medio-24-28", "Castaño pulido", "hombre-europeo-castano-medio", "castano", "Castaño medio", "medio-corto", "Medio corto", "liso", "Liso con volumen", "24–28"),
    ],
  },
  {
    id: "hombre-asiatico-dorado", gender: "hombre", label: "Ren", appearance: "Rasgos de Asia oriental",
    skinTone: "dorada", skinToneLabel: "Dorada clara", skinToneColor: "#d9aa83", complexion: "esbelta", complexionLabel: "Esbelta tonificada",
    image: modelPath("hombre-asiatico-dorado"), thumbnail: thumbPath("hombre-asiatico-dorado"),
    styles: [
      style("negro-corto-24-28", "Negro texturizado", "hombre-asiatico-dorado", "negro", "Negro", "corto", "Corto", "liso", "Liso texturizado", "24–28"),
      style("castano-medio-29-34", "Onda castaña", "hombre-asiatico-castano-ondulado", "castano-oscuro", "Castaño oscuro", "medio", "Medio", "ondulado", "Ondulado suave", "29–34"),
    ],
  },
  {
    id: "hombre-africano-profundo", gender: "hombre", label: "Kofi", appearance: "Rasgos africanos diversos",
    skinTone: "profunda", skinToneLabel: "Profunda", skinToneColor: "#623f2d", complexion: "robusta", complexionLabel: "Atlética robusta",
    image: modelPath("hombre-africano-profundo"), thumbnail: thumbPath("hombre-africano-profundo"),
    styles: [
      style("negro-corto-29-34", "Coily natural", "hombre-africano-profundo", "negro", "Negro", "corto", "Corto", "coily-natural", "Coily natural", "29–34"),
      style("castano-muy-corto-24-28", "Fade definido", "hombre-africano-castano-muy-corto", "castano-profundo", "Castaño profundo", "muy-corto", "Muy corto", "coily-definido", "Coily definido", "24–28"),
    ],
  },
];

const LEGACY_PRESET_IDS = {
  "mujer-asia-dorada": "mujer-asiatica-dorada", "mujer-latina-oliva": "mujer-americana-calida", "mujer-afro-profunda": "mujer-africana-profunda",
  "hombre-asia-dorado": "hombre-asiatico-dorado", "hombre-latino-oliva": "hombre-americano-calido", "hombre-afro-profundo": "hombre-africano-profundo",
};

export function findModelPreset(id) {
  const resolvedId = LEGACY_PRESET_IDS[id] || id;
  return MODEL_PRESETS.find((preset) => preset.id === resolvedId) || null;
}

export function findModelStyle(presetOrId, styleId) {
  const preset = typeof presetOrId === "string" ? findModelPreset(presetOrId) : presetOrId;
  if (!preset) return null;
  return preset.styles.find((item) => item.id === styleId) || preset.styles[0] || null;
}

export function presetsForGender(gender) {
  return MODEL_PRESETS.filter((preset) => preset.gender === (gender === "hombre" ? "hombre" : "mujer"));
}

export function defaultModelPreset(gender = "mujer") {
  return presetsForGender(gender)[1] || presetsForGender(gender)[0] || MODEL_PRESETS[0];
}
