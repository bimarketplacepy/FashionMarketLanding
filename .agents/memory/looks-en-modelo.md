---
name: looks-en-modelo
description: Los looks de la landing se muestran sobre avatares IA (decisión del usuario 2026-11-09); cómo regenerarlos y aprobarlos.
metadata:
  type: project
---

El 2026-11-09, después de ver los reels de referencia (App Storage `reel/`), el usuario eligió la opción "con los avatares IA que ya teníamos" para mostrar personas vistiendo cada look. Es una excepción acotada a "no inventar fotos de modelos": son los 8 avatares ficticios del probador, con prendas reales, y la landing lo rotula "imágenes generadas con IA".

Pipeline: `node scripts/generate-look-models.mjs --generar` → `python3 scripts/cutout-look-models.py` → `--puntos` → `--optimizar` → revisar cada foto contra sus prendas → `--aprobar <ids>`. `--estado` lista y marca DESACTUALIZADO si el look cambió de prendas.

**Why:** las referencias (fila de modelos con profundidad, puntos numerados sobre el cuerpo) necesitan una persona; no hay fotos reales de SS26.
**How to apply:** si se importan prendas o cambia la temporada, los looks pueden cambiar: correr `--estado`, regenerar los desactualizados y revisarlos antes de aprobar. Nunca aprobar sin mirar: Gemini a veces cambia el tiro de bombachas de bikini o el tipo de calzado. Ver [[proyecto-estado-ss26]] y [[preferencias-usuario]].
