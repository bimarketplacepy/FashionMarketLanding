// Migración única del catálogo FW2026 (julio 2026):
//  - renombra todas las prendas al español rioplatense
//  - unifica duplicados (misma prenda importada varias veces) y remapea outfits.json
//  - agrega sizes y description a cada prenda
// Ejecutar desde artifacts/aether:  node scripts/migrate-catalog-es.mjs
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const libraryFile = path.join(root, "data", "library.json");
const outfitsFile = path.join(root, "data", "outfits.json");

// Nombre en inglés → nombre en español. Las entradas que traducen a un mismo
// nombre (dentro de la misma categoría) se unifican en un solo producto.
const NAMES = {
  // Accesorios
  "Amber Tortoise Resin and Gold Bangle Set": "Set de pulseras de resina ámbar y dorado",
  "Black Cat-Eye Sunglasses": "Lentes de sol cat-eye negros",
  "Black Curved Shoulder Bag": "Cartera de hombro curva negra",
  "black leather waist belt": "Cinturón de cuero negro",
  "Black Oval Retro Sunglasses": "Lentes de sol retro ovalados negros",
  "Black Rectangular Sunglasses": "Lentes de sol rectangulares negros",
  "Black Skinny Belt with Gold Buckle": "Cinturón fino negro con hebilla dorada",
  "Black Stone Pendant Cord Necklace": "Collar de cordón con dije de piedra negra",
  "Blue Geometric Squares Print Silk Scarf": "Pañuelo de seda azul con estampado geométrico",
  "Blush Marbled Resin and Gold Bangle Set": "Set de pulseras de resina rosa y dorado",
  "Brown Leather Western Buckle Belt": "Cinturón western de cuero marrón",
  "Burgundy Cat-Eye Sunglasses": "Lentes de sol cat-eye bordó",
  "Camel Zip-Top Tote Bag": "Bolso tote camel con cierre",
  "Clear Champagne Oval Retro Sunglasses": "Lentes de sol retro ovalados champagne",
  "Cow Print Satin Square Scarf with Brown Border": "Pañuelo satinado print vaca con borde marrón",
  "Cream Cat-Eye Sunglasses": "Lentes de sol cat-eye crema",
  "Cream Mini Handbag with Gold Charm": "Mini cartera crema con dije dorado",
  "Dark Brown Suede Shoulder Bag": "Cartera de gamuza marrón oscuro",
  "floral print cloth tote bag": "Bolso tote de tela floral",
  "Gold Chain Link Necklace": "Collar de cadena dorada",
  "Gold Chunky Chain Necklace": "Collar de cadena gruesa dorada",
  "Gold Chunky Cuff Bracelet": "Brazalete ancho dorado",
  "Gold Dipped Hoop Earrings Set": "Set de aros dorados",
  "Gold Dipped Puffed Heart Earring Set": "Set de aros corazón dorados",
  "Gold Layered Chain Necklace": "Collar dorado de cadenas en capas",
  "Gold Layered Collar Necklace": "Gargantilla dorada en capas",
  "Gold Layered Cross Pendant Necklaces": "Collares dorados con cruz en capas",
  "Ivory Fringed Soft Knit Scarf": "Bufanda de punto marfil con flecos",
  "Ivory Marbled Resin Bangle Set": "Set de pulseras de resina marfil",
  "Layered Pendant Necklace": "Collar en capas con dije",
  "Multicolor Beaded Necklace": "Collar de cuentas multicolor",
  "Silver Bangle Bracelet Stack": "Set de pulseras plateadas",
  "Silver Oval Pendant Cord Necklace": "Collar de cordón con dije oval plateado",
  "Silver Shell Statement Earrings": "Aros statement de concha plateados",
  "Tortoiseshell Cat-Eye Sunglasses": "Lentes de sol cat-eye carey",
  "Tortoiseshell Oval Retro Sunglasses": "Lentes de sol retro ovalados carey",
  // Prendas inferiores
  "Beige High-Waist Column Midi Skirt": "Pollera midi columna beige",
  "Beige Slim Stretch Pants": "Pantalón beige slim elastizado",
  "Black Belted A-Line Mini Skirt": "Minipollera evasé negra con cinturón",
  "Black Faux Leather Straight Pants": "Pantalón recto de cuero sintético negro",
  "Black Faux Leather Studded Mini Skirt": "Minipollera de cuero sintético con tachas",
  "Black Faux Leather Studded Ruffle Mini Skirt": "Minipollera de cuero sintético con tachas y volados",
  "Black lace trim skirt": "Pollera negra con puntilla",
  "Black Leather Mini Skirt": "Minipollera de cuero negra",
  "Black Parachute Cargo Pants": "Pantalón cargo paracaídas negro",
  "Black Pleated Wide-Leg Trousers": "Pantalón ancho plisado negro",
  "Black Satin Bias-Cut Maxi Skirt": "Pollera maxi satinada al bies negra",
  "Black Satin Lace-Trim Skirt": "Pollera satinada con puntilla negra",
  "Black Slim Pants": "Pantalón slim negro",
  "Black Tailored Micro Shorts": "Micro short sastrero negro",
  "Black Wide-Leg Trousers": "Pantalón ancho negro",
  "Brown Plaid Pleated Wide-Leg Trousers": "Pantalón ancho plisado a cuadros marrón",
  "Brown Suede Lace-Up Micro Skirt": "Micropollera de gamuza marrón con cordones",
  "Burgundy Tartan Plaid Wide-Leg Pants": "Pantalón ancho tartán bordó",
  "Camel Corduroy Barrel-Leg Jeans": "Jean barrel de corderoy camel",
  "Camel Straight-Leg Trousers": "Pantalón recto camel",
  "Chocolate Brown Side-Slit Midi Skirt": "Pollera midi chocolate con tajo",
  "Cream Palm Print Drawstring Pants": "Pantalón crema con estampado de palmeras",
  "Dark Blue Pinstripe Wide-Leg Jeans": "Jean ancho azul a rayas",
  "Dark Brown Satin Balloon-Hem Maxi Skirt": "Pollera maxi satinada globo marrón oscuro",
  "Dark Indigo High-Rise Jeans": "Jean tiro alto índigo oscuro",
  "Dark Indigo High-Waist Jeans": "Jean tiro alto índigo oscuro",
  "Dark Rinse High-Waist Jeans": "Jean tiro alto lavado oscuro",
  "Dark Wash Bootcut Jeans": "Jean bootcut lavado oscuro",
  "Dark Wash Denim Jeans": "Jean clásico lavado oscuro",
  "Dark-Wash High-Rise Straight Jeans": "Jean recto tiro alto lavado oscuro",
  "Grey Glen Plaid Wide-Leg Trousers": "Pantalón ancho príncipe de Gales gris",
  "Grey Houndstooth Tapered Trousers": "Pantalón pata de gallo gris",
  "Grey Leopard Print Satin Wide-Leg Pants": "Pantalón ancho satinado animal print gris",
  "Grey Leopard Print Wide Leg Pants": "Pantalón ancho animal print gris",
  "Grey Leopard Print Wide-Leg Pants": "Pantalón ancho animal print gris",
  "Grey Plaid Pleated Mini Skirt": "Minipollera plisada a cuadros gris",
  "Grey Studded Suede Mini Skirt": "Minipollera de gamuza gris con tachas",
  "high-waisted blue jeans": "Jean azul tiro alto",
  "High-Waisted Shorts": "Short tiro alto",
  "Ivory Rust Rope Print Wide-Leg Pants": "Pantalón ancho marfil con estampado de sogas",
  "Leopard Print Satin High-Waist Wide-Leg Pants": "Pantalón ancho satinado animal print tiro alto",
  "Leopard Print Satin Wide-Leg Pants": "Pantalón ancho satinado animal print",
  "Light Wash High-Rise Jeans": "Jean tiro alto lavado claro",
  "Light Wash Paneled Denim Skirt": "Pollera de jean lavado claro con paneles",
  "Light Wash Straight Jeans": "Jean recto lavado claro",
  "Light Wash Straight-Leg Jeans": "Jean recto lavado claro",
  "Light Wash Wide Leg Jeans": "Jean ancho lavado claro",
  "Light-Wash Relaxed Jeans": "Jean relaxed lavado claro",
  "Matching Tailored Plaid Shorts": "Short sastrero a cuadros",
  "Medium Wash High-Rise Jeans": "Jean tiro alto lavado medio",
  "Medium-Wash High-Rise Jeans": "Jean tiro alto lavado medio",
  "Medium Wash High-Rise Wide-Leg Jeans": "Jean ancho tiro alto lavado medio",
  "Medium Wash Skinny Jeans": "Jean skinny lavado medio",
  "Medium Wash Straight-Leg Jeans": "Jean recto lavado medio",
  "Medium Wash Wide-Leg Jeans": "Jean ancho lavado medio",
  "Plaid High-Waisted Tailored Shorts": "Short sastrero tiro alto a cuadros",
  "Polka Dot Silk Trousers": "Pantalón de seda a lunares",
  "Sage Khaki Nylon Parachute Pants": "Pantalón paracaídas verde salvia",
  "Tan Leopard Print Wide-Leg Pants": "Pantalón ancho animal print tostado",
  "tan relaxed sweatpants": "Jogger tostado relaxed",
  "Taupe Houndstooth Tailored Shorts": "Short sastrero pata de gallo topo",
  "Washed Black Jeans": "Jean negro lavado",
  "Washed Black Straight-Leg Jeans": "Jean recto negro lavado",
  "White Flowy Smocked-Waist Maxi Skirt": "Pollera maxi fluida blanca con cintura fruncida",
  "White High-Waist Jeans": "Jean blanco tiro alto",
  "White Sweat Shorts": "Short de algodón blanco",
  "White Tailored Pleated Shorts": "Short sastrero plisado blanco",
  // Calzado
  "Beige Espadrille Wedge Sandals": "Sandalias beige con plataforma de yute",
  "Black heel sandals": "Sandalias negras con taco",
  "Black Lace-Up Flat Sandals": "Sandalias bajas negras atadas",
  "Black Leather Ankle Boots": "Botinetas de cuero negras",
  "black leather boat shoe": "Náuticos de cuero negros",
  "Black Pointed-Toe Heeled Sandals": "Sandalias negras en punta con taco",
  "Black Pointed-Toe Pumps": "Stilettos negros en punta",
  "Black Strappy Flat Sandals": "Sandalias bajas negras de tiras",
  "Black Strappy Heeled Sandals": "Sandalias negras de tiras con taco",
  "Black Strappy Stiletto Heels": "Stilettos negros de tiras",
  "Black Suede Heeled Mules": "Mules de gamuza negras con taco",
  "Black Suede Striped Low-Top Sneakers": "Zapatillas de gamuza negras con rayas",
  "black western cowboy boot": "Botas texanas negras",
  "brown leather boat shoe": "Náuticos de cuero marrones",
  "tan suede boat shoe": "Náuticos de gamuza tostados",
  "Brown Leather Knee-High Heeled Boots": "Botas altas de cuero marrón con taco",
  "Chocolate Brown Satin Heeled Mules": "Mules satinadas chocolate con taco",
  "Cream Crossover Mule Sandals": "Sandalias mule cruzadas crema",
  "fur-lined winter boot (left)": "Botas de invierno con corderito",
  "fur-lined winter boot (right)": "Botas de invierno con corderito",
  "Gold Metallic Strappy Heeled Sandals": "Sandalias doradas de tiras con taco",
  "Grey Suede Pointed-Toe Heels": "Stilettos de gamuza gris en punta",
  "Grey Suede Sneakers": "Zapatillas de gamuza gris",
  "Leather Mid-Calf Boots": "Botas de cuero caña media",
  "platform suede mule slipper": "Suecos de gamuza con plataforma",
  "Red Western Cowboy Boot": "Botas texanas rojas",
  "Rhinestone Embellished Mary Jane Flats": "Chatitas Mary Jane con strass",
  "Strappy Kitten Heel Sandals": "Sandalias de tiras taco kitten",
  "Taupe Slingback Kitten Heels": "Zapatos slingback topo taco kitten",
  "taupe suede pointed-toe loafers": "Mocasines de gamuza topo en punta",
  "White Pointed-Toe Heeled Mules": "Mules blancas en punta con taco",
  // Prendas superiores
  "Argyle Knit Sweater Vest": "Chaleco tejido rombos",
  "Black Faux Leather Grommet Halter Corset Top": "Top corset halter de cuero sintético",
  "Black Fitted Tank Top": "Musculosa negra entallada",
  "Black Floral Print Puff-Sleeve Blouse": "Blusa negra floral mangas abullonadas",
  "Black lace halter top": "Top halter de encaje negro",
  "Black Open-Knit One-Sleeve Lace-Up Top": "Top tejido calado un hombro",
  "black padded puffer coat": "Campera puffer negra",
  "black ribbed crop top": "Crop top morley negro",
  "Black Ribbed Knit Top with Bow Keyhole Front": "Top morley negro con moño",
  "Black Ruffle-Neck Puff Sleeve Blouse": "Blusa negra con volados y mangas abullonadas",
  "Black Satin Lace-Trim Camisole": "Musculosa satinada negra con puntilla",
  "Black Sequin Sleeveless Boat-Neck Top": "Top de lentejuelas negro",
  "Black Short Sleeve Mock Neck Ribbed Top": "Top morley negro medio polo",
  "Black Smocked Mock Neck Crop Top": "Crop top negro fruncido medio polo",
  "Blush Ladder-Trim Swing Blouse": "Blusa rosa con calados",
  "Brown Floral Print V-Neck Peplum Blouse": "Blusa peplum floral marrón escote V",
  "Burgundy Argyle V-Neck Cropped Sweater": "Sweater corto rombos bordó",
  "Burgundy Metallic Sheer Knit Camisole": "Musculosa tejida metalizada bordó",
  "Burgundy Ruffle-Neck Balloon Sleeve Blouse": "Blusa bordó con volados manga globo",
  "burgundy stripe faux leather jacket": "Campera de cuero sintético bordó a rayas",
  "Camel Sheer Chiffon Smocked-Waist Blouse": "Blusa de gasa camel con cintura fruncida",
  "Chocolate Brown Mesh Halter Top": "Top halter de tul chocolate",
  "Chocolate Brown Rhinestone Studded Tank Top": "Musculosa chocolate con strass",
  "Chocolate Brown Ruffle Tie-Front Blouse": "Blusa chocolate con volados atada adelante",
  "Chocolate Brown Satin Lace-Trim Cami Top": "Top satinado chocolate con puntilla",
  "Chocolate Brown Sheer Chiffon Tie-Front Blouse": "Blusa de gasa chocolate atada adelante",
  "Cream Floral Chiffon Peasant Blouse": "Blusa campesina de gasa floral crema",
  "Cream Ribbed Knit Button-Front Top": "Top morley crema con botones",
  "Cream Ribbed Long-Sleeve Crop Top": "Crop top morley crema manga larga",
  "Grey Crewneck Knit Sweater": "Sweater gris cuello redondo",
  "Grey Leopard Print Satin Button-Up Shirt": "Camisa satinada animal print gris",
  "Grey Leopard Print Satin Tie-Front Shirt": "Camisa satinada animal print gris atada adelante",
  "Grey Leopard Print Tie-Front Shirt": "Camisa animal print gris atada adelante",
  "Heather Grey Ribbed Cami Tank Top": "Musculosa morley gris de tiras finas",
  "Heather Grey Ribbed Scoop Tank Top": "Musculosa morley gris escote U",
  "Heather Grey Ribbed Tank Top": "Musculosa morley gris",
  "I Edit Wikipedia Graphic T-Shirt": "Remera gráfica negra",
  "Ivory and Black Wave Jacquard Crew Sweater": "Sweater jacquard marfil y negro",
  "Ivory Cap-Sleeve Blouse with Black Contrast Piping": "Blusa marfil con vivos negros",
  "Ivory Geometric Line Print Oversized Shirt": "Camisa oversized marfil con líneas geométricas",
  "Ivory Satin Corset Peplum Top": "Top corset peplum satinado marfil",
  "Ivory Striped Ribbed Mock Neck Sweater": "Sweater marfil a rayas medio polo",
  "Leopard Print Satin Button-Down Shirt": "Camisa satinada animal print",
  "Leopard Print Satin Button-Up Blouse": "Blusa satinada animal print",
  "Leopard Print Satin Tie-Front Cropped Shirt": "Camisa corta satinada animal print atada",
  "Leopard Print Satin Tie-Front Shirt": "Camisa satinada animal print atada adelante",
  "Light Blue Cropped Button-Up Shirt": "Camisa corta celeste",
  "Navy Embroidered Crewneck Sweatshirt": "Buzo azul marino bordado",
  "Navy Flutter-Sleeve Blouse with Lace Yoke": "Blusa azul marino con encaje",
  "Navy Graphic Sweatshirt": "Buzo azul marino estampado",
  "Olive Cropped Tank Top": "Musculosa corta oliva",
  "olive utility shirt jacket": "Camisaco utilitario oliva",
  "Pale Yellow Chicago Graphic Long-Sleeve Ringer Tee": "Remera manga larga amarilla Chicago",
  "Plum Sheer Chiffon Ruffle-Front Blouse": "Blusa de gasa ciruela con volados",
  "Polka Dot Ruffled Tie-Back Blouse": "Blusa a lunares con volados",
  "Sleeveless Tailored Vest Top": "Chaleco sastrero sin mangas",
  "Tan Leopard Print Satin Button-Up Shirt": "Camisa satinada animal print tostado",
  "Tan Striped Band-Collar Button-Up Blouse": "Blusa a rayas tostada cuello mao",
  "Taupe Houndstooth Button-Front Vest Top": "Chaleco pata de gallo topo",
  "White Base T-Shirt": "Remera blanca básica",
  "White Crew Neck T-Shirt": "Remera blanca cuello redondo",
  "White Crewneck Tee": "Remera blanca cuello redondo",
  "White Cropped Square-Neck Tank Top": "Musculosa corta blanca escote recto",
  "White Fitted Tank Top": "Musculosa blanca entallada",
  "White Scoop-Neck Crop Tank Top": "Crop top blanco escote U",
  "White Square-Neck Ribbed Crop Top": "Crop top morley blanco escote recto",
  "White Square-Neck Sleeveless Top": "Top blanco sin mangas escote recto",
  "White T-Shirt with Grommet Shoulder Detail": "Remera blanca con ojales en hombros",
  // Abrigos, vestidos y enteritos
  "Black Cropped Collared Jacket": "Campera corta negra con cuello",
  "Black Cropped Double-Breasted Jacket": "Campera corta cruzada negra",
  "Black Cropped Double-Breasted Trench Jacket": "Trench corto cruzado negro",
  "Black Double-Breasted Cropped Trench Jacket": "Trench corto cruzado negro",
  "Black Faux Leather One-Shoulder Mini Dress": "Vestido corto un hombro de cuero sintético",
  "Black Hooded Nylon Windbreaker with Drawstring Hem": "Rompevientos negro con capucha",
  "Black Polka Dot Ruffle-Sleeve Midi Dress": "Vestido midi negro a lunares",
  "Black Strapless One-Piece Swimsuit with Gold Plate": "Malla strapless negra con detalle dorado",
  "Black Wool-Blend Shacket with Flap Pockets": "Camisaco de paño negro con bolsillos",
  "Black Wool-Blend Zip Bomber Jacket": "Campera bomber de paño negra",
  "Camel Longline Trench Coat with Corduroy Trim": "Trench largo camel con detalles de corderoy",
  "Champagne Beige Faux Wrap Ruffle Dress": "Vestido cruzado champagne con volados",
  "Charcoal Grey Wool Shacket": "Camisaco de lana gris oscuro",
  "Charcoal Grey Wool Utility Shacket": "Camisaco utilitario de lana gris",
  "Chocolate Brown Faux Leather Bomber Jacket": "Campera bomber de cuero sintético chocolate",
  "Chocolate Brown Single-Button Blazer": "Blazer chocolate un botón",
  "colorblock cable knit sweater dress": "Vestido tejido trenzado colorblock",
  "Dark Blue Oversized Denim Shirt Jacket": "Camisaco de jean azul oversized",
  "Dark Indigo Contrast-Stitch Denim Jacket": "Campera de jean índigo con costuras en contraste",
  "Grey Leopard Print Long-Sleeve Wide-Leg Jumpsuit": "Mono animal print gris manga larga",
  "Grey Plaid Double-Breasted Blazer": "Blazer cruzado a cuadros gris",
  "Ivory Polka Dot Bow-Front Mini Dress": "Vestido corto marfil a lunares con moño",
  "Navy Long Coat with Contrast Corduroy Collar": "Tapado largo azul marino con cuello de corderoy",
  "Navy Longline Snap-Button Coat with Contrast Corduroy Trim": "Tapado azul marino con broches de corderoy",
  "Sage Green Hooded Utility Jacket": "Campera utilitaria verde salvia con capucha",
  "Sheer Ruffled Cover-Up Dress": "Vestido cover-up con volados",
  "Silver Shimmer One-Shoulder Flared Mini Dress": "Vestido corto plateado un hombro",
  "Taupe Belted Midi Shirt Dress with Gold Buttons": "Vestido camisero midi topo con cinturón",
};

