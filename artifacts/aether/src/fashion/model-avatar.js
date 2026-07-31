// Avatar SVG paramétrico del módulo "Mi modelo": figurín de moda de 8 cabezas
// que se repinta al instante con cada cambio de silueta, complexión, tono de
// piel (slider continuo sobre la escala Monk) y color de pelo (slider continuo
// negro→canoso). Módulo JS puro (sin React) para poder usarlo también como
// data-URL y testearlo con node.

export const SILUETAS = ["A", "B"];

// Escala Monk Skin Tone (índice 0 = tono 1) — stops del gradiente del slider.
export const MONK_TONES = [
  "#f6ede4", "#f3e7db", "#f7ead0", "#eadaba", "#d7bd96",
  "#a07e56", "#825c43", "#604134", "#3a312a", "#292420",
];

// Stops del gradiente de pelo: negro → castaños → rubio → cobrizos → canoso.
export const HAIR_STOPS = [
  "#17110c", "#2e2118", "#4a3220", "#6f4c2f", "#977247",
  "#c8a05e", "#b06a3a", "#8f3f20", "#b9b5af",
];

export const COMPLEXION_SCALE = { 1: 0.86, 2: 1, 3: 1.18 };

// Conversión de perfiles guardados con el customizador anterior (ids con
// nombre) al modelo continuo actual.
export const LEGACY_COMPLEXIONES = { menuda: 1, media: 2, curva: 3, robusta: 3 };
export const LEGACY_PELOS = { negro: 0, castano: 19, castano_claro: 37.5, rubio: 62.5, pelirrojo: 87.5, canoso: 100 };
const LEGACY_TONO_VALOR = (tonoMonk) => ((clamp(tonoMonk, 1, 10) - 1) / 9) * 100;

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function hexToRgb(hex = "#777777") {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) || 0);
}

