#!/bin/bash
# DeliveryFood - Script de atualização rápida (idempotente)
# Uso: bash deploy/update.sh
#
# Idêntico ao padrão do beleza-saas/deploy/update.sh.
# A cada git push, rode este script manualmente OU via GitHub Actions.

set -e

APP_DIR="/var/www/delivery-food"
cd ${APP_DIR}

echo "=== DeliveryFood - Atualização ==="
echo "Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Pwd: $(pwd)"
echo ""

# 1. Backup do .env (segurança)
if [ -f ".env" ]; then
    cp .env .env.backup.$(date +%s)
    echo "[backup] .env salvo como .env.backup.$(date +%s)"
fi

# 2. Pull das últimas alterações
echo "[1/7] git pull..."
git pull

# 3. Verifica se package.json mudou (caso contrário, pula npm install)
if git diff --name-only HEAD@{1} HEAD | grep -qE "^package(-lock)?\.json$"; then
    echo "[2/7] package.json mudou. Instalando deps..."
    npm install --no-audit --no-fund
else
    echo "[2/7] package.json sem mudanças. Pulando npm install."
fi

# 4. Prisma generate
echo "[3/7] prisma generate..."
npx prisma generate

# 5. Migrations
echo "[4/7] prisma migrate deploy..."
npx prisma migrate deploy

# 6. Seed do admin (idempotente)
echo "[5/7] seed (idempotente)..."
npx tsx prisma/seed.ts 2>/dev/null || true

# 7. Build
echo "[6/7] build..."
NODE_PATH=$(pwd)/node_modules NODE_OPTIONS="--max-old-space-size=6144" npm run build

# 8. Restart PM2
echo "[7/7] pm2 restart..."
pm2 restart delivery-food

echo ""
echo "========================================="
echo "  Atualização concluída!"
echo "========================================="
pm2 status delivery-food
echo ""
echo "Para ver os logs em tempo real:"
echo "  pm2 logs delivery-food"
echo ""
echo "Últimas 30 linhas do log de erro:"
echo "  pm2 logs delivery-food --lines 30 --err"