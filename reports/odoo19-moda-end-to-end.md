# Fashion Market dentro de la tienda Odoo 19 — categoría Moda, end to end

> Reemplaza a `reports/plan-integracion-odoo.md` (borrador anterior, con decisiones abiertas que acá ya quedan resueltas).
> Rama: `ss26-rediseno`. Fecha: 2026-11-10.

## 1. Qué ve el cliente (módulo 19.0.1.1.0, 2026-11-10)

| Dónde entra | Qué ve |
|---|---|
| `/shop/category/moda-<id>` (la categoría marcada con la experiencia) | **Arriba**, la experiencia de Fashion Market con las prendas publicadas ahí: looks sobre avatares IA, perchero, fichas, "Tu selección" y el acceso al probador. **Debajo**, la grilla de Odoo tal cual: 3 por fila (según el tema), precio, carrito, favoritos, comparar, filtros y barra lateral. "Colección" y "Ver toda la colección" bajan hasta la grilla. |
| Una subcategoría (Bolsos, Ropa deportiva, etc.), una búsqueda, filtros, orden o la página 2 | Sólo la grilla de Odoo. |
| Tarjeta de una prenda del probador (Referencia interna `import-<uuid>`) en cualquier grilla de esas categorías | Además del precio, carrito y favoritos, un enlace **"Probalo en un modelo"** que abre el probador con la prenda ya cargada (`?fm_probar=<id>`). |
| La ficha de una prenda del probador | Todo lo de Odoo + botón **"Probalo en un modelo"**. Los productos propios de la tienda (otra referencia) ya no lo muestran. |

Colores y tipografías: dentro de Odoo el widget usa las variables del tema de la tienda (`--mkt-cream`, `--mkt-ink`, `--mkt-terracotta`, `--mkt-font-display`, `--mkt-font-ui`), así que sigue al tema activo (hoy el de Navidad: marfil `#FBF7EF`, Instrument Serif + Arimo).

Header, footer, menú, carrito, SEO y URLs siguen siendo de Odoo. La home de Odoo no se toca.

## 2. Arquitectura

```
 Navegador ─────────────▶ Odoo 19 (tu dominio)
   │                       ├─ /shop/category/moda…  → módulo website_fashion_market
   │                       │     renderiza <fm-moda> + lista de productos (SEO)
   │                       ├─ /shop/<producto>      → + <fm-probar>
   │                       └─ /fm/api/{landing,catalog,tryon/*}  → proxy al motor
   │                              (la cookie del probador fm_sid queda en TU dominio)
   │
   └── imágenes, script y fuentes, directo ──▶ Motor (deployment de Replit, p. ej. probador.<dominio>)
                                                ├─ /api/embed/*      widget (fm-embed.js, CSS, fuentes) con CORS
                                                ├─ /api/landing, /api/catalog, /api/tryon/*  (Gemini, Postgres)
                                                └─ /garments, /looks, /fashion/models (imágenes)

 Workspace del motor ── scripts/odoo-sync.mjs (JSON-2 de Odoo 19) ──▶ product.template / categorías web
```

Decisiones:

- **Replit sigue siendo el motor** (IA, prendas, looks, admin); **Odoo es la vidriera** (productos, categorías, URLs, SEO, carrito si algún día hay precios). No se reescribe la experiencia en QWeb: se reutiliza el mismo código React compilado como widget.
- **Shadow DOM**: el CSS de Odoo/Bootstrap no rompe el diseño y el nuestro no se filtra a la tienda (verificado con una regla `!important` hostil en la página).
- **Proxy `/fm/` en Odoo** para la API: la sesión anónima del probador es cookie de primera parte (Safari/iOS no la bloquea) y no hace falta CORS con credenciales. Las imágenes van **directo** al motor para no ocupar un worker de Odoo por imagen.
- **Vínculo prenda ↔ producto**: Referencia interna (`default_code`) = id de la prenda. Sin Studio ni campos extra en el producto.
- **Precios**: los productos se crean con precio 0 y se activa "Evitar la venta de productos con precio cero" → Odoo muestra "Contactanos" en lugar de precio y carrito (coherente con `showPrices: false`).

## 3. Qué quedó implementado (en esta rama)

