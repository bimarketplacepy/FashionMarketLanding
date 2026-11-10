---
name: odoo-integracion
description: La experiencia de moda se embebe en la categoría Moda de la tienda Odoo 19 del usuario (widget + módulo + sync); estado y reglas.
metadata:
  type: project
---

El 2026-11-10 el usuario pidió llevar todas las funcionalidades a su ecommerce **Odoo 19**, sólo para prendas: al entrar en la categoría padre de moda tiene que aparecer la experiencia con las prendas que tenga esa categoría. Implementado en `ss26-rediseno` (guía: `reports/odoo19-moda-end-to-end.md`):

- Widget `src/embed/` (Shadow DOM) servido en `/api/embed/*`; módulo `odoo/website_fashion_market/` (reemplaza la grilla en categorías con `fm_experience`, proxy `/fm/`, botón "Probalo en un modelo"); `scripts/odoo-sync.mjs` (JSON-2, vínculo por Referencia interna = id de prenda, precio 0 + "Evitar venta precio cero").
- Probado con un Odoo simulado y Chromium; **todavía no en un Odoo 19 real**.

**Why:** Replit sigue siendo el motor (IA, looks, admin) y Odoo la vidriera; reescribir en QWeb duplicaría todo.
**How to apply:** código nuevo del front que haga fetch a `/api/...` o pinte imágenes del motor debe usar `engineFetch`/`engineUrl` de `src/embed/base.js`. Overlays nuevos: z-index por encima de 1030 en `src/embed/embed.css`. Pendiente del usuario: hosting (Odoo.sh/on-prem vs Online), dominio del motor, si ya hay productos cargados. Ver [[pendientes-usuario]] y [[reiniciar-workflows]].
