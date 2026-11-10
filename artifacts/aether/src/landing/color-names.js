// Nombre en español del color más cercano a un hex del catálogo (para los
// swatches). Es una lectura del dato, no un nombre comercial inventado.
const NAMED = [
  ["Negro", "#1a1a1a"], ["Blanco", "#f7f7f5"], ["Crudo", "#efe6d8"], ["Beige", "#dcc7ae"], ["Arena", "#d8c29d"],
  ["Camel", "#c19a6b"], ["Chocolate", "#5c3a2a"], ["Marrón", "#6b4428"], ["Gris", "#9a9a9a"], ["Gris oscuro", "#4a4a4a"],
  ["Rojo", "#b3262e"], ["Bordó", "#6e1e28"], ["Rosa", "#f2b8c6"], ["Fucsia", "#d63384"], ["Coral", "#e07850"],
  ["Terracota", "#b86a2b"], ["Naranja", "#e8762b"], ["Amarillo", "#f2d24b"], ["Amarillo pastel", "#f3e3a0"], ["Dorado", "#d4b77a"],
  ["Lima", "#cbd458"], ["Verde", "#4f8a4b"], ["Verde oliva", "#606654"], ["Verde oscuro", "#1f382b"], ["Verde agua", "#b7cfb0"],
  ["Celeste", "#8fb8de"], ["Azul", "#2f4f8f"], ["Azul marino", "#1c2a48"], ["Lila", "#b9a2d6"], ["Violeta", "#7b5ea7"],
  ["Plateado", "#c0c0c0"], ["Nude", "#d9a583"],
];

const rgb = (hex) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));

export function colorName(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || "")) return "";
  const [r, g, b] = rgb(hex);
  let best = NAMED[0];
  let bestDistance = Infinity;
  for (const entry of NAMED) {
    const [nr, ng, nb] = rgb(entry[1]);
    // Distancia ponderada (aprox. perceptual) en RGB.
    const distance = 2 * (r - nr) ** 2 + 4 * (g - ng) ** 2 + 3 * (b - nb) ** 2;
    if (distance < bestDistance) { best = entry; bestDistance = distance; }
  }
  return best[0];
}

// Colores únicos de un conjunto de prendas (para los swatches de un look).
export function lookSwatches(pieces) {
  const seen = new Set();
  const swatches = [];
  for (const piece of pieces) {
    for (const hex of [piece.color, piece.secondaryColor].filter(Boolean)) {
      const key = hex.toLowerCase();
      const name = colorName(key);
      // Un swatch por nombre: tres "verde oscuro" casi iguales se leen como uno.
      if (seen.has(name)) continue;
      seen.add(name);
      swatches.push({ hex: key, name });
    }
  }
  return swatches.slice(0, 6);
}
