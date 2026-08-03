# Fashion Market — By Marketplace

Landing del sector Moda de un retailer: intro cinematográfica (ex-AETHER) + landing editorial + catálogo público con fichas de producto + outfit builder + vestidor virtual con IA + panel de administración. SIN precios ni flujo de compra/pedidos (pedido explícito del usuario, julio 2026: se quitó todo lo relacionado a precio y compra).

## Rutas (wouter, julio 2026)

- `/` — landing editorial de temporada, sin controles de demo ni accesos administrativos.
- `/catalogo` — colección pública separada del probador.
- `/probador` — probador virtual con tres secciones: "Looks sugeridos", "Crear un look" y "Mi modelo".
- `/outfit` — ruta histórica; redirige a `/probador?seccion=builder`.
- `/admin` — panel con clave simple validada en el cliente (`VITE_ADMIN_KEY`, fallback `fw2026`, sessionStorage): editor de prendas `ItemViewer` (nombre/categoría/género/talles/descripción/colores/tags) + "Administrar catálogo" para importar. El editor y la importación NO son accesibles desde las vistas públicas.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/aether/` — la app web principal (Vite + React). A pesar del nombre, hoy es Fashion Market.
  - `src/fashion/StandaloneApp.jsx` — fuente canónica de la landing, la colección y el probador. `FashionIntro.jsx`, `styles.css`, `virtual-tryon.jsx` y `virtual-tryon.css` contienen la UI sincronizada con el proyecto local.
  - `src/fashion/AdminPage.jsx` e `ItemViewer.jsx` — panel privado y editor persistente. `FashionMarket.jsx`, `OutfitBuilderPage.jsx` y `ProductSheet.jsx` quedan como implementación histórica sin imports desde el entrypoint activo.
  - `scripts/*.mjs` — backend como plugins de Vite: importación con IA (`import-job-api`), pruebas virtuales (`outfit-api`), regeneración aprobable de prendas (`garment-regeneration-api`) e imágenes responsive (`responsive-image-api`).
  - `data/` — catálogo local (`library.json`, `outfits.json`) e imágenes generadas de looks. No commitear contenido sensible.
  - `public/fashion/models/ai/` — biblioteca estática de ocho modelos IA ficticios, optimizada en WebP y versionada con la app.
  - `.env` (en `artifacts/aether/`, gitignoreado) — `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, modelos de visión/imagen.

## Architecture decisions

- El backend del vestidor corre como plugins del dev server de Vite (heredado del proyecto original), no en `artifacts/api-server`. Si se despliega a producción con `vite preview` los plugins de import/outfit no aplican en build estático — migrar a api-server llegado el caso.
- El dominio raíz del workspace (`https://<repl>.replit.dev/` sin puerto) enruta por path: `/api/*` va al api-server (8080) y el resto al dev server de Aether (24696). `aetherProxy.ts` reenvía `/api/import/*`, `/api/tryon/*` y `/api/garment-regeneration/*` al servidor de Aether.
- Escenas Three.js de AETHER se conservan en el repo pero no se montan; la intro es la única pieza que sobrevivió del sitio original.
- `allowJs` habilitado en `artifacts/aether/tsconfig.json` porque el código portado es JSX sin tipos.

## Product

- Landing minimalista de temporada (paleta crema/beige, acento bordó) + probador virtual.
- Catálogo FW2026 en español (julio 2026): `scripts/migrate-catalog-es.mjs` renombró las 247 prendas al español, unificó 24 duplicados (223 productos: remeras blancas iguales, botas left/right, jeans repetidos, etc.) y agregó `sizes` y `description` a cada item de `library.json` (outfits.json remapeado). El script NO es re-ejecutable (espera nombres en inglés). Las prendas importadas después reciben talles default en `persistImported`; ajustar desde /admin.
- El retailer carga su catálogo (los clientes NO suben prendas): vía UI ("Administrar catálogo") o masivamente con `pnpm --filter @workspace/aether run import-catalog`, que lee imágenes de App Storage bajo `catalogo/` (subcarpetas libres), las procesa con IA y registra lo hecho en `data/catalog-manifest.json` (re-ejecutable; solo procesa lo nuevo). Flags: `--modeled` (foto modelada extra), `--solo-recorte` (sin IA de imagen), `--dir <ruta>` (carpeta local).
- Importación SIN API (flujo Claude Code, preferido por el usuario para FW2026): `pnpm --filter @workspace/aether run claude-import pull` baja las fotos pendientes de App Storage (prefijo por defecto `FOTOS SELECCIONADAS FW2026/`, deduplicadas por artículo) a `data/claude-inbox/images/`; Claude analiza cada imagen con visión propia y escribe `data/claude-inbox/analysis/<key>.json` (mismo esquema que la detección de Gemini, ver cabecera de `scripts/claude-import.mjs`); `claude-import apply` recorta con sharp (misma lógica que `import-job-api.mjs`), agrega a `data/library.json` y marca `catalog-manifest.json` con `via: "claude-code"`. No usa la app ni requiere API key.
- Cutouts con fondo liso (pedido del usuario: prendas sin persona ni fondo, estilo open-wardrobe): `python3 scripts/clean-garment-images.py [ids…]` en `artifacts/aether` procesa `data/imported/` con rembg local (`u2net_cloth_seg` sobre la foto completa por categoría + `u2net` para calzado/accesorios, scoring de solidez y fallbacks). Los originales quedan en `data/imported-originals/`. Correrlo después de cada `claude-import apply` pasándole los ids nuevos. Deps python: rembg, onnxruntime, scipy (modelos en `.local/share/.u2net/`).
- El probador usa tres tabs explícitos: "Looks sugeridos", "Crear un look" y "Mi modelo". El catálogo público permanece separado y no obliga a elegir modelo.
- En "Mi modelo" el usuario elige uno de ocho avatares IA predeterminados: cuatro de presentación femenina y cuatro masculina. Cada género incluye prototipos editoriales ficticios con rasgos norteamericanos diversos, europeos diversos, de Asia oriental y africanos diversos, junto con cuatro tonos de piel y complexiones distintas. Cambiar género, tono o avatar actualiza la vista previa al instante y no consume créditos del proveedor de IA.
- La colección visual v2 usa un mismo estudio cálido, sonrisa natural, pose frontal segura, brazos separados del torso, manos visibles y vestuario neutro premium. Estas condiciones mejoran tanto la lectura visual del selector como la fidelidad al usar cada imagen como referencia para la prueba virtual.
- Los modelos son identidades ficticias completas y cerradas. El cliente no sube rostro, no configura altura, proporciones, subtono, edad ni cabello, y el backend rechaza los endpoints históricos de foto/modelo personalizado con HTTP 410.
- `shared/model-presets.mjs` es la fuente canónica para ids, género, etiquetas inclusivas, complexión fija e imágenes. No asociar apariencia con personalidad, nacionalidad, ocasión o tipo de prenda.
- Género en el catálogo: cada item de `library.json` tiene `gender` (mujer/hombre/unisex; FW2026 es todo mujer — hombre solo tiene los básicos unisex hasta cargar colección masculina). El vestidor filtra grilla, sugerencias y builder por el género del perfil (`fitsGender` en virtual-tryon.jsx). El perfil (`/api/tryon/model-profile`) guarda `gender`.
- Regeneración de prendas con la API (cuando haya cuota de imagen): `pnpm --filter @workspace/aether run regenerate-garments` — reconstrucción de producto con chroma key en pose neutra (mismo prompt del import), fuente en `data/imported-originals/`, avance en `data/garment-regen.json`, re-ejecutable; corta tras 3 errores de cuota seguidos. El formato de imagen de Gemini se corrigió a `generationConfig.imageConfig { aspectRatio: "1:1", imageSize: "1K" }` sobre v1beta (el viejo `responseFormat` con enums ASPECT_RATIO_* ya no existe).
- Antes de generar un look, el usuario guarda un preset con `POST /api/tryon/model-profile`. Al generar la prueba, `outfit-api.mjs` adjunta la imagen WebP de ese avatar como primera referencia de identidad y después las prendas exactas. Así sólo se consume API para la fotografía final solicitada, no para explorar modelos.
- Los scripts `generate-models.mjs`, `model-gen.mjs`, `model-prompt.mjs`, `model-avatar.js` y `watch-quota.sh` son utilidades históricas/offline; no forman parte del flujo público activo. Conservan valor para mantenimiento o futuras regeneraciones controladas, pero la UI y el runtime no los invocan.

## Gotchas

- La generación de cada fotografía final del look requiere cuota de imagen del proveedor configurado. Explorar, filtrar y cambiar los ocho modelos predeterminados no realiza llamadas de IA.
- El schema JSON para Gemini se sanea con `geminiSchema()` en `scripts/ai-provider.mjs` (sin `additionalProperties` ni type-arrays).
- `scripts/free-port.mjs` corre antes de `vite dev` porque Replit puede dejar procesos huérfanos reteniendo el puerto.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
