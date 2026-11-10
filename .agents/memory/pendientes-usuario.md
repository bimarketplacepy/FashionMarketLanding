---
name: pendientes-usuario
description: Decisiones y tareas abiertas con el usuario (actualizado 2026-11-10, integración Odoo en Staging).
metadata:
  type: project
---

**Próximo paso (donde quedamos el 2026-11-10)**
1. Validar Staging de Odoo ("Moda Mujeres"): `/api/embed/fm-embed.js` y `/api/landing` → 200; sin footer ni botones flotantes de Fashion Market; tabla del Paso 7 de `reports/odoo19-moda-end-to-end.md`.
2. Abrir/confirmar el PR `staging-fashion-market` → main (el cuerpo: los 4 commits listados en [[odoo-integracion]] + "no mergear hasta validar Staging"; `gh` sin login: el usuario puede correr `! gh auth login`). **Mergear sólo cuando Staging esté validado.**
3. `git push` de los 5 commits locales de `staging-fashion-market` si el usuario lo pide.

**Del lado de Odoo (usuario)**
- Cargar precios y publicar prendas: las 619 quedan ocultas sin precio (el sync ya no publica a precio 0).
- Medir workers de Odoo durante un probador (20–60 s por generación, pasa por el proxy `/fm/`).
- Pasar a producción después de Staging. Ver [[odoo-integracion]].

**Otros abiertos**
- **WhatsApp provisorio** `595981203891` en `site-config.json` → `contact` (también lo usan los botones flotantes). Falta el definitivo.
- **Clave vieja en `artifacts/aether/.env`** (`ADMIN_KEY`): ¿borrarla para que sólo valga Secrets? Sin respuesta. Ver [[admin-key-secrets]].
- **5 lotes con 37 prendas sin importar** en `.local/aether-archive/batches/` (LOVE TREE vacía: borrable con permiso). Ver [[respaldos-app-storage]].
- **Límites del probador** (15/sesión, 60/IP por día): confirmar valores.

**Resuelto**: rediseño SS26 mergeado a main (PR #1); reels → looks sobre avatares IA ([[looks-en-modelo]]); aprobados sin intro, selector Conjuntos/Vestidos/Playa, sin Framer Motion/Lenis, GTM diferido, `.config/` fuera del deploy.