const SIZES = {
  upperbody: ["XS", "S", "M", "L", "XL"],
  wholebody_up: ["XS", "S", "M", "L"],
  lowerbody: ["36", "38", "40", "42", "44"],
  shoes: ["35", "36", "37", "38", "39", "40"],
  accessories_up: ["Único"],
};

const MATERIAL_ES = {
  cotton: "algodón",
  linen: "lino",
  denim: "denim",
  knit: "tejido de punto",
  wool: "lana",
  leather: "cuero",
  silk: "seda",
  synthetic: "material sintético",
  mixed: "materiales combinados",
};

const SILHOUETTE_ES = {
  fitted: "silueta entallada",
  regular: "calce clásico",
  relaxed: "calce relajado",
  oversized: "corte oversized",
  flowy: "caída fluida",
  structured: "estructura definida",
};

const OCCASION_ES = {
  casual: "el día a día",
  party: "salidas y fiestas",
  work: "la oficina",
  office: "la oficina",
  evening: "la noche",
  formal: "eventos formales",
  event: "eventos",
  streetwear: "un look urbano",
  weekend: "el fin de semana",
  "smart-casual": "un look smart casual",
};

const SEASON_ES = {
  all: "todo el año",
  spring: "primavera",
  summer: "verano",
  autumn: "otoño",
  winter: "invierno",
};

