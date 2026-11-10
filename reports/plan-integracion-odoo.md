# Plan: llevar Fashion Market a la tienda Odoo

> **Reemplazado** por `reports/odoo19-moda-end-to-end.md` (Odoo 19, experiencia en la categoría Moda, implementado). Se conserva como historial.

Estado de partida: rama `ss26-rediseno` (sin publicar). Fuente: `replit.md` + `.agents/memory/`.
Objetivo: la home de Odoo sigue siendo la de Odoo. Lo nuevo aparece en dos lugares:

1. **Catálogo / categorías de Odoo** (`/shop`, `/shop/category/*`, ficha `/shop/<producto>`) → aparece el **personalizador** (probador virtual + "Crear un look").
2. **Moda** → una página editorial como la landing actual: fila de looks sobre avatares IA, puntos numerados, perchero, ficha de look, "Tu selección".

---

## 1. Qué hay hoy (inventario end to end)

| Pieza | Dónde vive | Qué hace | Destino en Odoo |
|---|---|---|---|
| Catálogo | `data/library.json` (788 prendas, 619 activas SS26) | Fuente de verdad: nombre, `part`, colores, talles, `imageSet`, `gender`, `collection`, `active` | Se **sincroniza** a `product.template` de Odoo (Odoo pasa a mostrar el catálogo; el motor conserva los datos de IA) |
| Configuración | `data/site-config.json` | Temporada, `showPrices: false`, WhatsApp, promos | Se queda en el motor; precios se ocultan también del lado Odoo |
| API pública | api-server: `/api/catalog`, `/api/landing`, `/api/_ipx` | Catálogo slim, looks + perchero armados en servidor (~11 KB gzip) | Se queda; se habilita para el dominio de Odoo (CORS) |
| Probador | `/api/tryon/*` (`outfit-api.mjs`, `pgStore.ts`), Gemini, 8 avatares IA, sesión `fm_sid` | Genera la prueba virtual y guarda looks por visitante | Se queda en el motor; el front se **incrusta** en Odoo |
| Looks en modelo | `data/look-models.json`, `public/looks/`, pipeline `generate-look-models.mjs` | Fotos aprobadas + hotspots por prenda | Se queda en el motor; la página Moda los consume |
| Front | React (`src/landing/*`, `src/fashion/virtual-tryon.jsx`) | Landing, colección, probador, ficha, selección | Se empaqueta como **widgets embebibles** |
| Admin + importación | `/admin`, scripts CLI, `library-lock.mjs` | Alta de prendas, imágenes, activar/desactivar | Se queda en Replit (Odoo no lo reemplaza) |
| Imágenes | `public/garments/*` AVIF/WebP 400/800/1024 | Prendas optimizadas | La de 1024 se sube a Odoo como imagen de producto; el resto sigue en el motor |

**Conclusión:** no conviene reescribir esto en Odoo. Se arma así: **Replit = motor (datos de IA, probador, looks, admin)** y **Odoo = vidriera (productos, categorías, URLs, SEO, carrito si algún día hay)**, unidos por un vínculo por prenda.

---

## 2. Arquitectura propuesta

```
                    ┌──────────────────────────── Odoo Website ─────────────────────────────┐
 Visitante  ──────▶ │ /shop/category/*  ──▶ <fm-probador>   (drawer "Probátelo" + Crear look) │
                    │ /shop/<producto>  ──▶ <fm-probador producto="…">                       │
                    │ /moda             ──▶ <fm-moda>       (looks, perchero, ficha de look)  │
                    │ fm-embed.js (1 script, Shadow DOM, carga diferida)                     │
                    └───────────────────────────────┬────────────────────────────────────────┘
                                                    │ fetch con credentials (mismo sitio)
                    ┌───────────────────────────────▼────────────────────────────────────────┐
                    │ Motor: api-server en probador.<tu-dominio>  (deployment Replit)         │
                    │ /api/embed/* · /api/landing · /api/catalog · /api/tryon/* · /looks/*    │
                    │ library.json (+ odooTemplateId) · look-models.json · Postgres · Gemini  │
                    └───────────────────────────────┬────────────────────────────────────────┘
                                                    │ scripts/odoo-sync.mjs (JSON-RPC / XML-RPC)
                                                    ▼
                                       Odoo: product.template, categorías web
```

