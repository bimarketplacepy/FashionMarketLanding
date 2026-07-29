#!/bin/bash
# Reintenta la generación IA hasta que haya cuota: primero los 6 modelos,
# después las prendas en pose neutra. Ambos scripts son reanudables.
cd "$(dirname "$0")/.."
LOG=data/watch-quota.log
for i in $(seq 1 48); do
  echo "== intento $i · $(date -u +%H:%M) UTC ==" >> "$LOG"
  node scripts/generate-models.mjs >> "$LOG" 2>&1
  node scripts/regenerate-garments.mjs --pausa 7000 >> "$LOG" 2>&1
  restantes=$(node -e "const m=require('./data/garment-regen.json');const l=require('./data/library.json');console.log(l.length-Object.values(m.entries||{}).filter(e=>e.status==='done').length)" 2>/dev/null || echo x)
  echo "prendas pendientes: $restantes" >> "$LOG"
  [ "$restantes" = "0" ] && echo "COMPLETO $(date -u)" >> "$LOG" && exit 0
  sleep 1800
done
