# Informe final — Fashion Market SS26 (2026-11-06)

Rama: `ss26-rediseno` (sale de `main` en `53043df`). Métricas iniciales detalladas en `metricas.md`.

## Antes y después

| Métrica | Antes (fase 0) | Después | Cambio |
|---|---|---|---|
| `data/` en disco | 1,7 GB | 727 MB (661 MB son los PNG maestros, excluidos del deploy) | −57 % |
| `data/` que viaja al deploy | 1,7 GB | ~66 MB | −96 % |
| Workspace desplegable¹ | 1,9 GB | 729 MB (338 MB son `.config/npm`, ver decisiones) | −62 % |
| Bundle JS principal | 548,0 kB (174,3 kB gzip) | 241,4 kB (75,6 kB gzip) | −56 % |
| CSS principal | 162,8 kB | 30,8 kB (+ CSS por ruta) | −81 % |
| Peso por prenda | PNG 857 KB promedio | 800w: WebP 53,5 KB / AVIF 23,9 KB | −94 % / −97 % |
| Datos para pintar la landing | `library.json` 1,3–2,6 MB sin comprimir | `/api/landing` 11,5 KB gzip | −99 % |
| Peso total de la landing (Lighthouse) | 7,9 MB | 373 KB | −95 % |
| Lighthouse mobile, throttling devtools² | Perf 65 · LCP 4,7 s · CLS 0 · A11y 90 | Perf 91 · LCP 2,7 s · CLS 0,008 · A11y 100 | |
| Lighthouse mobile, simulado (estándar)³ | no medible (`NO_LCP`) | Perf 95 · LCP 2,4 s · CLS 0,008 · A11y 100 · BP 100 | |
| Lighthouse escritorio, simulado | — | Perf 100 · LCP 0,5 s · A11y 100 · BP 100 | |

¹ Todo el workspace salvo `.git`, `node_modules`, `.cache`, `.pythonlibs`, aplicando `.replitignore`.
² Mismo método para ambas versiones: commit original `6eaadaf` vs. final, ambos como build estático + api-server en modo deployment, en este mismo contenedor.
³ Mediana de 3 corridas sobre el build final (rango LCP 2,4–2,5 s, Performance 94–97). El original no devuelve LCP con el método simulado porque la intro anima cada letra desde opacidad 0.

Detalle de las mediciones:

- **Objetivo LCP < 2,5 s:** se cumple con el método estándar (simulado). Con throttling real de devtools, que es más duro, da 2,7 s.
- **LCP en mobile:** el elemento LCP es la prenda inferior del primer look. Se precarga desde el HTML generado en el build.
- **Medición local:** todo se midió con un servidor estático propio (gzip, caché). El hosting real de Replit puede variar.

## Commits

| Commit | Fase |
|---|---|
| `6eaadaf` chore: resguardo importación SS26 + estado actual | 0 |
| `c84a2db` docs: métricas iniciales (fase 0) | 0 |
| `cedd33c` feat: temporada SS26 configurable y prendas importadas en SS26 | 1 |
| `2054e65` feat(admin): clave validada en el servidor, panel lazy y flag de precios | 2 |
| `569ffe4` fix(admin): scripts CLI se autentican con X-Admin-Key | 2 (regresión) |
| `be0b518` perf: imágenes de prendas en AVIF/WebP y respaldos fuera del deploy | 3 |
| `d906606` refactor: landing en src/landing, catálogo único y limpieza de código muerto | 4 |
| `c012272` feat(landing): rediseño editorial SS26 | 5 |

## Chequeos de aceptación

- 552 prendas importadas por lotes → `collection: "SS26"`, `season: "summer"`. SS26 total: 636 (619 activas en la tienda).
- Texto de invierno visible: ninguno en `/`, `/catalogo`, `/probador` y `/probador?seccion=builder`, verificado sobre el DOM renderizado. En el bundle quedan como datos la promo vencida (que nunca se renderiza) y los nombres del enum de temporadas (Otoño/Invierno), que se usan para etiquetar prendas.
- Promos: la única configurada ("Winter Sale", `endsAt` 2026-08-31) está vencida y no se renderiza.
- Clave del admin en `dist/`: 0 apariciones. `VITE_ADMIN` en `dist/`: 0.
- Precios: `showPrices: false`; `/api/catalog` y `/api/landing` no exponen `price`. El código de formateo de precio no entra al bundle público.
- `pnpm run build` completo sin errores; `prebuild` verifica las variantes de imagen de las 619 prendas activas.
- Capturas en `reports/capturas/`: landing, perchero en modo foco, ficha y "Tu selección", en 1440 px y 390 px, más la ficha del catálogo. Sin scroll horizontal ni errores de consola.
- Teclado: flechas y Enter en la fila; Enter, flechas y Esc en el perchero y en la ficha. Con movimiento reducido: sin blur, sin rotaciones y marquee quieto.

## Decisiones que necesitan tu confirmación

