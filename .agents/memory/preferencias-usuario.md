---
name: preferencias-usuario
description: Cómo quiere trabajar el usuario (idioma, reglas de datos, contenido, forma de entrega).
metadata:
  type: feedback
---

- Todo en español (rioplatense en la UI: "Conocé", "Descubrí"). Moneda guaraníes; hoy sin precios (`showPrices: false`).
- No inventar contenido: ni precios, ni fechas de promo, ni testimonios, ni fotos de modelos, ni números de contacto. Usar sólo prendas y textos reales.
- Cambios masivos de datos: dry-run con conteo → backup → aplicar.
- No borrar datos sin confirmación explícita; lo que sale del deploy se mueve o se excluye.
- Trabajo por fases con criterios de aceptación medibles, un commit por fase e informe antes/después.
- No copiar marcas/nombres de referencias; la marca es "Fashion Market — By Marketplace".

**Why:** instrucciones explícitas del usuario en el pedido de rediseño (2026-11-06).
**How to apply:** ante dudas de contenido real (ej. WhatsApp) dejarlo configurable y preguntar; ante datos que aparecen a mitad de camino (ej. lotes con prendas pendientes) avisar antes de borrar. Ver [[pendientes-usuario]].
