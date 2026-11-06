# Fashion Market — By Marketplace

Tienda de moda de un retailer de Paraguay: landing editorial de temporada, catálogo público con fichas de producto, probador virtual con IA (ocho avatares fijos) y panel de administración. **Sin precios ni flujo de compra** (decisión del usuario, julio 2026). Todo el texto visible va en español; la moneda, si alguna vez se muestra, es guaraníes.

## Estado actual (noviembre 2026)

- **Temporada activa: SS26 — Primavera – Verano 2026.** 619 prendas activas (todas SS26). La colección FW26 (152 prendas) y 17 de SS26 están desactivadas (`active: false`): siguen en `library.json` para el admin pero no se muestran en la tienda ni en el probador.
- Las 552 prendas importadas por lotes en octubre 2026 (17 marcas) se pasaron a `collection: "SS26"`, `season: "summer"` con `scripts/migrations/assign-ss26.mjs` (dry-run + backup).

## Configuración del sitio — `artifacts/aether/data/site-config.json`

Fuente única de la temporada y de lo que se publica. La lee el front en build (`src/site-config.js`) y los importadores en el servidor (`scripts/site-config.mjs`).

- `activeSeason` / `seasonLabel` / `seasonShortLabel`: colección vigente y sus etiquetas. Ningún texto de temporada va hardcodeado.
- `importDefaults`: `collection` y `season` que reciben las prendas nuevas (import por lotes, import por job).
- `showPrices` (**false**): con el flag apagado ni la ficha, ni las sugerencias, ni el importador muestran precio; el campo `price` se conserva en `library.json` y `/api/catalog` no lo expone.
- `promotions`: `{ id, title, text, startsAt, endsAt, collection }`. Una promo sólo se renderiza dentro de su ventana y si su colección tiene prendas activas. El "Winter Sale" quedó registrado con `endsAt` 2026-08-31: no se muestra nunca más.
- Una sección/carrusel con 0 prendas no se renderiza y avisa en consola en desarrollo (`warnEmptySection`).
- Para cambiar de temporada: editar este archivo, activar/desactivar colecciones desde `/admin` y publicar.

## Rutas (wouter)

- `/` — landing (`src/landing/HomePage.jsx`).
- `/catalogo` — colección pública (`src/landing/CollectionPage.jsx`). `?tipo=<part>` filtra; `?producto=<id>` abre la ficha (`ProductSheet.jsx`, enlace compartible).
- `/probador` — probador virtual (`src/landing/TryOnPage.jsx` → `virtual-tryon.jsx`). `?seccion=builder` abre "Crear un look". `/outfit` redirige ahí.
- `/admin` — panel (`src/fashion/AdminPage.jsx`), cargado con `lazy()`: su código no entra en el bundle público.

El catálogo viene **sólo** de `CatalogProvider` (`src/fashion/catalog-context.jsx`): `scope="public"` pide `GET /api/catalog` (prendas activas, campos públicos, ~0,5 MB) y el admin usa `scope="admin"` → `GET /api/import/wardrobe` (library.json completo). No hay capas de localStorage para ediciones: la fuente de verdad es el servidor.

## Admin y seguridad

- Clave en `ADMIN_KEY` (Secrets en el deployment, `artifacts/aether/.env` en el workspace). **Sin prefijo `VITE_`** (nunca llega al bundle) y sin valor por defecto: sin la variable el panel queda cerrado.
- `POST /api/admin/session` valida la clave (comparación en tiempo constante, 10 intentos fallidos por IP cada 15 min) y emite la cookie httpOnly firmada `fm_admin` (HMAC, 8 h, SameSite=Strict, Secure en deployment). `GET` consulta la sesión, `DELETE` cierra.
- Exigen sesión: todo `/api/import/*` salvo `GET /api/import/wardrobe` y `GET /api/import/library/:file`, más `/api/batches` y `/api/garment-regeneration`. Implementado en `scripts/admin-auth.mjs`, montado como plugin de Vite y en el api-server.
- Scripts de línea de comandos (`import-catalog`, `reclassify-parts`) se autentican con el header `X-Admin-Key` (leen `ADMIN_KEY` de env o `.env`, ver `scripts/cli-admin.mjs`).
- **Al publicar: cargar `ADMIN_KEY` en Secrets del deployment.**

## Imágenes de prendas

- Maestro: `data/imported/<id>-garment.png` (PNG 1024×1024 con transparencia). Lo usan importación, regeneración y limpieza de fondos. **No viaja al deployment.**
- Web: `pnpm --filter @workspace/aether run optimize-images` genera en `public/garments/` AVIF + WebP (calidad ~80, alfa) en 400, 800 y 1024 px (el "1400" se limita al tamaño de la fuente, sin agrandar). El nombre lleva un hash del PNG (`<id>-garment.<hash>-<ancho>.webp`): regenerar una prenda cambia el nombre y no hay caché vieja.
- En `library.json` se agrega `imageSet` (`src`, `hash`, `width`, `height`, `widths`, `formats`) sin tocar `image`/`thumbnail`. Reversible: `node scripts/optimize-garment-images.mjs --revert`.
- **Correrlo después de cada importación, regeneración o limpieza de fondos.** `prebuild` corre `--verify` y el build falla si alguna prenda activa no tiene sus variantes.
- Front: `src/fashion/GarmentImage.jsx` (`<picture>` con srcset AVIF/WebP, `sizes`, width/height explícitos, `loading="lazy"`, `decoding="async"`; `priority` → `fetchpriority="high"`).
- Producción: el probador manda a Gemini la variante WebP más grande cuando no hay PNG (`readGarmentSource` en `outfit-api.mjs`), y `GET /api/import/library/:file` cae a esa variante.

