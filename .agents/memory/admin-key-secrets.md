---
name: admin-key-secrets
description: Cómo se valida la clave de /admin (ADMIN_KEY en Secrets) y por qué un Secret nuevo "no funciona" hasta reiniciar.
metadata:
  type: project
---

`/admin` valida en el servidor con `ADMIN_KEY` (`artifacts/aether/scripts/admin-auth.mjs`): `POST /api/admin/session` → cookie httpOnly firmada `fm_admin` (8 h). Sin prefijo `VITE_` (nunca va al bundle). Scripts CLI usan el header `X-Admin-Key` (`scripts/cli-admin.mjs`). Freno: 10 intentos fallidos por IP cada 15 min (se resetea al reiniciar Vite).

Prioridad: **Secrets (`process.env.ADMIN_KEY`) primero**, `artifacts/aether/.env` sólo de respaldo (tiene el valor del viejo `VITE_ADMIN_KEY`). Hasta el commit `a6edd7f` el `.env` ganaba y el Secret nuevo no servía.

**Why:** el 2026-11-06 el usuario cargó `ADMIN_KEY` en Secrets y no podía entrar: los procesos corriendo no tenían el Secret (Replit sólo lo inyecta a procesos nuevos) y además el `.env` tenía prioridad.
**How to apply:** si el login falla tras cambiar el Secret, primero reiniciar la app (Stop → Run). La contraseña es el *valor* del Secret, no su nombre. Diagnóstico sin exponer la clave: comparar largo/hash de `ADMIN_KEY` en `/proc/<pid>/environ` de Vite y del api-server. Relacionado: [[reiniciar-workflows]].
