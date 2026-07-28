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

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