### Decisiones de diseño

- **Un solo script embebible** (`fm-embed.js`, Vite library mode) que registra dos custom elements: `<fm-probador>` y `<fm-moda>`. Funciona en Odoo Online, Odoo.sh u on-premise porque sólo requiere poder pegar HTML/JS en el sitio.
- **Shadow DOM** para que el CSS de Odoo (Bootstrap) no rompa el diseño y viceversa. Las fuentes (Instrument Serif/Sans) se declaran en el documento principal porque `@font-face` no funciona dentro de un shadow root.
- **Motor en subdominio del mismo dominio que Odoo** (ej. `probador.marketplace.com.py`). Esto es clave: la sesión del probador (`fm_sid`) es una cookie; si el motor está en `*.replit.app` es cookie de terceros y Safari/iOS la bloquea → el visitante pierde su avatar y sus looks. Con subdominio propio es mismo sitio y se pasa la cookie a `SameSite=Lax` + `Domain` del motor.
- **Vínculo prenda ↔ producto** guardado del lado del motor (`odooTemplateId` en `library.json`) y del lado de Odoo en **Referencia interna** (`default_code` = id de la prenda). No hace falta campo personalizado ni Studio.
- **Odoo no recibe la IA**: no se suben avatares, prompts ni claves. `GEMINI_API_KEY` y `ADMIN_KEY` siguen sólo en Secrets de Replit.

### Alternativa (sólo si Odoo es Odoo.sh u on-premise)
Un módulo `website_fashion_market` con plantillas QWeb que insertan los widgets, un controlador `/moda` y un proxy `/fm/api/*` hacia el motor (así todo queda bajo el dominio de Odoo y ni siquiera hace falta el subdominio). Más prolijo, pero no se puede instalar en Odoo Online. El plan de abajo funciona con cualquiera de las dos y el módulo se puede sumar después.

---

## 3. Mapeo de catálogo

| Motor (`library.json`) | Odoo |
|---|---|
| `id` | `default_code` (Referencia interna) |
| `name`, `description` | `name`, `description_ecommerce` / `website_description` |
| `part` | Categoría web (`product.public.category`) bajo **Moda**: Prendas superiores, Vestidos y enterizos, Abrigos, Prendas inferiores, Accesorios, Calzado (mismos textos que `catalog-types.js`) |
| `collection` (SS26) | Categoría web o etiqueta "Primavera – Verano 2026" (de `site-config.json`) |
| `gender` | Etiqueta / atributo filtrable Mujer · Hombre · Unisex |
| `sizes` | Atributo **Talle** (variantes sólo si se va a usar stock en Odoo; si no, atributo "sin variantes") |
| `color` / `palette` | Atributo **Color** con nombre de `color-names.js` |
| `imageSet` 1024 WebP | `image_1920` |
| `active` | `is_published` (no se borra nada en Odoo: se despublica) |
| `price` | **No se envía** mientras `showPrices` sea `false`; en Odoo ocultar precio y "Agregar al carrito" |

Sincronización (`scripts/odoo-sync.mjs`, nuevo):
- Usuario técnico de Odoo con API key (Secret `ODOO_URL`, `ODOO_DB`, `ODOO_USER`, `ODOO_API_KEY`).
- `--dry-run` por defecto: lista crear / actualizar / despublicar con conteos. `--aplicar` hace backup (`data/_backups/odoo-sync-<fecha>.json` con el estado previo de Odoo) y escribe.
- Idempotente: busca por `default_code`; guarda `odooTemplateId` en `library.json` vía `withLibraryLock`.
- Se corre después de cada importación (igual que `optimize-images`).
- Si en Odoo **ya existen** productos de estas prendas: modo `--vincular` que sólo empareja por nombre/referencia y reporta lo que no matchea, sin crear duplicados.

---

## 4. Personalizador en catálogo / categorías

