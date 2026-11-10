---
name: odoo-integracion
description: La experiencia de moda se embebe en la categoría Moda de la tienda Odoo 19 (widget + módulo + sync); arquitectura, estado de Staging y reglas.
metadata:
  type: project
---

El 2026-11-10 el usuario pidió llevar todas las funcionalidades a su ecommerce **Odoo 19**, sólo para prendas: al entrar en la categoría padre de moda aparece la experiencia con las prendas de esa categoría. Guía completa: `reports/odoo19-moda-end-to-end.md` (pasos 1–8, tabla de verificación del Paso 7, modo directo, riesgos).

**Arquitectura**
- Replit = motor (IA, looks, admin, API). Odoo = vidriera. Widget `artifacts/aether/src/embed/` (`<fm-moda>`, `<fm-probar>`, Shadow DOM), build `vite.embed.config.ts` → `dist/public/embed/`, servido por el api-server en `/api/embed/*` (`src/embed.ts`).
- `scope.jsx`: `useScope()` → `{allowed, productUrls, categoryName, embedded}`. `embedded` = dentro de Odoo: se ocultan EditorialFooter, SiteFooter, redes del marquee y los botones flotantes (SocialFabs).
- Módulo `odoo/website_fashion_market/` (19.0.1.0.0): campo `fm_experience` en la categoría, reemplaza la grilla, proxy `/fm/` (sólo cookie `fm_sid`), botón "Probalo en un modelo" en la ficha.
- `scripts/odoo-sync.mjs` (JSON-2, Referencia interna = id de prenda; dry-run por defecto, `--aplicar` con backup). Desde `4ea6b80`: **no publica productos sin precio** y usa las categorías existentes de la tienda.
- Límite del probador: `src/tryon/limits.ts`, 15/sesión y 60/IP por día (`TRYON_MAX_PER_SESSION_DAY`, `TRYON_MAX_PER_IP_DAY`).
- Dentro de Odoo el perchero se arma con prendas publicadas, sólo parte superior (`UPPER_PARTS` en `looks.js`, commit `0b860ba`); `fm-probar` sin fondo crema ni alto de pantalla (`374aa46`).

**Estado al 2026-11-10 (cierre de sesión)**
- Rama de trabajo/deploy: **`staging-fashion-market`** (= main + `odoo-sync-precios-categorias` + `botones-flotantes`, merge `a4ff7d5`, más commits del agente de Odoo). El usuario ya publicó desde ella (commits "Published your App").
- Local está **5 commits adelante de origin** (merges + publishes de Replit); hacer `git push` si el usuario lo pide.
- **PR `staging-fashion-market` → main: NO mergear** hasta validar Staging. `gh` no tiene sesión; el PR había que abrirlo a mano en https://github.com/bimarketplacepy/FashionMarketLanding/compare/main...staging-fashion-market?expand=1 (verificar si ya existe). Si se publica desde `main` sin este PR vuelven el footer dentro de Odoo y el sync viejo que publica a precio 0.
- Staging de Odoo: categoría "Moda Mujeres" con la experiencia. Verificar `/api/embed/fm-embed.js` y `/api/landing` → 200, y Ctrl+F5 sin footer ni botones flotantes de Fashion Market.

**Actualización 2026-11-10 (tarde)** — commits `73311fb`…`787615f`, detalle en la sección 9 bis de la guía:
- Dentro de Odoo la colección es la **grilla nativa de Odoo** (3 por fila, precio, carrito, favoritos): el widget nunca muestra su propia colección ahí. Módulo 19.0.1.1.0: grilla siempre; `<fm-moda>` arriba sólo en la raíz (pág. 1 sin filtros); `<fm-tienda>` en el resto suma "Probalo en un modelo" a las tarjetas; `?fm_probar=<id>` precarga la prenda.
- Prendas del motor en Odoo = Referencia interna `import-<uuid>`; los productos propios de la tienda no tienen probador.
- Colores/fuentes: el widget toma `--mkt-*` del tema de la tienda (sigue al tema de Navidad).
- **El módulo instalado en Staging NO es el de este repo** (lo mantiene el agente de Odoo en el repo de Odoo.sh): hay que fusionar 19.0.1.1.0 con sus cambios.
- Staging: `https://marketplace-staging-261109-41612773.dev.odoo.com`, categoría Moda mujeres = id 161. Se puede probar el widget local sobre el Staging real interceptando `/api/embed/*` con Chromium (CDP `Fetch.enable`).

**Why:** reescribir en QWeb duplicaría todo; el motor queda en un solo lugar.
**How to apply:** código del front que haga fetch a `/api/...` o pinte imágenes del motor usa `engineFetch`/`engineUrl` (`src/embed/base.js`). Overlays nuevos: z-index > 1030 en `src/embed/embed.css`. Algo que sea de "la web propia" (footer, redes, contacto) se oculta con `embedded`. Tras publicar: reiniciar "API Server" (ver [[reiniciar-workflows]]). Pendientes en [[pendientes-usuario]].
