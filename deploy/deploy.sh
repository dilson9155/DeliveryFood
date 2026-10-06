#!/bin/bash
# DeliveryFood - Deploy script para Hostinger VPS
# Execute como root: bash deploy/deploy.sh deliveryfood.elitesistemas.io
#
# Idêntico ao padrão usado no beleza-saas.

set -e

APP_DIR="/var/www/delivery-food"
NODE_VERSION="22"
DOMAIN="${1:-}"

echo "=== DeliveryFood - Deploy Hostinger VPS ==="
[ -n "$DOMAIN" ] && echo "Domínio: $DOMAIN"

# 1. Instalar Node.js 22
if ! command -v node &> /dev/null; then
    echo "[1/7] Instalando Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y nodejs
else
    echo "[1/7] Node.js $(node -v) já instalado."
fi

# 2. Instalar PM2 e Nginx
echo "[2/7] Instalando PM2 e Nginx..."
npm install -g pm2 2>/dev/null || true
apt-get install -y nginx certbot python3-certbot-nginx 2>/dev/null || true

# 3. Preparar diretório
echo "[3/7] Preparando diretório..."
mkdir -p ${APP_DIR} /var/log/pm2

# 4. Copiar arquivos (se rodando de dentro do repo)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${SCRIPT_DIR}/../package.json" ]; then
    echo "[4/7] Copiando arquivos..."
    rsync -av --exclude node_modules --exclude .next --exclude .git --exclude '*.log' \
          --exclude "scripts/next-prod" \
          ${SCRIPT_DIR}/../ ${APP_DIR}/
else
    echo "[4/7] Arquivos já devem estar em ${APP_DIR}"
fi

# 5. Configurar .env se não existir
if [ ! -f "${APP_DIR}/.env" ]; then
    echo "[5/7] Criando .env (template)..."
    cat > ${APP_DIR}/.env << 'ENVEOF'
# Banco de dados (Neon PostgreSQL - São Paulo)
DATABASE_URL="postgresql://neondb_owner:npg_7zWlqGVhFAE3@ep-silent-hall-b6d283vj-pooler.c-2.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Autenticação (gere uma nova com: openssl rand -base64 32)
AUTH_SECRET=Bis0+ehMyIBpwbBuG5jNiFRJ+UnbP0OAcs1B6gkhHp4=
AUTH_TRUST_HOST=true

# URL pública do app (mude quando tiver domínio)
NEXTAUTH_URL=https://deliveryfood.elitesistemas.io

# Asaas (pagamentos PIX) - sandbox
ASAAS_ENV=sandbox
# ASAAS_API_KEY=cole-sua-chave-aqui (NÃO comitar chave real!)

# WhatsApp (opcional)
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=delicias

# Aplicação
NODE_ENV=production
ENVEOF
    echo "      .env criado! Edite com suas configurações (chaves reais)."
else
    echo "[5/7] .env já existe."
fi

# 6. Instalar dependências e build
echo "[6/8] Instalando dependências e fazendo build..."
cd ${APP_DIR}
npm install --no-audit --no-fund
npx prisma generate
NODE_PATH=$(pwd)/node_modules NODE_OPTIONS="--max-old-space-size=6144" npm run build

# 7. Iniciar com PM2
echo "[7/8] Iniciando aplicação..."
pm2 delete delivery-food 2>/dev/null || true
pm2 start ${APP_DIR}/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root

# 8. Configurar Nginx (se domínio informado)
if [ -n "$DOMAIN" ]; then
    echo ""
    echo "=== Configurando Nginx para ${DOMAIN} ==="
    cat > /etc/nginx/sites-available/delivery-food << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 90s;
        proxy_connect_timeout 90s;
    }

    location /_next/static {
        proxy_pass http://127.0.0.1:3006;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, immutable, max-age=31536000";
    }
}
NGINXEOF
    ln -sf /etc/nginx/sites-available/delivery-food /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx

    echo "Configurando SSL..."
    certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --email contato@elitesistemas.io || echo "SSL: configure manualmente com certbot"

    # Atualizar NEXTAUTH_URL
    sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"https://${DOMAIN}\"|" ${APP_DIR}/.env
    pm2 restart delivery-food
fi

echo ""
echo "========================================="
echo "  Deploy concluído!"
echo "========================================="
echo ""
if [ -n "$DOMAIN" ]; then
    echo "  Acesse: https://${DOMAIN}"
else
    echo "  Acesse: http://$(hostname -I | awk '{print $1}'):3006"
fi
echo ""
echo "  Próximos passos:"
echo "  1. Edite o .env: nano ${APP_DIR}/.env"
echo "  2. Migrations: cd ${APP_DIR} && npx prisma migrate deploy"
echo "  3. Seed: cd ${APP_DIR} && npx prisma db seed"
echo "  4. Ver app: pm2 logs delivery-food"
echo ""