| Pieza | Archivo | Qué hace |
|---|---|---|
| Prefijo del motor | `artifacts/aether/src/embed/base.js` | `engineFetch()` / `engineUrl()`: la misma app funciona en su dominio (sin prefijo) o embebida (API por `/fm`, imágenes por el dominio del motor). |
| Alcance por categoría | `artifacts/aether/src/embed/scope.jsx` | Filtra colección, perchero y looks a las prendas publicadas en la categoría de Odoo (un look entra sólo si **todas** sus piezas están). Lleva las URLs de los productos para "Ver en la tienda". |
| Widget | `artifacts/aether/src/embed/fm-embed.jsx`, `embed.css` | Custom elements `<fm-moda>` (experiencia completa, rutas internas por hash `#/catalogo`, `#/probador`, `#/probador/builder`) y `<fm-probar>` (botón de la ficha). Overlays por encima del header de Odoo, headers sticky debajo de él (`--fm-top`). |
| Build | `artifacts/aether/vite.embed.config.ts` | `dist/public/embed/`: `fm-embed.js` (79,6 kB gzip), colección y probador en chunks aparte, CSS reescrito para `:host`, `@font-face` en `fm-fonts.css` (no funcionan dentro de un shadow root). `pnpm run build` ya lo incluye; suelto: `build:embed`. |
| Servir el widget | `artifacts/api-server/src/embed.ts` | `GET /api/embed/*` con CORS (`*`), caché corto para la entrada y `immutable` para chunks/fuentes. Modo directo opcional con `FM_EMBED_ORIGINS`. |
| Freno de costo | `artifacts/api-server/src/tryon/limits.ts` | `/api/tryon/generate` (Gemini) **no tenía límite**. Ahora: 15 por visitante y 60 por IP por día (`TRYON_MAX_PER_SESSION_DAY`, `TRYON_MAX_PER_IP_DAY`; 0 = sin límite). Responde 429 con mensaje en español. |
| Sync de catálogo | `artifacts/aether/scripts/odoo-sync.mjs` | Prendas → `product.template` con la API JSON-2 de Odoo 19. Dry-run por defecto, backup, idempotente. |
| Módulo Odoo 19 | `odoo/website_fashion_market/` | Campo "Experiencia Fashion Market" en la categoría web, reemplazo de la grilla en esas categorías, botón en la ficha, proxy `/fm/`. |

Cambios mínimos en componentes existentes (sin cambio visible en la app propia): `GarmentImage`, `OptimizedImage`, `virtual-tryon`, `SuggestionCarousel`, `catalog-context`, `HomePage`, `LookSheet`, `ProductSheet` usan los helpers de `base.js`/`scope.jsx`.

## 4. Requisitos

1. **Odoo 19 en Odoo.sh u on-premise** para instalar el módulo. Con **Odoo Online** (SaaS) no se pueden instalar módulos propios: ver §7 (modo directo).
2. Motor publicado con un dominio propio, idealmente subdominio de la tienda: `probador.<tu-dominio>` (Replit → Deployments → Settings → Link a domain).
3. Un usuario técnico en Odoo con permisos de Ventas (administrador) y Sitio web (editor), con **API key** (Preferencias → Seguridad de la cuenta → Nueva API key).

## 5. Paso a paso

### Paso 1 — Publicar el motor

```bash
git checkout main && git merge ss26-rediseno
PORT=24696 BASE_PATH=/ pnpm --filter @workspace/aether run build    # incluye el widget
pnpm --filter @workspace/api-server run build
```

- Publicar en Replit y **reiniciar el workflow "API Server"** (sin eso `/api/embed/*` da 404: ver `.agents/memory/reiniciar-workflows.md`).
- Vincular `probador.<tu-dominio>`.
- **Acepta:** `https://probador.<dominio>/api/embed/fm-embed.js` → 200 con `Access-Control-Allow-Origin: *`; `/api/landing` → 200.

### Paso 2 — Credenciales de Odoo en el motor

Secrets del workspace de Replit (no en el deployment: el sync corre en el workspace):

```
ODOO_URL=https://www.<tu-dominio>        # o https://<base>.odoo.com
ODOO_DB=<nombre de la base>              # obligatorio si el servidor tiene varias
ODOO_API_KEY=<API key del usuario técnico>
```

Reiniciar la app después de cargar Secrets (Replit los inyecta sólo a procesos nuevos).

### Paso 3 — Instalar el módulo en Odoo

