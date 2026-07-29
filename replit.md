# Fashion Market — By Marketplace

Landing del sector Moda de un retailer: intro cinematográfica (ex-AETHER) + landing editorial + vestidor virtual con IA (sugerencia de looks, probador virtual e importación de prendas por foto).

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
  - `src/aether/Intro.tsx` — intro cinematográfica "FASHION MARKET / By Marketplace" (GSAP). El resto de `src/aether/` (escenas Three.js, Outro, audio) quedó sin usar tras el pivot.
  - `src/fashion/` — landing retail + vestidor virtual, portado del proyecto "Landing Fashion" (`wardrobe-main` en App Storage). `FashionMarket.jsx` es el componente raíz (vista `home` = landing, vista `wardrobe` = probador virtual).
  - `scripts/*.mjs` — backend como plugins de Vite: importación de prendas con IA (`import-job-api`), generación de pruebas virtuales (`outfit-api`), imágenes responsive vía ipx (`responsive-image-api`).
  - `data/` — catálogo local (library.json, outfits.json, foto de referencia). No commitear contenido sensible.
  - `public/fashion/` — imágenes placeholder generadas; reemplazar por fotos reales del retailer.
  - `.env` (en `artifacts/aether/`, gitignoreado) — `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, modelos de visión/imagen.

## Architecture decisions

- El backend del vestidor corre como plugins del dev server de Vite (heredado del proyecto original), no en `artifacts/api-server`. Si se despliega a producción con `vite preview` los plugins de import/outfit no aplican en build estático — migrar a api-server llegado el caso.
- Escenas Three.js de AETHER se conservan en el repo pero no se montan; la intro es la única pieza que sobrevivió del sitio original.
- `allowJs` habilitado en `artifacts/aether/tsconfig.json` porque el código portado es JSX sin tipos.

## Product

- Landing minimalista de temporada (paleta crema/beige, acento bordó) + probador virtual.
- El retailer carga su catálogo (los clientes NO suben prendas): vía UI ("Administrar catálogo") o masivamente con `pnpm --filter @workspace/aether run import-catalog`, que lee imágenes de App Storage bajo `catalogo/` (subcarpetas libres), las procesa con IA y registra lo hecho en `data/catalog-manifest.json` (re-ejecutable; solo procesa lo nuevo). Flags: `--modeled` (foto modelada extra), `--solo-recorte` (sin IA de imagen), `--dir <ruta>` (carpeta local).
- Importación SIN API (flujo Claude Code, preferido por el usuario para FW2026): `pnpm --filter @workspace/aether run claude-import pull` baja las fotos pendientes de App Storage (prefijo por defecto `FOTOS SELECCIONADAS FW2026/`, deduplicadas por artículo) a `data/claude-inbox/images/`; Claude analiza cada imagen con visión propia y escribe `data/claude-inbox/analysis/<key>.json` (mismo esquema que la detección de Gemini, ver cabecera de `scripts/claude-import.mjs`); `claude-import apply` recorta con sharp (misma lógica que `import-job-api.mjs`), agrega a `data/library.json` y marca `catalog-manifest.json` con `via: "claude-code"`. No usa la app ni requiere API key.
- Antes de ver combinaciones, el usuario elige modelo: predeterminado (complexión + tono de piel) o su propia foto (`/api/tryon/model-profile`).

## Gotchas

- La GEMINI_API_KEY actual es de tier gratuito: el análisis/detección de prendas funciona, pero los modelos de IMAGEN (`gemini-3.1-flash-image`) tienen cuota 0 → la generación de pruebas virtuales y recortes IA falla hasta habilitar facturación en Google AI. El import cae automáticamente al recorte simple (`use-crop`).
- El schema JSON para Gemini se sanea con `geminiSchema()` en `scripts/ai-provider.mjs` (sin `additionalProperties` ni type-arrays).
- `scripts/free-port.mjs` corre antes de `vite dev` porque Replit puede dejar procesos huérfanos reteniendo el puerto.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
