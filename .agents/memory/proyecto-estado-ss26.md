---
name: proyecto-estado-ss26
description: Rediseño SS26 (nov 2026), ya en main — qué se hizo por fase y métricas.
metadata:
  type: project
---

Rediseño y estabilización hechos el 2026-11-06 en la rama **`ss26-rediseno`** (sale de `main` en `53043df`). **Mergeada a `main` (PR #1, `e977199`) y publicada.** El trabajo siguiente es la integración con Odoo (ver [[odoo-integracion]]).

Fases (un commit por fase, ver `reports/informe-final.md`):
0. Resguardo + métricas (`reports/metricas.md`).
1. 552 prendas importadas por lotes → `collection: "SS26"`, `season: "summer"`; temporada/promos/precios en `artifacts/aether/data/site-config.json`; se quitó el Winter Sale.
2. Clave del admin validada en el servidor (ver [[admin-key-secrets]]), `/admin` lazy, `showPrices: false`.
3. Prendas en AVIF/WebP (`public/garments`), respaldos a App Storage (ver [[respaldos-app-storage]]), `.replitignore`.
4. `StandaloneApp.jsx` partido en `src/landing/`, código muerto fuera (knip), 53 deps menos.
5. Landing editorial: fila de looks, perchero 3D, marquee, ficha de look, "Tu selección", footer wordmark.

Métricas: bundle principal 548 → 241 kB; prenda 857 KB PNG → 54 KB WebP / 24 KB AVIF (800w); Lighthouse mobile (simulado, mediana) Perf 95, LCP 2,4 s, CLS 0,008, A11y 100; con throttling devtools antes 65 / 4,7 s → después 91 / 2,7 s.

**Why:** el usuario pidió trabajo por fases con aceptación medible y un informe antes/después.
**How to apply:** después de cada publish: reiniciar el workflow "API Server" (ver [[reiniciar-workflows]]) y revisar el tamaño de la imagen del deploy (`.replitignore` sin confirmar). Pendientes en [[pendientes-usuario]].