- **Odoo.sh**: copiar `odoo/website_fashion_market/` al repositorio del proyecto (raíz o carpeta de addons), push a una rama **staging** primero.
- **On-premise**: copiar la carpeta a un directorio del `addons_path` y reiniciar Odoo.
- Aplicaciones → Actualizar lista de aplicaciones → buscar "Fashion Market" → Instalar.
- Actualizaciones futuras: `odoo -u website_fashion_market` (o el botón Actualizar).

### Paso 4 — Parámetros del sistema

Ajustes → activar modo desarrollador → Técnico → Parámetros del sistema:

| Clave | Valor |
|---|---|
| `website_fashion_market.engine_url` | `https://probador.<tu-dominio>` (sin barra final). Vacío = experiencia apagada, se ve la grilla normal. |
| `website_fashion_market.use_proxy` | `1` (recomendado). `0` = modo directo (§7). |
| `website_fashion_market.proxy_timeout` | `150` (segundos; una prueba virtual tarda 20–60 s). |

On-premise: `limit_time_real` del servidor tiene que ser mayor que `proxy_timeout` (por defecto es 120: subirlo a 180 o bajar el timeout a 110).

### Paso 5 — Sincronizar el catálogo

Primero contra una **base de staging/duplicada**:

```bash
cd artifacts/aether
node scripts/odoo-sync.mjs                         # dry-run: categorías y productos a crear/actualizar/despublicar
node scripts/odoo-sync.mjs --aplicar --limite 5    # prueba con 5 prendas; deja backup en data/_backups/odoo-sync-*.json
node scripts/odoo-sync.mjs --aplicar               # el resto
node scripts/odoo-sync.mjs                         # segunda corrida: tiene que dar 0 cambios
```

Qué escribe: categoría raíz **Moda** con la experiencia activada y 6 hijas (Prendas superiores, Vestidos y enterizos, Abrigos, Prendas inferiores, Accesorios, Calzado — los mismos nombres que la colección); un producto por prenda activa de la temporada (nombre, Referencia interna, descripción, imagen 1024 px, categoría, publicado, precio 0). Despublica —nunca borra— los productos de prendas que el motor desactivó. No toca productos que no tengan una Referencia interna de `library.json`.

- Si la categoría padre ya existe con otro nombre: `--categoria-raiz "Nombre exacto"`.
- Si **ya tenés productos cargados a mano** para estas prendas: completá su Referencia interna con el id de la prenda antes de correr el sync, o se crearían duplicados (el dry-run muestra la lista de "a crear" para revisarla).
- Re-subir imágenes tras regenerar prendas: `--aplicar --imagenes`.

### Paso 6 — Ajustes de la tienda

1. Sitio web → Configuración → Ajustes → **"Evitar la venta de productos con precio cero"** → activado (la ficha muestra "Contactanos" en vez de precio y carrito).
2. Sitio web → Menú → ítem **"Moda"** → `/shop/category/moda-<id>`.
3. Si la categoría Moda la creaste vos: abrila (Sitio web → Configuración → Categorías) y marcá **"Experiencia Fashion Market"**. Las subcategorías heredan.
4. Opcional: en el editor de la página de Moda hay dos zonas libres (arriba y abajo de la experiencia) para banners o texto de Odoo.

### Paso 7 — Verificación (criterios de aceptación)

| Prueba | Esperado |
|---|---|
| `/shop/category/moda-<id>` en Chrome escritorio y Safari iOS | Experiencia completa con looks en modelo; ninguna prenda que no esté publicada en Odoo. |
| Una subcategoría | Abre en Colección con sólo sus prendas. |
| Ficha de look → "Ver en la tienda" | Abre la ficha correcta de Odoo (revisar 5 al azar). |
| Ficha de producto de moda → "Probalo en un modelo" | Abre el probador con la prenda cargada en "Crear un look". |
| Generar una prueba virtual, recargar la página | El look generado sigue ahí (cookie `fm_sid` con `Path=/fm` en tu dominio). |
| Buscar dentro de Moda / filtrar por atributo | Grilla estándar de Odoo. |
| "Tu selección" → WhatsApp | Abre WhatsApp con las piezas (número de `site-config.json`). |
| Precio | No aparece en ningún lugar; la ficha muestra "Contactanos". |
| Lighthouse mobile en Moda | LCP < 2,5 s (simulado), CLS < 0,1. |
| Página sin JavaScript | Se ve la lista de productos con enlaces (respaldo para SEO). |

