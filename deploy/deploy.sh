#!/usr/bin/env bash
# Mise à jour sur le serveur : récupère le code, installe, compile, redémarre.
# Usage (dans le dossier du projet) : bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Sauvegarde des comptes"
mkdir -p backups
if [ -f server/data/users.json ]; then
  cp server/data/users.json "backups/users-$(date +%Y%m%d-%H%M%S).json"
  ls -1t backups/users-*.json | tail -n +31 | xargs -r rm --   # garde les 30 dernières
fi

echo "→ Récupération du code"
git pull --ff-only

echo "→ Dépendances"
npm ci --no-audit --no-fund

echo "→ Compilation"
npm run build

if [ ! -d public/assets/textures ]; then
  echo "⚠ public/assets absent : copiez le dossier depuis votre machine (voir deploy/INSTALL-debian.md)"
fi

echo "→ Redémarrage"
if command -v pm2 >/dev/null 2>&1 && pm2 describe strikepoint >/dev/null 2>&1; then
  pm2 restart strikepoint
elif systemctl list-unit-files | grep -q '^strikepoint.service'; then
  sudo systemctl restart strikepoint
else
  echo "Aucun service trouvé : lancez 'pm2 start deploy/ecosystem.config.cjs && pm2 save'"
fi
echo "✓ Déploiement terminé"
