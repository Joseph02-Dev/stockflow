#!/usr/bin/env bash
# Compare les comptages de la copie restaurée à ceux de la production, pris
# juste avant et juste après l'export : l'activité pendant l'export peut
# ajouter ou retirer des lignes, la copie doit tomber entre les deux.
# Vérifie aussi que toutes les migrations du dépôt y sont appliquées.
set -euo pipefail
avant="$1"; apres="$2"; restauree="$3"; migrations_depot="$4"
echec=0
while IFS='|' read -r table nombre; do
  a=$(awk -F'|' -v t="$table" '$1==t {print $2}' "$avant")
  b=$(awk -F'|' -v t="$table" '$1==t {print $2}' "$apres")
  bas=$(( a < b ? a : b )); haut=$(( a > b ? a : b ))
  if (( nombre < bas || nombre > haut )); then
    echo "::error::$table : $nombre ligne(s) restaurée(s), attendu entre $bas et $haut"
    echec=1
  else
    echo "$table : $nombre ligne(s) — conforme"
  fi
done < "$restauree"
appliquees=$(awk -F'|' '$1=="_prisma_migrations" {print $2}' "$restauree")
if (( appliquees < migrations_depot )); then
  echo "::error::$appliquees migration(s) dans la copie, $migrations_depot dans le dépôt"
  echec=1
fi
exit "$echec"