function descriptionFor(item, name) {
  const material = MATERIAL_ES[item.material] || "materiales combinados";
  const silhouette = SILHOUETTE_ES[item.silhouette] || "calce clásico";
  const occasion = OCCASION_ES[(item.occasions || [])[0]] || "el día a día";
  const season = SEASON_ES[item.season] || "todo el año";
  const seasonLine = item.season === "all"
    ? "Una pieza versátil para todo el año"
    : `Pensada para ${season}`;
  return `${name} confeccionada en ${material}, con ${silhouette}. Ideal para ${occasion}. ${seasonLine}, de la colección Otoño–Invierno 2026.`;
}

const library = JSON.parse(await readFile(libraryFile, "utf8"));

const missing = library.filter((item) => !NAMES[item.name]);
if (missing.length) {
  console.error("Sin traducción:", missing.map((item) => item.name));
  process.exit(1);
}

const keptByKey = new Map();
const idRemap = new Map();
const next = [];

for (const item of library) {
  const name = NAMES[item.name];
  const key = `${item.part}|${name}`;
  const existing = keptByKey.get(key);
  if (existing) {
    // duplicado: se unifica con la prenda ya conservada
    idRemap.set(item.id, existing.id);
    existing.tags = [...new Set([...(existing.tags || []), ...(item.tags || [])])];
    if (existing.gender !== item.gender && [existing.gender, item.gender].includes("unisex")) {
      existing.gender = "unisex";
    }
    continue;
  }
  const record = {
    ...item,
    name,
    sizes: SIZES[item.part] || ["Único"],
    description: descriptionFor(item, name),
  };
  keptByKey.set(key, record);
  next.push(record);
}

await writeFile(libraryFile, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Prendas: ${library.length} → ${next.length} (${library.length - next.length} duplicados unificados)`);

// Remapear outfits.json a los ids conservados
const outfitsRaw = JSON.parse(await readFile(outfitsFile, "utf8"));
const outfits = Array.isArray(outfitsRaw) ? { version: 1, outfits: outfitsRaw } : outfitsRaw;
for (const outfit of outfits.outfits) {
  outfit.garmentIds = [...new Set(outfit.garmentIds.map((id) => idRemap.get(id) || id))];
}
await writeFile(outfitsFile, `${JSON.stringify(outfits, null, 2)}\n`);
console.log(`Outfits remapeados: ${outfits.outfits.length}`);
