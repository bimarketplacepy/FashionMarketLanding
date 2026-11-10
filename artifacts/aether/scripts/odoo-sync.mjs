#!/usr/bin/env node
// Sincroniza las prendas del motor (data/library.json) con productos de Odoo 19.
//
//   node scripts/odoo-sync.mjs                 # dry-run: sólo cuenta y lista
//   node scripts/odoo-sync.mjs --aplicar       # backup del estado de Odoo + escribe
//   node scripts/odoo-sync.mjs --aplicar --limite 5          # prueba con 5 prendas
//   node scripts/odoo-sync.mjs --aplicar --imagenes          # re-sube imágenes
//   node scripts/odoo-sync.mjs --categoria-raiz "Moda"       # nombre de la categoría padre
//
// Credenciales (Secrets o artifacts/aether/.env): ODOO_URL, ODOO_DB, ODOO_API_KEY.
// Usa la API JSON-2 de Odoo 19 (POST /json/2/<modelo>/<método>, API key de un
// usuario técnico con permisos de Ventas/Sitio web).
//
// Qué hace:
// - Categorías web: la raíz ("Moda") con la experiencia activada (campo
//   fm_experience del módulo website_fashion_market) y una hija por tipo de
//   prenda, con los mismos nombres que la colección (catalog-types.js).
// - Productos: el vínculo es la Referencia interna (default_code = id de la
//   prenda). Crea las prendas activas que faltan, actualiza nombre/descripción/
//   categoría/publicación de las que existen y despublica (nunca borra) las que
//   el motor desactivó. Productos de Odoo sin default_code de library.json no se
//   tocan. Precio: se crea en 0 y no se vuelve a tocar (showPrices: false en
//   site-config.json); con "Evitar la venta de productos con precio cero" en
//   Odoo la ficha muestra "Contactanos" en vez de precio y carrito.
// - Idempotente: una segunda corrida sin cambios en library.json da 0 cambios.
import { readFileSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { TYPES } from "../src/landing/catalog-types.js";
import { readSiteConfig } from "./site-config.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const LIBRARY = path.join(ROOT, "data/library.json");
const GARMENT_DIRS = [path.join(ROOT, "public/garments"), path.join(ROOT, "dist/public/garments")];
const BACKUP_DIR = path.join(ROOT, "data/_backups");
const BATCH = 40;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APPLY = flag("--aplicar");
const REFRESH_IMAGES = flag("--imagenes");
const LIMIT = Number(option("--limite", 0)) || 0;
const ROOT_NAME = option("--categoria-raiz", "Moda");

function readEnv(name) {
  if (process.env[name]) return process.env[name].trim();
  try {
    const env = readFileSync(path.join(ROOT, ".env"), "utf8");
    const line = env.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}

const ODOO_URL = readEnv("ODOO_URL").replace(/\/+$/, "");
const ODOO_DB = readEnv("ODOO_DB");
const ODOO_API_KEY = readEnv("ODOO_API_KEY");

// ---------- Cliente JSON-2 ----------

export async function odoo(model, method, params = {}) {
  const response = await fetch(`${ODOO_URL}/json/2/${model}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `bearer ${ODOO_API_KEY}`,
      ...(ODOO_DB ? { "X-Odoo-Database": ODOO_DB } : {}),
    },
    body: JSON.stringify(params),
  });
  const text = await response.text();
  let value;
  try { value = JSON.parse(text); } catch { value = text; }
  if (!response.ok) {
    const message = value?.message || value?.name || String(value).slice(0, 300);
    throw new Error(`Odoo ${model}.${method} → ${response.status}: ${message}`);
  }
  return value;
}

// Sin `lang`: los textos se escriben en el idioma base de la base de Odoo.
const CONTEXT = { active_test: false };

// ---------- Datos del motor ----------

function readLibrary() {
  return JSON.parse(readFileSync(LIBRARY, "utf8"));
}

function largestVariant(item) {
  const set = item.imageSet;
  if (!set) return null;
  const stem = path.basename(set.src);
  for (const dir of GARMENT_DIRS) {
    let names = [];
    try { names = readdirSync(dir); } catch { continue; }
    const best = names
      .filter((name) => name.startsWith(`${stem}.${set.hash}-`) && name.endsWith(".webp"))
      .map((name) => ({ name, width: Number(/-(\d+)\.webp$/.exec(name)?.[1] || 0) }))
      .sort((a, b) => b.width - a.width)[0];
    if (best) return path.join(dir, best.name);
  }
  return null;
}

// PNG con transparencia: Odoo lo procesa con Pillow y lo muestra sobre blanco.
async function imageBase64(item) {
  const file = largestVariant(item);
  if (!file) return null;
  const buffer = await sharp(file).png({ compressionLevel: 9 }).toBuffer();
  return buffer.toString("base64");
}

const TYPE_LABEL = Object.fromEntries(TYPES.filter((type) => type.id !== "all").map((type) => [type.id, type.label]));

function descriptionHtml(item) {
  const text = String(item.description || "").trim();
  if (!text) return false;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${escaped}</p>`;
}

const plainText = (html) => String(html || "").replace(/<[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ---------- Plan ----------

async function ensureCategories(plan) {
  const fields = await odoo("product.public.category", "fields_get", { attributes: ["type"] });
  const hasFlag = Boolean(fields.fm_experience);
  if (!hasFlag) plan.warnings.push("El módulo website_fashion_market no está instalado: la categoría raíz se crea sin activar la experiencia.");

  const [root] = await odoo("product.public.category", "search_read", {
    domain: [["name", "=", ROOT_NAME], ["parent_id", "=", false]],
    fields: ["id", "name", ...(hasFlag ? ["fm_experience"] : [])],
    limit: 1,
    context: CONTEXT,
  });
  const categories = { root: root?.id || null, byPart: {} };
  if (!root) plan.createCategories.push(ROOT_NAME);
  else if (hasFlag && !root.fm_experience) plan.enableExperience = root.id;

  const children = root
    ? await odoo("product.public.category", "search_read", {
      domain: [["parent_id", "=", root.id]],
      fields: ["id", "name"],
      context: CONTEXT,
    })
    : [];
  for (const [part, label] of Object.entries(TYPE_LABEL)) {
    const child = children.find((entry) => entry.name === label);
    if (child) categories.byPart[part] = child.id;
    else plan.createCategories.push(`${ROOT_NAME} / ${label}`);
  }
  return { categories, hasFlag };
}

async function buildPlan() {
  const season = readSiteConfig().activeSeason;
  const library = readLibrary();
  let active = library.filter((item) => item.active !== false && (!season || item.collection === season));
  if (LIMIT) active = active.slice(0, LIMIT);
  const inactiveIds = new Set(library.filter((item) => item.active === false).map((item) => item.id));
  const allIds = [...new Set([...active.map((item) => item.id), ...(LIMIT ? [] : inactiveIds)])];

  const plan = { create: [], update: [], unpublish: [], createCategories: [], enableExperience: null, warnings: [], season };
  const { categories, hasFlag } = await ensureCategories(plan);

  const existing = [];
  for (let index = 0; index < allIds.length; index += 200) {
    existing.push(...await odoo("product.template", "search_read", {
      domain: [["default_code", "in", allIds.slice(index, index + 200)]],
      fields: ["id", "name", "default_code", "is_published", "public_categ_ids", "description_ecommerce", "active"],
      context: CONTEXT,
    }));
  }
  const byCode = new Map();
  for (const record of existing) {
    if (byCode.has(record.default_code)) plan.warnings.push(`Referencia interna repetida en Odoo: ${record.default_code} (ids ${byCode.get(record.default_code).id} y ${record.id}); se usa el primero.`);
    else byCode.set(record.default_code, record);
  }

  for (const item of active) {
    const record = byCode.get(item.id);
    const categoryId = categories.byPart[item.part] || null;
    const vals = { name: item.name, is_published: true };
    const description = descriptionHtml(item);
    if (!record) {
      plan.create.push({ item, categoryId, vals: { ...vals, default_code: item.id, type: "consu", sale_ok: true, list_price: 0, description_ecommerce: description } });
      continue;
    }
    const changes = {};
    if (record.name !== item.name) changes.name = item.name;
    if (!record.is_published) changes.is_published = true;
    if (!record.active) changes.active = true;
    // Odoo normaliza el HTML al guardarlo: se compara el texto, no el marcado.
    if (description && plainText(record.description_ecommerce) !== plainText(description)) changes.description_ecommerce = description;
    const needsCategory = categoryId && !record.public_categ_ids.includes(categoryId);
    if (Object.keys(changes).length || needsCategory || REFRESH_IMAGES) plan.update.push({ item, record, categoryId: needsCategory ? categoryId : null, vals: changes });
  }

  for (const id of inactiveIds) {
    const record = byCode.get(id);
    if (record?.is_published) plan.unpublish.push(record);
  }

  return { plan, categories, existing, hasFlag };
}

// ---------- Aplicar ----------

async function applyPlan({ plan, categories, existing, hasFlag }) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `odoo-sync-${stamp}.json`);
  writeFileSync(backup, JSON.stringify({ odoo: ODOO_URL, db: ODOO_DB, at: new Date().toISOString(), products: existing }, null, 2));
  console.log(`Backup del estado previo de Odoo: ${path.relative(process.cwd(), backup)}`);

  if (!categories.root) {
    [categories.root] = await odoo("product.public.category", "create", {
      vals_list: [{ name: ROOT_NAME, ...(hasFlag ? { fm_experience: true } : {}) }],
      context: CONTEXT,
    });
  } else if (plan.enableExperience) {
    await odoo("product.public.category", "write", { ids: [plan.enableExperience], vals: { fm_experience: true }, context: CONTEXT });
  }
  for (const [part, label] of Object.entries(TYPE_LABEL)) {
    if (categories.byPart[part]) continue;
    [categories.byPart[part]] = await odoo("product.public.category", "create", {
      vals_list: [{ name: label, parent_id: categories.root }],
      context: CONTEXT,
    });
  }

  let done = 0;
  for (let index = 0; index < plan.create.length; index += BATCH) {
    const slice = plan.create.slice(index, index + BATCH);
    const vals_list = [];
    for (const entry of slice) {
      const categoryId = entry.categoryId || categories.byPart[entry.item.part];
      const image = await imageBase64(entry.item);
      vals_list.push({
        ...entry.vals,
        ...(categoryId ? { public_categ_ids: [[4, categoryId]] } : {}),
        ...(image ? { image_1920: image } : {}),
      });
    }
    await odoo("product.template", "create", { vals_list, context: CONTEXT });
    done += slice.length;
    console.log(`  creados ${done}/${plan.create.length}`);
  }

  for (const entry of plan.update) {
    const vals = { ...entry.vals };
    if (entry.categoryId) vals.public_categ_ids = [[4, entry.categoryId]];
    if (REFRESH_IMAGES) {
      const image = await imageBase64(entry.item);
      if (image) vals.image_1920 = image;
    }
    if (Object.keys(vals).length) await odoo("product.template", "write", { ids: [entry.record.id], vals, context: CONTEXT });
  }
  if (plan.update.length) console.log(`  actualizados ${plan.update.length}`);

  if (plan.unpublish.length) {
    await odoo("product.template", "write", { ids: plan.unpublish.map((record) => record.id), vals: { is_published: false }, context: CONTEXT });
    console.log(`  despublicados ${plan.unpublish.length}`);
  }
}

// ---------- Main ----------

async function main() {
  if (!ODOO_URL || !ODOO_API_KEY) {
    console.error("Faltan ODOO_URL y/o ODOO_API_KEY (Secrets o artifacts/aether/.env). ODOO_DB es necesaria si el servidor tiene varias bases.");
    process.exit(1);
  }
  const state = await buildPlan();
  const { plan } = state;
  console.log(`Odoo: ${ODOO_URL}${ODOO_DB ? ` (base ${ODOO_DB})` : ""} · temporada ${plan.season || "—"}${LIMIT ? ` · límite ${LIMIT}` : ""}`);
  console.log(`Categorías a crear: ${plan.createCategories.length}${plan.createCategories.length ? ` (${plan.createCategories.join(", ")})` : ""}`);
  if (plan.enableExperience) console.log(`Activar experiencia en "${ROOT_NAME}" (id ${plan.enableExperience})`);
  console.log(`Productos a crear:       ${plan.create.length}`);
  console.log(`Productos a actualizar:  ${plan.update.length}`);
  console.log(`Productos a despublicar: ${plan.unpublish.length}`);
  for (const warning of plan.warnings) console.warn(`Aviso: ${warning}`);
  for (const entry of plan.create.slice(0, 10)) console.log(`  + ${entry.item.id}  ${entry.item.name}`);
  if (plan.create.length > 10) console.log(`  … y ${plan.create.length - 10} más`);

  if (!APPLY) {
    console.log("\nDry-run: no se escribió nada. Repetí con --aplicar para sincronizar.");
    return;
  }
  await applyPlan(state);
  console.log("Listo. Corré de nuevo sin --aplicar: tiene que dar 0 cambios.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
