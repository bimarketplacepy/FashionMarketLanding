---
name: reiniciar-workflows
description: Cambios en el api-server o en Secrets no se ven en el preview hasta reiniciar los workflows; síntoma típico "no aparecen las prendas".
metadata:
  type: project
---

En el workspace, `/api/*` del dominio de preview va al api-server (8080), que corre el bundle de `artifacts/api-server/dist/` y reenvía a Vite sólo los prefijos de `AETHER_API_PREFIXES` (`src/middlewares/aetherProxy.ts`). Si se agrega una ruta (ej. `/api/landing`, `/api/catalog`) o se cambia código del api-server, el proceso viejo responde 404 hasta reconstruir y reiniciar.

**Why:** el 2026-11-06 la landing quedó sin prendas en el preview porque el api-server seguía con el código previo; Vite directo (24696) respondía bien.
**How to apply:** después de tocar el api-server: `pnpm --filter @workspace/api-server run build` y reiniciar el workflow "API Server" (o la app entera). Si se levanta a mano, necesita `PORT=8080`. Al matar procesos desde un shell, no filtrar por texto del comando (el propio shell coincide y se mata): usar PID o `/proc/<pid>/exe`. Ver también [[admin-key-secrets]].
