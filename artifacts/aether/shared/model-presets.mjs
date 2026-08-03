export const MODEL_PRESETS = [
  {
    id: "mujer-americana-calida",
    gender: "mujer",
    label: "Maya",
    appearance: "Rasgos norteamericanos diversos",
    skinTone: "media-calida",
    skinToneLabel: "Cálida media",
    skinToneColor: "#c58c69",
    complexion: "atletica",
    complexionLabel: "Atlética equilibrada",
    image: "/fashion/models/ai/mujer-americana-calida.webp",
    thumbnail: "/fashion/models/ai/mujer-americana-calida-thumb.webp",
  },
  {
    id: "mujer-europea-clara",
    gender: "mujer",
    label: "Elise",
    appearance: "Rasgos europeos diversos",
    skinTone: "clara",
    skinToneLabel: "Clara neutral",
    skinToneColor: "#ebcbb5",
    complexion: "curvy",
    complexionLabel: "Curvas suaves",
    image: "/fashion/models/ai/mujer-europea-clara.webp",
    thumbnail: "/fashion/models/ai/mujer-europea-clara-thumb.webp",
  },
  {
    id: "mujer-asiatica-dorada",
    gender: "mujer",
    label: "Hana",
    appearance: "Rasgos de Asia oriental",
    skinTone: "dorada",
    skinToneLabel: "Dorada clara",
    skinToneColor: "#d9aa83",
    complexion: "esbelta",
    complexionLabel: "Esbelta tonificada",
    image: "/fashion/models/ai/mujer-asiatica-dorada.webp",
    thumbnail: "/fashion/models/ai/mujer-asiatica-dorada-thumb.webp",
  },
  {
    id: "mujer-africana-profunda",
    gender: "mujer",
    label: "Zuri",
    appearance: "Rasgos africanos diversos",
    skinTone: "profunda",
    skinToneLabel: "Profunda",
    skinToneColor: "#623f2d",
    complexion: "atletica",
    complexionLabel: "Atlética estilizada",
    image: "/fashion/models/ai/mujer-africana-profunda.webp",
    thumbnail: "/fashion/models/ai/mujer-africana-profunda-thumb.webp",
  },
  {
    id: "hombre-americano-calido",
    gender: "hombre",
    label: "Ethan",
    appearance: "Rasgos norteamericanos diversos",
    skinTone: "media-calida",
    skinToneLabel: "Cálida media",
    skinToneColor: "#c58c69",
    complexion: "atletica",
    complexionLabel: "Atlética equilibrada",
    image: "/fashion/models/ai/hombre-americano-calido.webp",
    thumbnail: "/fashion/models/ai/hombre-americano-calido-thumb.webp",
  },
  {
    id: "hombre-europeo-claro",
    gender: "hombre",
    label: "Luca",
    appearance: "Rasgos europeos diversos",
    skinTone: "clara",
    skinToneLabel: "Clara neutral",
    skinToneColor: "#ebcbb5",
    complexion: "esbelta",
    complexionLabel: "Esbelta equilibrada",
    image: "/fashion/models/ai/hombre-europeo-claro.webp",
    thumbnail: "/fashion/models/ai/hombre-europeo-claro-thumb.webp",
  },
  {
    id: "hombre-asiatico-dorado",
    gender: "hombre",
    label: "Ren",
    appearance: "Rasgos de Asia oriental",
    skinTone: "dorada",
    skinToneLabel: "Dorada clara",
    skinToneColor: "#d9aa83",
    complexion: "esbelta",
    complexionLabel: "Esbelta tonificada",
    image: "/fashion/models/ai/hombre-asiatico-dorado.webp",
    thumbnail: "/fashion/models/ai/hombre-asiatico-dorado-thumb.webp",
  },
  {
    id: "hombre-africano-profundo",
    gender: "hombre",
    label: "Kofi",
    appearance: "Rasgos africanos diversos",
    skinTone: "profunda",
    skinToneLabel: "Profunda",
    skinToneColor: "#623f2d",
    complexion: "robusta",
    complexionLabel: "Atlética robusta",
    image: "/fashion/models/ai/hombre-africano-profundo.webp",
    thumbnail: "/fashion/models/ai/hombre-africano-profundo-thumb.webp",
  },
];

const LEGACY_PRESET_IDS = {
  "mujer-asia-dorada": "mujer-asiatica-dorada",
  "mujer-latina-oliva": "mujer-americana-calida",
  "mujer-afro-profunda": "mujer-africana-profunda",
  "hombre-asia-dorado": "hombre-asiatico-dorado",
  "hombre-latino-oliva": "hombre-americano-calido",
  "hombre-afro-profundo": "hombre-africano-profundo",
};

export function findModelPreset(id) {
  const resolvedId = LEGACY_PRESET_IDS[id] || id;
  return MODEL_PRESETS.find((preset) => preset.id === resolvedId) || null;
}

export function presetsForGender(gender) {
  return MODEL_PRESETS.filter((preset) => preset.gender === (gender === "hombre" ? "hombre" : "mujer"));
}

export function defaultModelPreset(gender = "mujer") {
  return presetsForGender(gender)[1] || presetsForGender(gender)[0] || MODEL_PRESETS[0];
}
