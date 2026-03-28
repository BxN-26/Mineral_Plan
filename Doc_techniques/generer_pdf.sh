#!/usr/bin/env bash
# ============================================================
#  generer_pdf.sh — Génération PDF de la documentation
#  minéral Spirit v2
#
#  Prérequis :
#    sudo apt install pandoc texlive-xetex texlive-lang-french
#
#  Usage :
#    chmod +x generer_pdf.sh
#    ./generer_pdf.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/pdf"
mkdir -p "$OUT_DIR"

PANDOC_OPTS=(
  --pdf-engine=xelatex
  -V lang=fr
  -V geometry:margin=2.5cm
  -V fontsize=11pt
  -V mainfont="DejaVu Serif"
  -V sansfont="DejaVu Sans"
  -V monofont="DejaVu Sans Mono"
  -V colorlinks=true
  -V linkcolor=teal
  --toc
  --toc-depth=2
  --highlight-style=tango
)

echo "==> Vérification que pandoc est installé..."
if ! command -v pandoc &>/dev/null; then
  echo "ERREUR : pandoc n'est pas installé."
  echo "Installez-le avec : sudo apt install pandoc texlive-xetex texlive-lang-french"
  exit 1
fi

echo "==> Génération de description_technique.pdf..."
pandoc "$SCRIPT_DIR/description_technique.md" \
  "${PANDOC_OPTS[@]}" \
  -o "$OUT_DIR/description_technique.pdf"

echo "==> Génération de manuel_utilisateur.pdf..."
pandoc "$SCRIPT_DIR/manuel_utilisateur.md" \
  "${PANDOC_OPTS[@]}" \
  -o "$OUT_DIR/manuel_utilisateur.pdf"

echo "==> Génération de manuel_staff.pdf..."
pandoc "$SCRIPT_DIR/manuel_staff.md" \
  "${PANDOC_OPTS[@]}" \
  -o "$OUT_DIR/manuel_staff.pdf"

echo ""
echo "✓ Fichiers générés dans : $OUT_DIR/"
ls -lh "$OUT_DIR/"*.pdf
