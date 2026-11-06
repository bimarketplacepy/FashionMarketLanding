---
name: imagenes-prendas
description: Pipeline de imágenes de prendas (PNG maestro → AVIF/WebP) y la regla de correr optimize-images tras cada importación.
metadata:
  type: project
---

El PNG maestro vive en `artifacts/aether/data/imported/` (lo usan import, regeneración y limpieza; excluido del deploy). La tienda usa `public/garments/<id>-garment.<hash>-<400|800|1024>.{avif,webp}` vía `imageSet` en `library.json` y el componente `GarmentImage.jsx`.

**Why:** los PNG pesaban ~857 KB; las variantes bajaron a ~54 KB WebP / ~24 KB AVIF a 800w.
**How to apply:** después de importar, regenerar o limpiar prendas: `pnpm --filter @workspace/aether run optimize-images`. El `prebuild` corre `--verify` y el build falla si una prenda activa no tiene variantes. `GarmentImage` usa `<picture class="garment-picture">` con `display: contents`; sus `<source>` están ocultos con CSS porque si no ocupan celdas de grid/flex (bug de "También te puede gustar" en mobile).
