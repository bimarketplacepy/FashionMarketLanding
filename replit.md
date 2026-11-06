# Fashion Market — By Marketplace

Landing del sector Moda de un retailer: intro cinematográfica (ex-AETHER) + landing editorial + catálogo público con fichas de producto + outfit builder + vestidor virtual con IA + panel de administración. SIN precios ni flujo de compra/pedidos (pedido explícito del usuario, julio 2026: se quitó todo lo relacionado a precio y compra).

**Precios**: el soporte de precio (en guaraníes, `formatPriceGs`) existe pero está apagado con `showPrices: false` en `artifacts/aether/data/site-config.json`. Con el flag apagado ni la ficha, ni las sugerencias, ni el importador por lotes muestran precio; el campo `price` se conserva en `library.json`.

## Rutas (wouter, julio 2026)

- `/` — landing editorial de temporada, sin controles de demo ni accesos administrativos.
- `/catalogo` — colección pública separada del probador. Cada tarjeta abre la ficha de producto (`ProductSheet.jsx`: atributos en español, talles, colores y carrusel "Combina con" de `sugerencias.js`); `?producto=<id>` la abre directo (enlace compartible, se mantiene con replaceState). "Agregar a mi outfit" guarda el borrador (`outfit-draft.js`, localStorage) y el builder del probador lo siembra al montar y lo sincroniza al cambiar.
- `/probador` — probador virtual con tres secciones: "Looks sugeridos", "Crear un look" y "Mi modelo".
- `/outfit` — ruta histórica; redirige a `/probador?seccion=builder`.
- `/admin` — panel cargado con `lazy()` (no entra al bundle público). La clave se valida en el servidor: `ADMIN_KEY` (Secret / `artifacts/aether/.env`, sin prefijo `VITE_`, sin valor por defecto) → `POST /api/admin/session` emite la cookie httpOnly firmada `fm_admin` (8 h, SameSite=Strict). Todas las rutas de `/api/import/*` (salvo `GET wardrobe` y `GET library/:file`), `/api/batches` y `/api/garment-regeneration` exigen esa sesión (`scripts/admin-auth.mjs`, montado en Vite y en el api-server). **En el deployment hay que cargar `ADMIN_KEY` en Secrets.**

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only). Necesario después de tocar `lib/db/src/schema/`; las tablas `tryon_*` son las que usa el probador en producción.
- Required env: `DATABASE_URL` — Postgres connection string. `GEMINI_API_KEY` tiene que estar también en el deployment: ahí la generación de looks la hace el api-server, no Vite.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/aether/` — la app web principal (Vite + React). A pesar del nombre, hoy es Fashion Market.
  - `src/fashion/StandaloneApp.jsx` — fuente canónica de la landing, la colección y el probador. `FashionIntro.jsx`, `styles.css`, `virtual-tryon.jsx` y `virtual-tryon.css` contienen la UI sincronizada con el proyecto local. `BrandLogo.jsx` es el logo oficial (placa horizontal delineada con corchetes salientes en los extremos y versalitas serif finas, en currentColor) como SVG inline; lo usan todos los `.brand-mark` y `public/favicon.svg` es el mismo logo sobre placa blanca redondeada.
  - `src/fashion/AdminPage.jsx` e `ItemViewer.jsx` — panel privado y editor persistente. `FashionMarket.jsx` y `OutfitBuilderPage.jsx` quedan como implementación histórica sin imports desde el entrypoint activo; `ProductSheet.jsx`, `SuggestionCarousel.jsx`, `sugerencias.js` y `outfit-draft.js` volvieron al flujo activo con la ficha del catálogo (agosto 2026).
  - `scripts/*.mjs` — backend como plugins de Vite: importación con IA (`import-job-api`), pruebas virtuales (`outfit-api`), regeneración aprobable de prendas (`garment-regeneration-api`) e imágenes responsive (`responsive-image-api`).
  - `data/` — catálogo local (`library.json`, `outfits.json`) e imágenes generadas de looks. No commitear contenido sensible.
  - `public/fashion/models/ai/` — biblioteca estática de ocho modelos IA ficticios, optimizada en WebP y versionada con la app.
  - `.env` (en `artifacts/aether/`, gitignoreado) — `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, modelos de visión/imagen.

## Architecture decisions

- El backend del vestidor corre como plugins del dev server de Vite (heredado del proyecto original). En el deployment **no corre ningún proceso de Aether**: se sirve el build estático más el api-server, así que los plugins no existen ahí. Por eso `/api/tryon/*` está montado en las dos partes (agosto 2026):
  - `scripts/outfit-api.mjs` exporta `createTryonHandler({ root, env, store })`, un middleware Node `(req, res, next)` sin dependencia de Vite. `outfitApi()` quedó como envoltorio delgado para el dev server.
  - La persistencia entra por `store`. En el workspace es `scripts/tryon-store-fs.mjs` (los JSON de `data/`, que se commitean y curan los looks como siempre). En el deployment es `artifacts/api-server/src/tryon/pgStore.ts` (Postgres), porque en autoscale el disco es efímero y no se comparte entre instancias.
  - **Sesión anónima por visitante** (agosto 2026): el probador es público y sin login, pero dos personas navegando a la vez no pueden pisarse el avatar ni verse los looks. `src/tryon/session.ts` emite un uuid opaco en la cookie httpOnly `fm_sid` (30 días, `sameSite: lax`, `secure` sólo en deployment) y `createTryonHandler` lo recibe vía `resolveSession(req)`. Todas las tablas `tryon_*` se consultan por `session_id`; leer o escribir con un id de otra sesión devuelve 404. Una cookie que no sea uuid v4 exacto se descarta y se emite una nueva.
  - En el workspace **no hay sesiones**: `resolveSession` cae al `"default"` por defecto y el store de archivos ignora el parámetro, así el estado sigue siendo único y commiteable. Las sesiones son sólo del deployment.
  - El store de Postgres **no sirve semilla**: un visitante nuevo arranca sin avatar (el probador lo manda a "Mi modelo", ver el `else { setSection("profile") }` de `virtual-tryon.jsx`) y con la lista de looks vacía. `data/outfits.json`, `data/model-profile.json` y `data/outfit-images/` son parte del flujo de curaduría del workspace, no de la vista pública — decisión explícita del usuario, agosto 2026.
  - `artifacts/api-server/src/tryon/index.ts` decide el modo: en deployment monta el handler con Postgres; en el workspace mantiene `aetherProxy.ts` apuntando a Vite. Se puede forzar con `TRYON_MODE=local|proxy` (útil para probar el camino de producción sin publicar).
  - El panel `/admin` (import-job, batch-import, garment-regeneration) **sigue siendo sólo del workspace**: en el deployment esas rutas responden 503 con un mensaje explícito. El catálogo se carga en el workspace y se publica commiteado. Excepción de sólo lectura (agosto 2026): en deployment el api-server sirve directo `GET /api/import/wardrobe` (lee `data/library.json`) y `GET /api/import/library/:file` (PNGs de `data/imported/`), porque son lo que alimenta el catálogo público y el probador; sin eso la colección quedaba vacía en producción.
- El dominio raíz del workspace (`https://<repl>.replit.dev/` sin puerto) enruta por path: `/api/*` va al api-server (8080) y el resto al dev server de Aether (24696). En el deployment rige la misma regla, que es la razón por la que todo lo que tiene que funcionar en producción vive bajo `/api/`.
- Las imágenes responsive de ipx se sirven en `/api/_ipx` (antes `/_ipx`), justamente para caer del lado del api-server en producción. `responsive-image-api.mjs` exporta `createIpxHandler({ dirs })` y lo montan tanto Vite como Express; `OptimizedImage.jsx` fija ese `baseURL`.
- Escenas Three.js de AETHER se conservan en el repo pero no se montan; la intro es la única pieza que sobrevivió del sitio original.
- `allowJs` habilitado en `artifacts/aether/tsconfig.json` porque el código portado es JSX sin tipos.

## Product

- Landing minimalista de temporada (paleta crema/beige, acento bordó) + probador virtual.
- Catálogo FW2026 en español (julio 2026): `scripts/migrate-catalog-es.mjs` renombró las 247 prendas al español, unificó 24 duplicados (223 productos: remeras blancas iguales, botas left/right, jeans repetidos, etc.) y agregó `sizes` y `description` a cada item de `library.json` (outfits.json remapeado). El script NO es re-ejecutable (espera nombres en inglés). Las prendas importadas después reciben talles default en `persistImported`; ajustar desde /admin.
- El retailer carga su catálogo (los clientes NO suben prendas): vía UI ("Administrar catálogo") o masivamente con `pnpm --filter @workspace/aether run import-catalog`, que lee imágenes de App Storage bajo `catalogo/` (subcarpetas libres), las procesa con IA y registra lo hecho en `data/catalog-manifest.json` (re-ejecutable; solo procesa lo nuevo). Flags: `--modeled` (foto modelada extra), `--solo-recorte` (sin IA de imagen), `--dir <ruta>` (carpeta local), `--tag <etiqueta>` (etiqueta fija para toda la corrida, ej. temporada), `--por-articulo` (una foto por prefijo de estilo).
- Temporada SS26 (agosto 2026): `artifacts/aether/fotos-ss26/` (gitignoreado) tiene las 1.535 fotos de la carpeta de Drive "FOTOS SS26" ya organizadas por marca — ver su README para estructura, conteos y comandos de importación con `--tag ss26`. Pendiente al publicarla: actualizar el eyebrow de la landing ("Nueva temporada · Otoño – Invierno 2026" en `StandaloneApp.jsx`) y la sección "Winter Sale".
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
- Prendas que entran al catálogo con el fondo croma pegado: `removeChromaBackground()` mide distancia euclídea al croma *exacto* que se pidió, y eso falla en dos casos reales. Primero, `chooseChromaKey()` elige el croma más lejano al color de la prenda, así que para una prenda negra pide cian pero la IA suele devolver verde. Segundo, aun acertando el tono, la IA devuelve verdes apagados (ej. `rgb(6,170,76)`, a ~114 de `#00ff00`) que superan el tope de tolerancia (110). En ambos casos el fondo sobrevive entero. Rescate: `node scripts/dechroma-garment.mjs --check` lista los afectados y `node scripts/dechroma-garment.mjs <id>...` los limpia; el matte va por verdor relativo (`G - max(R,B)`) en vez de distancia absoluta y delega el encuadre y la verificación en `processChromaBackground()` para no desviarse de la convención. Agosto 2026 se rescataron así la bota texana negra y el pantalón denim oscuro.
- `scripts/free-port.mjs` corre antes de `vite dev` porque Replit puede dejar procesos huérfanos reteniendo el puerto.
- `ipx` pide `sharp@^0.32.6`, cuyo binario nativo depende de un install script que pnpm no ejecuta, así que `/api/_ipx` moría con `Cannot find module '../build/Release/sharp-linux-x64.node'`. Está forzado a `^0.35.3` con el override `ipx>sharp` en `pnpm-workspace.yaml`; no quitarlo.
- `sharp` es dependencia explícita de `api-server` porque el bundle de esbuild lo externaliza y el handler del vestidor lo arrastra vía `ai-provider.mjs`.
- El build de `mockup-sandbox` (y el de aether) exigen `PORT` y `BASE_PATH` en el entorno: `pnpm run build` a secas desde una shell pelada falla ahí, no es un error del código.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