1. **`ADMIN_KEY` en Secrets del deployment.** Sin ella el panel queda cerrado en producción. En el workspace pasé el valor de `VITE_ADMIN_KEY` a `ADMIN_KEY` en `artifacts/aether/.env`.
2. **Número de WhatsApp.** El proyecto no tiene ninguno. "Tu selección" ofrece "Consultar por email" (`info@marketplace.com.py`) hasta que cargues `contact.whatsapp` en `data/site-config.json`.
3. **`.replitignore` no está documentado por Replit.** Lo generó Replit y la exclusión de `.local` sugiere que se respeta, pero conviene verificar el tamaño de la imagen en el primer publish. Si no se respetara, el sitio funciona igual: solo pesa más el deploy.
4. **`.config/npm/node_global` (338 MB).** Son paquetes npm globales preexistentes que viajan al deploy. Excluirlos bajaría el deploy a ~390 MB. No los toqué.
5. **Respaldos movidos, no borrados.**
   - Las fotos crudas de lotes, `imported-originals/` y `_dedup-*` están en `.local/aether-archive/` (970 MB) y en App Storage `archivo/2026-11-06/` (verificado: 3.103 archivos, 1.011 MB). ¿Se puede borrar la copia local?
   - Los PNG maestros siguen en `data/imported/`, porque los usa todo el flujo de importación y regeneración.
6. **Intro "FASHION MARKET" eliminada de la landing.** El hero "Primavera – Verano '26" pasa a ser lo primero que se ve. Sigue en el historial de git si la querés de vuelta.
7. **Selector del hero.** Muestra "Conjuntos / Vestidos / Playa" y no "Mujer / Hombre": no hay ropa de hombre activa (613 prendas de mujer y 6 unisex).
8. **Sin smooth scroll (Lenis) ni Framer Motion.** Framer Motion estaba instalado pero sin usar. Sumarlo rompía el objetivo de −40 % de bundle, así que todo el movimiento es CSS.
9. **GTM diferido.** Se carga después del evento `load`, en un momento ocioso. Los page views se encolan en `dataLayer` y no se pierden, pero el primer hit llega ~1 s más tarde.
10. **Looks generados por algoritmo.** Usan armonía de color y estampa compartida. Si querés curarlos a mano, el siguiente paso natural es una lista fija en la config.
11. **Rama `ss26-rediseno`.** Todo quedó en esta rama, no en `main`. Para publicar: merge a `main` (o publicar desde la rama) y reiniciar el workflow "API Server", que corre el bundle de `dist/`.
12. **Reel de Instagram de referencia.** No se pudo importar: Instagram devuelve la página, no el video. El diseño sigue la especificación escrita. Si dejás el `.mp4` en `attached_assets/`, lo analizo y ajusto.

## Seguimiento (2026-11-06, después de la revisión)

1. `ADMIN_KEY` cargada en Secrets del deployment (confirmado).
2. WhatsApp provisorio: `595981203891` con el saludo "Hola, quisiera consultar…" en el formato de api.whatsapp.com. Está en "Tu selección" (con la lista de piezas) y en el footer.
3. `.replitignore` se prueba en el próximo publish.
4. `.config/npm/node_global` es la instalación global de Claude Code (323 MB). La app no la usa: se excluye del deploy con `.config/` en `.replitignore`. No se movió de lugar, porque eso rompería Claude Code en el workspace. Desplegable estimado: ~390 MB.
5. Copia local de respaldos borrada después de reverificar App Storage (3.103 de 3.103 archivos). Se conservaron los 5 lotes con 37 prendas analizadas sin importar (58 MB): ROSIO CLOTHING 2, DINAMIC FASHION 5, ACTIVE BASIC 28, BLUPEPPER SS26 1 (error), AEMI+CO 1 (error).

## Looks en modelo (2026-11-09)

Referencia: los 3 reels de App Storage `reel/`. Tienen una fila de personas con profundidad, puntos numerados sobre cada prenda y un perchero con modo foco (este último ya estaba). Decisión del usuario: vestir los looks sobre los avatares IA del probador.

- 21 looks (7 por familia) generados con Gemini sobre las 8 variantes de avatar de mujer, con las prendas reales como referencia. Fondo recortado con rembg y puntos numerados ubicados por Gemini.
- Revisión manual de cada foto contra sus prendas: 19 salieron bien al primer intento. En 2 looks de playa la bombacha de bikini salió de tiro alto: se reforzó el prompt, se regeneraron y se aprobaron. Sólo se publican las fotos aprobadas.
- La landing lo rotula: "Modelos virtuales: imágenes generadas con IA a partir de las prendas reales". La ficha dice "Imagen generada con IA · Modelo virtual …".
- Peso por foto (800w): AVIF 36 KB / WebP 47 KB.

| Lighthouse mobile simulado (mediana de 3) | Antes (6/11) | Ahora |
|---|---|---|
| Performance | 95 | 97 |
| LCP | 2,4 s | 2,4 s |
| CLS | 0,008 | 0,008 |
| Accesibilidad | 100 | 100 |
| Peso total de la landing | 373 KB | 405 KB |

Capturas: `capturas/d-7-looks-en-modelo.png`, `capturas/d-8-ficha-puntos.png`, `capturas/m-7-looks-en-modelo.png`. Sin scroll horizontal ni errores de consola, en 1440 px y en 390 px.