function rgbToHex([red, green, blue]) {
  return `#${[red, green, blue].map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(first, second, amount) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return rgbToHex(a.map((channel, index) => channel + (b[index] - channel) * amount));
}

export function scaleHex(hex, factor) {
  return rgbToHex(hexToRgb(hex).map((channel) => channel * factor));
}

// Interpolación lineal del hex sobre los stops de un gradiente, para un valor
// de slider 0-100. Los centros de bucket (valor = b/(stops-1)×100) caen
// exactamente sobre cada stop.
export function hexAtValue(stops, valor) {
  const position = (clamp(Number(valor) || 0, 0, 100) / 100) * (stops.length - 1);
  const index = Math.min(Math.floor(position), stops.length - 2);
  return mixHex(stops[index], stops[index + 1], position - index);
}

export const tonoHexFromValor = (valor) => hexAtValue(MONK_TONES, valor);
export const peloHexFromValor = (valor) => hexAtValue(HAIR_STOPS, valor);

export const DEFAULT_PERFIL = {
  silueta: "B",
  complexion: 2,
  tonoValor: 50,
  tonoHex: tonoHexFromValor(50),
  peloValor: 25,
  peloHex: peloHexFromValor(25),
};

const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// Normaliza cualquier perfil (nuevo o guardado con el customizador anterior)
// al estado continuo { silueta, complexion 1|2|3, tonoValor/Hex, peloValor/Hex }.
export function normalizeAvatarPerfil(input = {}) {
  const perfil = { ...DEFAULT_PERFIL };
  if (input.silueta === "A" || input.silueta === "B") perfil.silueta = input.silueta;
  const complexion = LEGACY_COMPLEXIONES[input.complexion] ?? Number(input.complexion);
  if ([1, 2, 3].includes(complexion)) perfil.complexion = complexion;
  const tonoValor = finite(input.tonoValor) ?? (finite(input.tonoMonk) != null ? LEGACY_TONO_VALOR(input.tonoMonk) : null);
  if (tonoValor != null) perfil.tonoValor = clamp(tonoValor, 0, 100);
  const peloValor = finite(input.peloValor) ?? LEGACY_PELOS[input.pelo] ?? null;
  if (peloValor != null) perfil.peloValor = clamp(peloValor, 0, 100);
  perfil.tonoHex = tonoHexFromValor(perfil.tonoValor);
  perfil.peloHex = peloHexFromValor(perfil.peloValor);
  return perfil;
}

// Luminancia relativa aproximada (0 = negro, 1 = blanco) para derivar labios,
// iris y rubor sin depender de índices discretos.
function luminance(hex) {
  const [red, green, blue] = hexToRgb(hex);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

// Derivaciones automáticas de color del figurín a partir de los hex continuos.
export function avatarPalette({ tonoHex, peloHex }) {
  const skin = tonoHex || DEFAULT_PERFIL.tonoHex;
  const hair = peloHex || DEFAULT_PERFIL.peloHex;
  const skinLum = luminance(skin);
  const [hairRed, , hairBlue] = hexToRgb(hair);
  const warmLightHair = luminance(hair) > 0.3 && hairRed - hairBlue > 40;
  return {
    skin,
    skinShadow: scaleHex(skin, 0.82),
    lips: mixHex(skin, "#9e4a44", skinLum < 0.33 ? 0.3 : 0.45),
    iris: warmLightHair && skinLum > 0.55 ? "#6f7d4f" : "#5b3a24",
    brows: scaleHex(hair, 0.75),
    hair,
    hairShine: mixHex(hair, "#ffffff", 0.14),
    blush: mixHex(skin, "#c85a50", 0.4),
    tee: "#d8d7d3",
    teeShadow: "#c2c1bc",
    pants: "#8c8c90",
    pantsShadow: "#77777b",
    shoes: "#4a4a4c",
  };
}

// Construye el markup SVG completo del figurín (cuerpo entero, 8 cabezas).
export function avatarSvgMarkup(input = {}) {
  const { silueta, complexion, tonoHex, peloHex } = normalizeAvatarPerfil(input);
  const palette = avatarPalette({ tonoHex, peloHex });
  const skinLum = luminance(tonoHex);
  const isA = silueta === "A";
  const f = COMPLEXION_SCALE[complexion] || 1;
  const hipBoost = complexion === 3 ? 1.05 : 1;

  // Geometría base (medias-anchuras desde el eje central x=0).
  const CX = 160;
  const shoulder = (isA ? 60 : 47) * f;
  const waist = (isA ? 42 : 31) * f;
  const hip = (isA ? 45 : 53) * f * hipBoost;
  const neck = (isA ? 11.5 : 9.5) * Math.sqrt(f);
  const armW = 11 * f;
  const legHW = 10.5 * f;
  const legCX = Math.max(hip * 0.5, legHW + 3);

  // Alturas clave: cabeza 78px → 8 cabezas = 624px de figura.
  const Y = { headTop: 22, chin: 100, shoulders: 128, sleeve: 214, waist: 256, hem: 304, wrist: 324, ankle: 608, sole: 644 };

  const p = (x, y) => `${(CX + x).toFixed(1)},${y.toFixed(1)}`;

  const torso = (halfHem, yHem) => [
    `M ${p(-neck - 2, 116)}`,
    `C ${p(-shoulder * 0.7, 119)} ${p(-shoulder + 4, 122)} ${p(-shoulder, Y.shoulders)}`,
    `C ${p(-shoulder - 1, 150)} ${p(-waist - 3, 210)} ${p(-waist, Y.waist)}`,
    `C ${p(-waist + 1, 278)} ${p(-halfHem, 288)} ${p(-halfHem, yHem)}`,
    `L ${p(halfHem, yHem)}`,
    `C ${p(halfHem, 288)} ${p(waist - 1, 278)} ${p(waist, Y.waist)}`,
    `C ${p(waist + 3, 210)} ${p(shoulder + 1, 150)} ${p(shoulder, Y.shoulders)}`,
    `C ${p(shoulder - 4, 122)} ${p(shoulder * 0.7, 119)} ${p(neck + 2, 116)}`,
    `C ${p(neck * 0.6, 126)} ${p(-neck * 0.6, 126)} ${p(-neck - 2, 116)}`,
    "Z",
  ].join(" ");

  const arm = (s) => [
    `M ${p(s * (shoulder - 10), 124)}`,
    `C ${p(s * (shoulder + armW * 0.7), 132)} ${p(s * (shoulder + armW * 0.9), 168)} ${p(s * (shoulder + armW * 0.5), 212)}`,
    `C ${p(s * (shoulder + armW * 0.2), 252)} ${p(s * (hip + armW + 6), 292)} ${p(s * (hip + armW + 3), Y.wrist)}`,
    `L ${p(s * (hip + armW - 7), Y.wrist + 2)}`,
    `C ${p(s * (shoulder - armW * 0.7), 288)} ${p(s * (shoulder - armW * 0.8), 250)} ${p(s * (shoulder - armW * 0.75), 210)}`,
    `C ${p(s * (shoulder - armW * 0.8), 172)} ${p(s * (shoulder - armW), 140)} ${p(s * (shoulder - 14), 128)}`,
    "Z",
  ].join(" ");

  const sleeve = (s) => [
    `M ${p(s * (shoulder - 14), 122)}`,
    `C ${p(s * (shoulder + armW * 0.9), 130)} ${p(s * (shoulder + armW + 1), 158)} ${p(s * (shoulder + armW * 0.8), Y.sleeve)}`,
    `L ${p(s * (shoulder - armW * 0.9), Y.sleeve - 6)}`,
    `C ${p(s * (shoulder - armW), 168)} ${p(s * (shoulder - 16), 134)} ${p(s * (shoulder - 20), 126)}`,
    "Z",
  ].join(" ");

  const pants = [
    `M ${p(-hip + 1, 296)}`,
    `L ${p(hip - 1, 296)}`,
    `C ${p(hip, 360)} ${p(legCX + legHW, 470)} ${p(legCX + legHW, Y.ankle)}`,
    `L ${p(legCX - legHW, Y.ankle)}`,
    `C ${p(legCX - legHW, 480)} ${p(6, 372)} ${p(4.5, 330)}`,
    `C ${p(2, 322)} ${p(-2, 322)} ${p(-4.5, 330)}`,
    `C ${p(-6, 372)} ${p(-legCX + legHW, 480)} ${p(-legCX + legHW, Y.ankle)}`,
    `L ${p(-legCX - legHW, Y.ankle)}`,
    `C ${p(-legCX - legHW, 470)} ${p(-hip, 360)} ${p(-hip + 1, 296)}`,
    "Z",
  ].join(" ");

  const shoe = (s) => {
    const x = s * legCX;
    return [
      `M ${p(x - legHW - 2, Y.ankle - 2)}`,
      `C ${p(x - legHW - 6, 626)} ${p(x - legHW - 8 - s * 6, Y.sole - 4)} ${p(x - legHW - 2 - s * 4, Y.sole)}`,
      `L ${p(x + legHW + 2 + s * 4, Y.sole)}`,
      `C ${p(x + legHW + 8 + s * 6, Y.sole - 4)} ${p(x + legHW + 6, 626)} ${p(x + legHW + 2, Y.ankle - 2)}`,
      "Z",
    ].join(" ");
  };

  // Cabeza: mandíbula ancha (A) o mentón suave (B).
  const cheek = isA ? 26.5 : 24.5;
  const jaw = isA ? 10 : 5.5;
  const head = [
    `M ${p(-cheek, 58)}`,
    `C ${p(-cheek, 33)} ${p(-13, Y.headTop)} ${p(0, Y.headTop)}`,
    `C ${p(13, Y.headTop)} ${p(cheek, 33)} ${p(cheek, 58)}`,
    `C ${p(cheek, isA ? 80 : 76)} ${p(jaw + 7, isA ? 96 : 94)} ${p(0, Y.chin)}`,
    `C ${p(-jaw - 7, isA ? 96 : 94)} ${p(-cheek, isA ? 80 : 76)} ${p(-cheek, 58)}`,
    "Z",
  ].join(" ");

  const neckShape = [
    `M ${p(-neck, 88)}`,
    `L ${p(-neck - 1, 120)}`,
    `C ${p(-neck * 0.5, 126)} ${p(neck * 0.5, 126)} ${p(neck + 1, 120)}`,
    `L ${p(neck, 88)}`,
    "Z",
  ].join(" ");

  // Rasgos faciales.
  const eyeY = 63;
  const eye = (s) => `
    <ellipse cx="${CX + s * 11}" cy="${eyeY}" rx="5.4" ry="3" fill="#f6f4f0"/>
    <circle cx="${CX + s * 11}" cy="${eyeY + 0.4}" r="2.7" fill="${palette.iris}"/>
    <circle cx="${CX + s * 11}" cy="${eyeY + 0.4}" r="1.25" fill="#17130f"/>
    <circle cx="${CX + s * 11 - 0.9}" cy="${eyeY - 0.6}" r="0.55" fill="#ffffff" opacity="0.9"/>
    <path d="M ${p(s * 5.6, eyeY - 2.4)} Q ${p(s * 11, eyeY - 4.8)} ${p(s * 16.4, eyeY - 1.6)}" fill="none" stroke="${palette.skinShadow}" stroke-width="1.1" stroke-linecap="round"/>`;

  const brows = (s) => `<path d="M ${p(s * 5.5, 56)} Q ${p(s * 11.5, isA ? 52.6 : 53.2)} ${p(s * 17, 55.4)}" fill="none" stroke="${palette.brows}" stroke-width="${isA ? 2.9 : 2.1}" stroke-linecap="round"/>`;

  const nose = `<path d="M ${p(1.2, 66)} C ${p(2.2, 71)} ${p(2.6, 75)} ${p(2.2, 78)} Q ${p(0.8, 80.4)} ${p(-2.6, 79.4)}" fill="none" stroke="${palette.skinShadow}" stroke-width="1.5" stroke-linecap="round"/>`;

  const lipsLowY = isA ? 90.5 : 91.5;
  const lips = `<path d="M ${p(-7.6, 85.8)} Q ${p(-3.6, 83.2)} ${p(0, 84.8)} Q ${p(3.6, 83.2)} ${p(7.6, 85.8)} Q ${p(3.8, lipsLowY)} ${p(0, lipsLowY)} Q ${p(-3.8, lipsLowY)} ${p(-7.6, 85.8)} Z" fill="${palette.lips}"/>
    <path d="M ${p(-7.2, 86)} Q ${p(0, 87.6)} ${p(7.2, 86)}" fill="none" stroke="${scaleHex(palette.lips, 0.72)}" stroke-width="0.9" stroke-linecap="round"/>`;

  const blush = !isA && skinLum > 0.33
    ? `<ellipse cx="${CX - 16.5}" cy="74" rx="5" ry="3" fill="${palette.blush}" opacity="0.38"/><ellipse cx="${CX + 16.5}" cy="74" rx="5" ry="3" fill="${palette.blush}" opacity="0.38"/>`
    : "";

  const ears = `<ellipse cx="${CX - cheek - 1}" cy="63" rx="3.4" ry="6" fill="${palette.skin}"/><ellipse cx="${CX + cheek + 1}" cy="63" rx="3.4" ry="6" fill="${palette.skin}"/>`;

  // Pelo: corto con patillas (A) o largo suelto detrás de los hombros (B).
  const hairBack = isA ? "" : `<path d="M ${p(0, 16)} C ${p(-24, 16)} ${p(-34, 34)} ${p(-33, 62)} C ${p(-38, 130)} ${p(-38, 196)} ${p(-28, 244)} C ${p(-14, 256)} ${p(14, 256)} ${p(28, 244)} C ${p(38, 196)} ${p(38, 130)} ${p(33, 62)} C ${p(34, 34)} ${p(24, 16)} ${p(0, 16)} Z" fill="${palette.hair}"/>
    <path d="M ${p(-31, 90)} C ${p(-34, 150)} ${p(-33, 200)} ${p(-27, 238)}" fill="none" stroke="${palette.hairShine}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>
    <path d="M ${p(31, 90)} C ${p(34, 150)} ${p(33, 200)} ${p(27, 238)}" fill="none" stroke="${palette.hairShine}" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`;

  const hairFront = isA
    ? `<path d="M ${p(-cheek - 0.5, 58)} C ${p(-cheek - 1.5, 30)} ${p(-13, 17)} ${p(0, 17)} C ${p(13, 17)} ${p(cheek + 1.5, 30)} ${p(cheek + 0.5, 58)} L ${p(cheek - 3.5, 60)} C ${p(cheek - 3, 42)} ${p(12, 35)} ${p(0, 35)} C ${p(-12, 35)} ${p(-cheek + 3, 42)} ${p(-cheek + 3.5, 60)} Z" fill="${palette.hair}"/>
      <path d="M ${p(-cheek - 0.5, 56)} L ${p(-cheek + 3.5, 56)} L ${p(-cheek + 3.5, 72)} L ${p(-cheek - 0.5, 70)} Z" fill="${palette.hair}"/>
      <path d="M ${p(cheek + 0.5, 56)} L ${p(cheek - 3.5, 56)} L ${p(cheek - 3.5, 72)} L ${p(cheek + 0.5, 70)} Z" fill="${palette.hair}"/>
      <path d="M ${p(-15, 26)} Q ${p(0, 21)} ${p(15, 26)}" fill="none" stroke="${palette.hairShine}" stroke-width="2.6" stroke-linecap="round" opacity="0.75"/>`
    : `<path d="M ${p(0, 19)} C ${p(-15, 21)} ${p(-25, 33)} ${p(-27, 52)} C ${p(-29.5, 82)} ${p(-31, 116)} ${p(-28, 148)} L ${p(-21, 146)} C ${p(-23, 108)} ${p(-22, 74)} ${p(-17.5, 51)} C ${p(-14, 37)} ${p(-8, 28)} ${p(0, 26)} Z" fill="${palette.hair}"/>
      <path d="M ${p(0, 19)} C ${p(15, 21)} ${p(25, 33)} ${p(27, 52)} C ${p(29.5, 82)} ${p(31, 116)} ${p(28, 148)} L ${p(21, 146)} C ${p(23, 108)} ${p(22, 74)} ${p(17.5, 51)} C ${p(14, 37)} ${p(8, 28)} ${p(0, 26)} Z" fill="${palette.hair}"/>
      <path d="M ${p(-14, 28)} Q ${p(-22, 38)} ${p(-23.5, 54)}" fill="none" stroke="${palette.hairShine}" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>
      <path d="M ${p(14, 28)} Q ${p(22, 38)} ${p(23.5, 54)}" fill="none" stroke="${palette.hairShine}" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>`;

  const hands = `<ellipse cx="${CX - hip - armW - 1}" cy="${Y.wrist + 13}" rx="${6.4 * f}" ry="11" fill="${palette.skin}"/>
    <ellipse cx="${CX + hip + armW + 1}" cy="${Y.wrist + 13}" rx="${6.4 * f}" ry="11" fill="${palette.skin}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 680" role="img" aria-label="Vista previa de tu modelo">
  <ellipse cx="160" cy="648" rx="${hip + 46}" ry="9" fill="#000000" opacity="0.08"/>
  ${hairBack}
  <path d="${arm(-1)}" fill="${palette.skin}"/>
  <path d="${arm(1)}" fill="${palette.skin}"/>
  ${hands}
  <path d="${neckShape}" fill="${palette.skinShadow}"/>
  <path d="${pants}" fill="${palette.pants}"/>
  <path d="M ${p(-1.5, 330)} L ${p(-1.5, 300)} L ${p(1.5, 300)} L ${p(1.5, 330)} Z" fill="${palette.pantsShadow}"/>
  <path d="${shoe(-1)}" fill="${palette.shoes}"/>
  <path d="${shoe(1)}" fill="${palette.shoes}"/>
  <path d="${sleeve(-1)}" fill="${palette.teeShadow}"/>
  <path d="${sleeve(1)}" fill="${palette.teeShadow}"/>
  <path d="${torso(hip + 3, Y.hem)}" fill="${palette.tee}"/>
  <path d="${head}" fill="${palette.skin}"/>
  ${ears}
  ${blush}
  ${brows(-1)}
  ${brows(1)}
  ${eye(-1)}
  ${eye(1)}
  ${nose}
  ${lips}
  ${hairFront}
</svg>`;
}

export function avatarDataUrl(perfil) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(avatarSvgMarkup(perfil))}`;
}
