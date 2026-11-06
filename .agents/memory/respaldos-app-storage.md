---
name: respaldos-app-storage
description: Dónde quedaron los respaldos (fotos crudas de lotes, originales, deduplicación) y qué queda local.
metadata:
  type: reference
---

App Storage (bucket por defecto del repl), prefijo **`archivo/2026-11-06/`**: 3.103 archivos, 1.011 MB, verificado dos veces contra la copia local. Contiene `data/batches/` (fotos crudas de 17 lotes), `data/imported-originals/`, `data/_dedup-2026-10-01/` y `_dedup-2026-10-01-pass2/`. Subida/verificación: `artifacts/aether/scripts/maintenance/archive-to-storage.mjs`.

Local (`.local/aether-archive/`, fuera del deploy, rutas en `scripts/private-paths.mjs`): se borró todo con permiso del usuario salvo 5 lotes con 37 prendas analizadas sin importar (ROSIO CLOTHING 2, DINAMIC FASHION 5, ACTIVE BASIC 28, BLUPEPPER SS26 1 con error, AEMI+CO 1 con error). `imported-originals/` local quedó vacío.

**How to apply:** para recuperar algo, bajarlo de App Storage con `@replit/object-storage` (`client.downloadToFilename`). Cuando el usuario termine esos 5 lotes en `/admin`, se pueden borrar (ver [[pendientes-usuario]]).