### Paso 8 — Operación diaria

Después de importar o regenerar prendas en `/admin` del motor:

```bash
pnpm --filter @workspace/aether run optimize-images
node scripts/generate-look-models.mjs --estado      # looks desactualizados → regenerar, revisar, aprobar
node scripts/odoo-sync.mjs && node scripts/odoo-sync.mjs --aplicar
```

y publicar el motor. Desactivar una colección en `/admin` + sync = esos productos se despublican en Odoo.

## 6. Equivalencia de funcionalidades

| App propia | En Odoo |
|---|---|
| Landing `/` (HeroLooks, Marquee, perchero, CTA, promos de temporada) | Categoría Moda |
| `/catalogo` (filtros por tipo, ficha `ProductSheet`, "Combina con") | `#/catalogo` dentro de Moda / subcategorías |
| `/probador` (8 avatares IA, looks sugeridos, crear un look, mis looks) | `#/probador`, `#/probador/builder` |
| Ficha de look con foto IA y puntos numerados | Igual + "Ver en la tienda" |
| "Tu selección" (talle, cantidad, descargar, WhatsApp) | Igual (se guarda en el navegador, mismo dominio que la tienda) |
| "Agregar a mi outfit" desde la ficha | Igual + "Probalo en un modelo" desde la ficha de Odoo |
| `/admin` e importación | Siguen sólo en el motor |

## 7. Modo directo (Odoo Online, sin módulo)

Sin módulo no hay proxy ni reemplazo automático de la grilla:

1. Motor: Secret `FM_EMBED_ORIGINS=https://www.<tu-dominio>` en el deployment → CORS con credenciales para ese origen y cookie `SameSite=None; Secure`.
2. Odoo: abrir la categoría Moda en el editor del sitio, arrastrar el bloque **"Código embebido"** en la zona superior y pegar:

```html
<fm-moda data-base="https://probador.<dominio>" data-assets="https://probador.<dominio>"></fm-moda>
<script type="module" src="https://probador.<dominio>/api/embed/fm-embed.js"></script>
```

Limitaciones: muestra todas las prendas activas (sin filtro por categoría ni "Ver en la tienda"), la grilla de Odoo queda debajo, y la cookie del probador es de terceros si el motor no está en un subdominio de la tienda (Safari puede perder los looks generados). Por eso el modo recomendado es el módulo.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Una prueba virtual ocupa un worker de Odoo 20–60 s (proxy) | Sólo `/api/tryon/*` y dos JSON pasan por el proxy; imágenes, script y fuentes van directo. Subir `limit_time_real` y, si hay mucho tráfico, workers. |
| Costo de Gemini con el tráfico de la tienda | Límite diario nuevo por visitante/IP (en memoria por instancia: es un freno, no una cuota exacta). Revisar el gasto la primera semana. |
| Duplicados si ya hay productos cargados | El sync sólo empareja por Referencia interna: completarla antes; el dry-run lista lo que crearía. |
| Cambios del tema de Odoo (header distinto) | El widget mide `header#top`; si el tema usa otro header, overlays igual quedan por encima (z-index 2050–2120). |
| Actualización de Odoo 19.x cambia `website_sale.product` | El único xpath es `#o_wsale_product_details_content`; si desaparece, la instalación avisa y sólo falta el botón de la ficha. |
| Productos editados a mano en Odoo | El sync sólo sobrescribe nombre, descripción, publicación y agrega la categoría. Precio, stock, SEO y el resto quedan para el equipo. |

## 9. Pruebas hechas (2026-11-10)

