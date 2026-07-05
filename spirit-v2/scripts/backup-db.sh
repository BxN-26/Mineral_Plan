#!/usr/bin/env bash
# Sauvegarde de la base SQLite via l'API .backup (safe en mode WAL,
# contrairement à un simple `cp` qui peut copier une base incohérente
# si une écriture est en cours).
#
# Usage :
#   ./backup-db.sh
#
# Variables d'environnement optionnelles :
#   DB_PATH     chemin de la base à sauvegarder (défaut : ../db/spirit.db)
#   BACKUP_DIR  dossier de destination des backups (défaut : ../backups)
#   KEEP_DAYS   nombre de jours de backups à conserver (défaut : 14)
#
# Installation recommandée (cron quotidien à 3h du matin) :
#   sudo crontab -e
#   0 3 * * * DB_PATH=/opt/mineral-plan/spirit-v2/db/spirit.db BACKUP_DIR=/opt/mineral-plan/backups /opt/mineral-plan/spirit-v2/scripts/backup-db.sh >> /var/log/mineral-spirit-backup.log 2>&1
#
# IMPORTANT : un backup qui reste sur le même disque que le serveur ne protège
# pas d'une panne du VPS. Une fois ce script en place, synchroniser BACKUP_DIR
# vers un stockage distant (rsync/rclone vers un autre serveur, un NAS, ou un
# espace de stockage cloud) — voir Doc_techniques/audit_pre_ete_2026.md §5.1.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${DB_PATH:-$SCRIPT_DIR/../db/spirit.db}"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [ ! -f "$DB_PATH" ]; then
  echo "[backup-db] ERREUR : base introuvable à $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
DEST="$BACKUP_DIR/spirit_${TIMESTAMP}.db"

sqlite3 "$DB_PATH" ".backup '${DEST}'"

if [ ! -s "$DEST" ]; then
  echo "[backup-db] ERREUR : le fichier de backup est vide ou absent ($DEST)" >&2
  exit 1
fi

gzip -f "$DEST"
echo "[backup-db] OK — ${DEST}.gz ($(du -h "${DEST}.gz" | cut -f1))"

# Rotation : supprime les backups plus vieux que KEEP_DAYS jours
find "$BACKUP_DIR" -name 'spirit_*.db.gz' -mtime "+${KEEP_DAYS}" -delete
