# Deploy na Hostinger — Guia Completo

Este guia é específico para **Hostinger Business Web Hosting** (compartilhado).
Sem Docker, sem VPS. Tudo via GitHub Actions + SFTP.

---

## 📋 Pré-requisitos

- Repositório no GitHub: https://github.com/dilson9155/Delivery-Food
- Domínio: `deliveryfood.elitesistemas.io` (ou outro subdomínio)
- Plano Hostinger **Business Web Hosting** ativo
- Credenciais SFTP da Hostinger (Host, Username, Password, Path)
- Banco Postgres externo (Neon, Supabase, etc.) — recomendado Neon gratuito

---

## 1️⃣ Configurar Secrets no GitHub

Vá em: https://github.com/dilson9155/Delivery-Food/settings/secrets/actions

Adicione estes 5 secrets:

| Nome | Valor | Onde pegar |
|------|-------|------------|
| `HOSTINGER_HOST` | `ftp.deliveryfood.elitesistemas.io` (ou IP da VPS) | Painel Hostinger → FTP |
| `HOSTINGER_USERNAME` | `u123456789` | Painel Hostinger → FTP |
| `HOSTINGER_PASSWORD` | sua senha FTP | Painel Hostinger → FTP |
| `HOSTINGER_TARGET_PATH` | `/home/u123456789/public_html/delivery` | File Manager → Properties |
| `HOSTINGER_DOMAIN` | `deliveryfood.elitesistemas.io` | (só domínio, sem https) |

---

## 2️⃣ Configurar Neon (banco Postgres)

1. Crie conta em https://neon.tech
2. Crie projeto:
   - **Name**: `delicias-das-estacoes`
   - **Region**: `AWS São Paulo (sa-east-1)`
3. Copie a **Connection String**:
   ```
   postgresql://neondb_owner:senha@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require
   ```

---

## 3️⃣ Configurar o `.env` na Hostinger (via File Manager)

1. Abra **File Manager** no hPanel
2. Navegue até `public_html/delivery/`
3. Crie um arquivo `.env` com:

```env
DATABASE_URL="postgresql://neondb_owner:SUA_SENHA@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require"
AUTH_SECRET=GereUmaChaveAqui_Use_Openssl_Rand_Base64_32
AUTH_TRUST_HOST=true
NODE_ENV=production
PORT=3000
NEXTAUTH_URL=https://deliveryfood.elitesistemas.io
ASAAS_ENV=sandbox
ASAAS_API_KEY=sua_chave_asaas
```

4. Salvar (não `--public` o .env)

---

## 4️⃣ Aplicar migrations no banco

Via SSH (File Manager → Terminal) ou via cPanel:

```bash
cd ~/public_html/delivery
node node_modules/prisma/build/index.js migrate deploy
```

Ou via npx se tiver Prisma instalado localmente no servidor:

```bash
cd ~/public_html/delivery
npx prisma migrate deploy
```

---

## 5️⃣ Configurar Node.js app no painel

1. hPanel → **Aplicações web** (ou "Web Applications")
2. Adicione novo:
   - **Versão Node**: 20
   - **Pasta**: `/home/u123456789/public_html/delivery`
   - **Startup file**: `server.js`
   - **Porta**: 3000
3. Ativar

### Se não tiver "Aplicações web" no seu plano

Você precisa iniciar manualmente via SSH:

```bash
cd ~/public_html/delivery
node server.js
```

Para manter rodando, use `pm2` ou configure um **cron @reboot**:

```bash
@reboot cd /home/u123456789/public_html/delivery && nohup node server.js > ~/app.log 2>&1 &
```

---

## 6️⃣ Configurar proxy reverso

### Plano com Apache (comum em Business):

Crie `.htaccess` em `public_html/`:

```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^(.*)$ http://localhost:3000/$1 [P,L]
```

(Seu plano Business geralmente tem mod_proxy habilitado)

---

## 7️⃣ SSL (HTTPS)

1. hPanel → **Segurança** → **SSL**
2. Selecione `deliveryfood.elitesistemas.io`
3. Ative **Let's Encrypt**
4. Aguarde 1-2 min

---

## 8️⃣ DNS do subdomínio

Aponte `deliveryfood` para a Hostinger:

1. hPanel → **Domínios** → **DNS**
2. Adicione registro:
   - **Tipo**: A
   - **Nome**: `deliveryfood`
   - **Valor**: IP da Hostinger (fornecido no painel)
3. Aguarde 5-30 min pra propagar

---

## 9️⃣ Testar

Acesse: https://deliveryfood.elitesistemas.io

✅ Deve aparecer a home do Delicias das Estações

Login padrão: `admin` / `admin123` (mude após primeiro acesso!)

---

## 🚀 Próximos deploys

Toda vez que você fizer `git push` na branch `main`, o GitHub Actions:

1. Faz build do Next.js
3. Envia via SFTP pra Hostinger
4. Reinicia o app

**Você não precisa fazer mais nada manualmente!**

---

## 🔧 Troubleshooting

### 502 Bad Gateway
- App Node não está rodando. Vá em "Aplicações web" e Restart.
- Verifique log em `~/app.log` (se usou cron @reboot).

### 404 Not Found
- Caminho do `.htaccess` errado. Deve estar em `public_html/.htaccess`.
- Apache sem `mod_proxy`. Contate Hostinger.

### Database connection error
- DATABASE_URL errada no `.env`. Verifique SSL: `?sslmode=require`.
- IP da Hostinger não está liberado no Neon (libre default libera todos).

### Deploy rodou mas não atualiza
- Vá em hPanel → Aplicações web → Restart.
- Se não tiver "Aplicações web", rode manualmente no SSH.

---

## 📞 Variáveis de ambiente completas

Ver `/.env.example` no repositório para todas as variáveis disponíveis.