- **Build**: app propia 249,9 kB (sin cambios de comportamiento); widget 253 kB / 79,6 kB gzip + chunks de colección (7,2 kB) y probador (15,2 kB).
- **Sync** contra un servidor JSON-2 simulado: dry-run 7 categorías + 5 productos → `--aplicar` con backup → segunda corrida 0 cambios; corrida completa = 619 prendas (las activas SS26). Forma de la API verificada contra el código de Odoo 19 (`addons/rpc/controllers/json2.py`).
- **Navegador (Chromium)**: página que imita la salida del módulo con Bootstrap y header sticky, proxy `/fm` → motor. Verificado: looks en modelo, ficha de look con "Ver en la tienda" apuntando a cada producto, subcategoría filtrada, mobile 412 px, probador, botón de la ficha → probador con la prenda precargada, CSS hostil de la página sin efecto. Corregido en el camino: la ficha quedaba debajo del header de Odoo y el header del probador era `fixed`.
- **API**: `/api/embed/*` sirve con CORS y rechaza `../`; preflight CORS sólo responde con credenciales al origen configurado.
- **No probado todavía en un Odoo 19 real**: la instalación del módulo, el reemplazo de la grilla y el proxy dentro de Odoo. Es el primer paso de la verificación (Paso 7), en staging.

## 9 bis. Actualización 2026-11-10 — grilla de la tienda y armonía visual

Análisis sobre el Staging real (`marketplace-staging-261109-41612773.dev.odoo.com`):

- **La categoría mostraba la colección propia (4 por fila, sin precio ni carrito)** y de las 52 prendas publicadas en Moda mujeres sólo se veían las 19 del motor: las 33 propias de la tienda (bras deportivos, leggings, jackets, bolsos) no aparecían.
- **Las subcategorías mostraban las 52 prendas de la raíz** (Bolsos tiene 2). El módulo instalado en Staging no es el de este repo.
- **"Probalo en un modelo" aparecía en productos sin prenda en el motor** (ej. Jacket deportivo): abría el probador vacío.
- **6 prendas tenían un recuadro blanco** dentro del recorte (Top triángulo Perla, Top Positano, Culotte tiro bajo Acuarela, Culotte tiro alto Mosaico, Top Formentera, Top triángulo Saint-Tropez; las 2 primeras publicadas en Odoo).

Hecho:

| Parte | Cambio | Se activa con |
|---|---|---|
| Widget (motor) | "Colección" y la ruta `#/catalogo` → grilla de Odoo; tokens y fuentes del tema de la tienda; `fm-probar` sólo para `import-<uuid>`; `?fm_probar=<id>`; `<fm-tienda>` y enlaces en tarjetas | **Publish** en Replit + reiniciar "API Server". Con el módulo viejo ya mejora: las subcategorías y "Ver toda la colección" abren la grilla de Odoo. |
| Módulo `website_fashion_market` 19.0.1.1.0 | La grilla de Odoo siempre; arriba `<fm-moda>` sólo en la raíz (página 1, sin filtros); `<fm-tienda>` en el resto; scope sólo con `import-%`; botón de ficha sólo para prendas del motor; se elimina la plantilla `fashion_category` | Copiar el módulo al repo de Odoo.sh **fusionando con lo que cambió el agente de Odoo** y actualizarlo en Staging. |
| Imágenes | Recuadro blanco quitado de las 6 (relleno desde el borde + huecos blancos planos). Originales en `.local/aether-archive/fondos-recuadro-2026-11-10/`. 0 de 619 activas con recuadro. | Publish. En Odoo, reenviar la imagen de las 2 publicadas: `node scripts/odoo-sync.mjs --imagenes --aplicar` (dry-run primero). |

Datos para revisar en Odoo (no se tocaron):

- Precios de prueba absurdos en prendas del motor: Top triángulo Capri 10.030.000.000.000.016 ₲, Top triángulo Perla 5.676.741.464 ₲, Top triángulo Nácar 4.654.645.464 ₲, Culotte Capri 464.545.640 ₲, Top Positano 79.415.645 ₲ y varias en 100.000.000 ₲. El filtro de rango de precio queda inutilizable por eso.
- En la raíz Moda mujeres hay vinchas navideñas, llaveros y accesorios de celular mezclados con la ropa.
- La foto de Top Formentera tiene texto impreso ("sunday brunch ss26 / bikini rayas playa"), generado por la IA.

## 10. Pendientes del usuario

1. Confirmar si la tienda está en **Odoo.sh / on-premise** (módulo) u **Odoo Online** (modo directo).
2. Dominio para el motor (`probador.<dominio>`) y nombre exacto de la categoría padre si no es "Moda".
3. ¿Ya hay productos de estas prendas cargados en Odoo? (completar Referencia interna antes del sync).
4. Número de WhatsApp definitivo (pendiente previo).
5. Límites diarios del probador (hoy 15 por visitante / 60 por IP).