Comportamiento:
- En `/shop` y `/shop/category/*`: botón flotante **"Probátelo"** + en cada tarjeta de producto vinculada un ícono de percha. Abre un drawer con el probador (`virtual-tryon.jsx`) con esa prenda preseleccionada; "Crear un look" sugiere combinaciones (`sugerencias.js`) con prendas de la categoría actual primero.
- En la ficha de producto: bloque **"Probalo en un modelo"** debajo de la galería, con la prenda ya cargada y "Completá el look" (sugerencias que linkean a sus fichas Odoo).
- Prendas sin vínculo (productos de Odoo que no están en el motor): el widget no muestra nada.

Cómo detecta la prenda: el widget lee el id de producto de la tarjeta/ficha de Odoo (link `/shop/<slug>-<id>` o `input[name=product_template_id]`) y pide `GET /api/embed/products?odoo=<ids>` → devuelve qué prendas son probables. Ningún cambio en las plantillas de Odoo salvo insertar el script.

Endpoints nuevos en el motor (`/api/embed/*`, públicos, sólo lectura salvo el probador que ya existe):
- `GET /api/embed/products?odoo=1,2,3` → `{ odooId: garmentPublic }`.
- `GET /api/embed/suggestions?garment=<id>&categoria=<part>` → looks sugeridos con `odooUrl`.
- `/api/tryon/*` igual que hoy (sesión `fm_sid`, Postgres, Gemini, límites actuales).
- CORS: sólo el origen de Odoo (`ODOO_ORIGIN`), `credentials: true`.

---

## 5. Página Moda (como la landing)

- Página de Odoo `/moda` (Sitio web → Páginas → Nueva) con un bloque HTML que contiene `<fm-moda></fm-moda>`; ítem de menú "Moda" apuntando ahí.
- Si "Moda" ya es una **categoría** de la tienda: la categoría `/shop/category/moda` muestra arriba el bloque `<fm-moda modo="cabecera">` (sólo la fila de looks) y debajo la grilla normal de Odoo. Elegir una de las dos (ver decisiones).
- Contenido: `HeroLooks` (Conjuntos / Vestidos / Playa, fotos en avatares IA aprobadas, puntos numerados), `Marquee`, `GarmentRack`, CTA al probador → `/shop` con el drawer abierto, rótulo "imágenes generadas con IA".
- Ficha de look (`LookSheet.jsx`): cada pieza tiene **"Ver en la tienda"** → URL de Odoo del producto (`website_url`, que el sync guarda junto a `odooTemplateId` y viaja en `/api/landing`).
- Header y footer: los de Odoo. `EditorialFooter` (wordmark) se omite o queda como cierre dentro de la página.
- Rendimiento: `fm-embed.js` se carga con `defer`; la página Moda pide sólo `/api/landing`. Precarga de la imagen del primer look con `<link rel="preload">` en el head de esa página.

"Tu selección" (`selection.jsx`): por ahora igual que hoy (localStorage + WhatsApp de `site-config.json`). Cuando se quiera vender, se reemplaza por "Agregar al carrito de Odoo" (`/shop/cart/update_json`), sin tocar el resto.

---

## 6. Fases (un commit por fase, criterios medibles)

### Fase 0 — Relevamiento (sin código)
- Versión de Odoo (16/17/18/19) y alojamiento (Online / Odoo.sh / propio).
- Dominio del sitio y si se puede crear `probador.<dominio>` (DNS).
- ¿Los productos ya existen en Odoo? ¿Qué categorías web hay hoy? ¿"Moda" es página o categoría?
- ¿Se oculta el precio en todo el sitio o sólo en Moda?
- **Acepta:** documento de respuestas + usuario API de Odoo de prueba creado.

### Fase 1 — Publicar el motor
- Merge de `ss26-rediseno` → `main`, publicar, reiniciar "API Server" (pendiente ya anotado), verificar tamaño de imagen.
- Dominio `probador.<dominio>` en el deployment.
- **Acepta:** `/api/landing` y `/api/catalog` responden 200 en el subdominio; Lighthouse de la app actual sin regresión.

