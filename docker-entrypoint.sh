#!/bin/sh
# Aplica migrations do Prisma antes de iniciar o app.
# Mantém o app funcional mesmo se o banco estiver demorando
# (tenta aplicar e segue para o start).

set -e

echo "[entrypoint] Aplicando migrations do Prisma..."
npx prisma migrate deploy || {
  echo "[entrypoint] Falha ao aplicar migrations. Tentando novamente em 5s..."
  sleep 5
  npx prisma migrate deploy
}

echo "[entrypoint] Iniciando aplicação na porta ${PORT:-3000}..."
exec "$@"