## Qué se excluye del deploy

- `.replitignore` (formato .dockerignore; lo generó Replit, pero su documentación no lo describe: **confirmar el tamaño de la imagen en el primer publish**): `.local`, `data/imported/`, `data/claude-inbox/`, `data/jobs/`, `data/garment-regeneration/`, `data/_backups/`, `fotos-ss26/`, `attached_assets/`.
- Respaldos movidos fuera de `artifacts/` a `.local/aether-archive/` (`batches/` con las fotos crudas de los lotes, `imported-originals/`, `_dedup-2026-10-01*`). Copia verificada en App Storage bajo `archivo/2026-11-06/` (3.103 archivos, 1.011 MB; `scripts/maintenance/archive-to-storage.mjs`). Las rutas salen de `scripts/private-paths.mjs` (`AETHER_PRIVATE_DATA` las redefine).
- Producción sólo necesita `data/library.json`, `data/site-config.json`, `public/` (incluye `public/garments`) y el build.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — api-server (puerto 8080; en el workspace reenvía `/api/*` a Vite).
- `pnpm --filter @workspace/aether run dev` — app (Vite, puerto 24696) con los plugins de backend.
- `pnpm run typecheck` / `pnpm run build`. El build de aether y de mockup-sandbox exigen `PORT` y `BASE_PATH` en el entorno.
- `pnpm --filter @workspace/aether run optimize-images` — variantes web de prendas (ver arriba).
- `pnpm --filter @workspace/db run push` — schema de Postgres (tablas `tryon_*` del probador en producción).
- Env: `DATABASE_URL`, `GEMINI_API_KEY` (también en el deployment: ahí la prueba virtual la genera el api-server), `ADMIN_KEY`.

## Arquitectura

- `artifacts/aether/` — app web (Vite + React). `src/landing/` páginas públicas; `src/fashion/` componentes compartidos (ficha, probador, admin, importador por lotes); `scripts/*.mjs` backend como plugins de Vite (import-job, batch-import, outfit/probador, garment-regeneration, ipx, admin-auth).
- En el deployment no corre Vite: se sirve el build estático + el api-server. Por eso `/api/tryon/*` está montado en las dos partes: `createTryonHandler({ root, env, store, resolveSession })`. En el workspace la persistencia es de archivos (`scripts/tryon-store-fs.mjs`, sin sesiones); en el deployment es Postgres (`api-server/src/tryon/pgStore.ts`) con sesión anónima por visitante (cookie httpOnly `fm_sid`, uuid v4, 30 días). El store de Postgres no sirve semilla: un visitante nuevo arranca sin avatar ni looks.
- `api-server/src/tryon/index.ts` decide el modo (`REPLIT_DEPLOYMENT`/`NODE_ENV`, o forzado con `TRYON_MODE=local|proxy`). En deployment sirve `/api/catalog`, `GET /api/import/wardrobe` y `GET /api/import/library/:file` de sólo lectura; el resto del admin responde 401 sin sesión y 503 con sesión (el catálogo se carga en el workspace y se publica commiteado).
- `data/library.json` lo escriben varios plugins: toda escritura pasa por `withLibraryLock` (`scripts/library-lock.mjs`). Activar/desactivar en bloque: `POST /api/import/wardrobe/active { ids, active }`.
- El dominio raíz enruta `/api/*` al api-server y el resto al front, en el workspace y en producción: todo lo que tiene que funcionar publicado vive bajo `/api/`. ipx (imágenes responsive de `public/`) en `/api/_ipx`.

## Catálogo e importación

- Lotes (`/admin` → "Importar por carpetas", ZIP descomprimido en el navegador): análisis con IA o pegado manual de JSON, revisión, detección de duplicados por lote y color, aprobación. Entran con la colección/temporada de `importDefaults`.
- CLI: `import-catalog` (App Storage `catalogo/`, flags `--modeled`, `--solo-recorte`, `--dir`, `--tag`, `--por-articulo`), `claude-import pull|apply` (sin API: Claude analiza las fotos), `regenerate-garments` (`--importadas`), `python3 scripts/clean-garment-images.py [ids…]` (rembg), `node scripts/dechroma-garment.mjs` (fondos croma pegados).
- Después de cualquiera de esos: `optimize-images`.
- Modelos del probador: ocho avatares IA ficticios fijos (`shared/model-presets.mjs`, `public/fashion/models/ai/`). El cliente no sube rostro; los endpoints históricos de modelo personalizado responden 410.
- Género: `gender` mujer/hombre/unisex; el probador filtra por el del perfil.

## Gotchas

- `removeChromaBackground()` mide distancia al croma exacto y falla con verdes apagados o croma equivocado: `node scripts/dechroma-garment.mjs --check` lista y rescata.
- `ipx` pide `sharp@^0.32.6`; está forzado a `^0.35.3` con el override `ipx>sharp` en `pnpm-workspace.yaml`. No quitarlo.
- `sharp` es dependencia explícita del api-server (esbuild lo externaliza).
- `scripts/free-port.mjs` corre antes de los dev servers porque Replit puede dejar procesos huérfanos con el puerto tomado.
- Cambios en `vite.config.ts` o `.env` reinician Vite solos; cambios en el api-server requieren reiniciar el workflow "API Server" (corre el bundle de `dist/`).
- El schema JSON para Gemini se sanea con `geminiSchema()` en `scripts/ai-provider.mjs`.