### Fase 2 — API embebible
- `/api/embed/*`, CORS restringido a `ODOO_ORIGIN`, cookie `fm_sid` con `SameSite=Lax` en subdominio, `Cache-Control` en endpoints de sólo lectura.
- **Acepta:** desde el origen de Odoo, `fetch` con credenciales mantiene la sesión entre recargas en Chrome, Safari iOS y Firefox; otros orígenes reciben error CORS.

### Fase 3 — Sincronización de catálogo
- `scripts/odoo-sync.mjs` (dry-run → backup → aplicar), categorías web, atributos Talle/Color, imágenes, `odooTemplateId` + `odooUrl` en `library.json`.
- Primero contra una base de prueba de Odoo (duplicado/staging).
- **Acepta:** dry-run cuenta 619 publicables; tras aplicar, 619 productos publicados en Odoo con imagen y categoría; segunda corrida = 0 cambios; ningún precio visible.

### Fase 4 — Build embebible
- `vite.embed.config.ts` (library mode) → `dist-embed/fm-embed.<hash>.js` + CSS inyectado al shadow root, servido por el motor en `/embed/`. Lazy: el probador sólo se descarga al abrir el drawer.
- **Acepta:** página HTML de prueba sin estilos propios que monta ambos widgets; script inicial < 60 kB gzip; cero estilos filtrados hacia/desde la página (prueba con Bootstrap cargado).

### Fase 5 — Personalizador en catálogo/categorías
- Snippet en Odoo (Sitio web → Configuración → código personalizado en `<head>`, o módulo si es Odoo.sh) que carga `fm-embed.js` sólo en `/shop*`.
- **Acepta:** en 3 categorías y 3 fichas el botón aparece sólo en productos vinculados; generar una prueba virtual funciona end to end; CLS < 0,1 en la categoría.

### Fase 6 — Página Moda
- Página/categoría Moda con `<fm-moda>`, enlaces "Ver en la tienda" a fichas Odoo, rótulo IA, WhatsApp.
- **Acepta:** LCP mobile < 2,5 s (simulado) en `/moda`; todos los looks con foto aprobada; cada pieza abre su ficha Odoo correcta (chequeo automático de las URLs).

### Fase 7 — Analítica, SEO y cierre
- GTM: eventos `probador_abierto`, `look_generado`, `look_visto`, `ver_en_tienda` al `dataLayer` de Odoo.
- SEO: Odoo es el dueño de las URLs; el motor responde `noindex` en sus rutas públicas para no duplicar contenido.
- Informe antes/después (`reports/informe-odoo.md`) con capturas.
- **Acepta:** eventos visibles en GTM preview; Search Console sin duplicados nuevos.

---

## 7. Riesgos y cómo se cubren

| Riesgo | Mitigación |
|---|---|
| Cookie de sesión bloqueada (Safari) | Motor en subdominio propio (Fase 1–2). Alternativa: proxy en módulo Odoo |
| CSS de Odoo rompe el diseño | Shadow DOM + fuentes en el documento |
| Doble fuente de verdad del catálogo | El motor manda; Odoo se sobrescribe sólo en campos sincronizados (lista cerrada), el resto lo edita el equipo en Odoo libremente |
| Productos creados a mano en Odoo | No se tocan: el sync sólo opera sobre `default_code` que existen en `library.json` |
| Looks desactualizados al cambiar catálogo | Ya cubierto: `/api/landing` sólo adjunta fotos aprobadas con las mismas prendas; correr `generate-look-models --estado` tras sincronizar |
| Costo de Gemini por tráfico de Odoo | Límite por sesión/IP en `/api/tryon/generate` (revisar el actual antes de abrir a más tráfico) |
| Odoo Online no acepta módulos | Todo el plan funciona con el script pegado en código personalizado |

---

## 8. Decisiones abiertas para el usuario

1. Versión y alojamiento de Odoo.
2. "Moda": ¿página nueva `/moda` o la categoría existente con cabecera de looks?
3. ¿Los productos ya están cargados en Odoo (vincular) o los crea el sync?
4. ¿Talle como variantes con stock o sólo informativo?
5. ¿"Tu selección" sigue por WhatsApp o pasa al carrito/cotización de Odoo?
6. Número de WhatsApp definitivo (pendiente previo).
