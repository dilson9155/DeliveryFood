# 📖 Guia Completo de Replicação — Deploy Delivery Food na Hostinger

> **Objetivo**: Recriar do zero o deploy do sistema "Delícias das Estações" (delivery de comida) na Hostinger Business compartilhada, conectado a um banco Neon Postgres (São Paulo).
>
> **Pré-requisitos**: Ter acesso ao GitHub, à Hostinger (hPanel) e ao Neon Console.

---

## 🎯 Visão Geral do Fluxo

```
Desenvolvedor edita código local
        ↓
git push origin main (Windows / PowerShell)
        ↓
GitHub Actions (roda no servidor do GitHub)
   ├── checkout
   ├── setup Node 22
   ├── npm ci
   ├── prisma generate
   ├── npm run build (gera .next/standalone/)
   └── SFTP/FTPS upload pro Hostinger
        ↓
Hostinger (Business compartilhada)
   ├── Pasta /domains/deliveryfood.elitesistemas.io/public_html/
   └── Node.js App lê arquivos e roda "node server.js"
        ↓
Usuário acessa https://deliveryfood.elitesistemas.io
```

---

## 🧱 Stack do Projeto

| Camada | Tecnologia |
|---|---|
| Frontend + Backend | **Next.js 16** (App Router) |
| Linguagem | **TypeScript** (strict mode) |
| ORM | **Prisma 6** |
| Banco | **PostgreSQL** (Neon, região São Paulo) |
| Autenticação | **NextAuth v5** |
| Validação | **Zod** |
| Mapa / Tracking | **Leaflet + OpenStreetMap + Nominatim** |
| Pagamento | **Asaas** (PIX, sandbox) |
| WhatsApp | **Evolution API** (self-hosted) |
| UI | **shadcn/ui + Tailwind** |
| Estado | **Zustand** (cart) |
| Impressão térmica | Templates internos (58/76/80mm + A4) |

---

## 🔑 Credenciais Necessárias (você precisa TER acesso a)

| Serviço | Onde conseguir |
|---|---|
| GitHub | https://github.com (sua conta) |
| Hostinger hPanel | https://hpanel.hostinger.com |
| Neon Console | https://console.neon.tech |
| Domínio `elitesistemas.io` | Onde você registrou (geralmente Namecheap, GoDaddy ou Registro.br para `.io`) |
| Asaas (sandbox) | https://sandbox.asaas.com (crie uma conta gratuita) |

---

## 📐 Passo 1 — Configurar o Banco no Neon

### 1.1 Criar projeto

1. Acesse https://console.neon.tech
2. **Create Project**
   - Name: `deliveryfood`
   - Region: **São Paulo (sa-east-1)**
   - Postgres version: latest
3. Clique **Create Project**

### 1.2 Salvar credenciais

Após criar, copie e guarde (em lugar seguro):

```
Host: ep-xxxxxxx.sa-east-1.aws.neon.tech
Database: neondb
User: neondb_owner
Password: (gerada automaticamente — copie AGORA, mostra só 1x!)
Branch: production
```

A URL completa é:
```
postgresql://neondb_owner:SUA_SENHA@ep-xxxx.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### 1.3 Aplicar migrations + seed

Localmente, com o projeto clonado:
```bash
cd delivery-food
npm install --no-audit --no-fund
npx prisma migrate deploy
npx tsx prisma/seed.ts    # Cria admin + cliente demo + produtos
```

---

## 📐 Passo 2 — Configurar Repositório no GitHub

### 2.1 Criar repo

1. https://github.com/new
2. **Repository name**: `DeliveryFood` (sem hífen pra evitar conflito)
3. ⚠️ **NÃO** marcar "Add README", "Add .gitignore", "Add license"
4. **Create repository**

### 2.2 Dar push no código

```bash
cd delivery-food
git init -b main
git add .
git commit -m "feat: sistema completo de delivery"
git remote add origin https://github.com/SEU_USER/DeliveryFood.git
git push -u origin main
```

⚠️ **NUNCA** commite `.env` (deve estar no `.gitignore`).

---

## 📐 Passo 3 — Configurar os Secrets do GitHub

Vá em `Settings → Secrets and variables → Actions → New repository secret`

| # | Nome | Valor |
|---|---|---|
| 1 | `HOSTINGER_HOST` | `89.116.115.227` |
| 2 | `HOSTINGER_USERNAME` | `u222240285` |
| 3 | `HOSTINGER_PASSWORD` | (sua senha FTP) |
| 4 | `HOSTINGER_TARGET_PATH` | `/domains/deliveryfood.elitesistemas.io/public_html` |
| 5 | `HOSTINGER_DOMAIN` | `deliveryfood.elitesistemas.io` |
| 6 | `DATABASE_URL` | URL do Neon (passo 1.2) |
| 7 | `AUTH_SECRET` | `openssl rand -base64 32` |
| 8 | `ASAAS_API_KEY` | Chave sandbox Asaas |
| 9 | `EVOLUTION_API_URL` | `http://evolution-api:8080` (opcional) |
| 10 | `EVOLUTION_API_KEY` | (sua chave Evolution API) |
| 11 | `EVOLUTION_INSTANCE` | `delicias` |

---

## 📐 Passo 4 — Workflow do GitHub Actions

Arquivo: `.github/workflows/deploy-hostinger.yml`

```yaml
name: Deploy to Hostinger Business
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - run: npm ci --no-audit --no-fund
      - run: npx prisma generate

      - name: Build Next.js standalone
        run: |
          NODE_PATH=$(pwd)/node_modules NODE_OPTIONS="--max-old-space-size=6144" npm run build
        env:
          DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
          AUTH_SECRET: "build-time-placeholder"

      # Empacotar
      - name: Pack
        run: |
          mkdir -p deploy-bundle
          cp -r .next/standalone/* deploy-bundle/
          mkdir -p deploy-bundle/.next/static
          cp -r .next/static/* deploy-bundle/.next/static/
          cp -r public/* deploy-bundle/ 2>/dev/null || true
          echo '{"name":"delicias","scripts":{"start":"NODE_ENV=production node server.js"}}' > deploy-bundle/package.json

      # Criar .env a partir de secrets
      - name: Create .env
        run: |
          cat > deploy-bundle/.env <<EOF
          DATABASE_URL="${{ secrets.DATABASE_URL }}"
          AUTH_SECRET="${{ secrets.AUTH_SECRET }}"
          AUTH_TRUST_HOST=true
          NEXTAUTH_URL=https://${{ secrets.HOSTINGER_DOMAIN }}
          NODE_ENV=production
          PORT=3000
          ASAAS_ENV=sandbox
          ASAAS_API_KEY=${{ secrets.ASAAS_API_KEY }}
          EVOLUTION_API_URL=${{ secrets.EVOLUTION_API_URL }}
          EVOLUTION_API_KEY=${{ secrets.EVOLUTION_API_KEY }}
          EVOLUTION_INSTANCE=${{ secrets.EVOLUTION_INSTANCE }}
          EOF

      # Enviar via SFTP (substituir por FTPS no Hostinger Business)
      - name: Upload via SFTP
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.HOSTINGER_HOST }}
          username: ${{ secrets.HOSTINGER_USERNAME }}
          password: ${{ secrets.HOSTINGER_PASSWORD }}
          port: 22
          target: ${{ secrets.HOSTINGER_TARGET_PATH }}
          source: "deploy-bundle/*"
          rm: true
```

⚠️ **Nota**: este workflow usa SFTP (porta 22). Se sua Hostinger Business **só permitir FTP porta 21**, troque o appleboy/scp-action por uma action FTPS ou use `lftp`:

```yaml
      - name: Upload via FTPS
        run: |
          apt-get update && apt-get install -y lftp
          lftp -u "${{ secrets.HOSTINGER_USERNAME }},${{ secrets.HOSTINGER_PASSWORD }}" \
               -e "set ssl:verify-certificate no; mirror -R ./deploy-bundle/ ${{ secrets.HOSTINGER_TARGET_PATH }}/; quit" \
               ftps://${{ secrets.HOSTINGER_HOST }}
```

---

## 📐 Passo 5 — Configurar DNS

⚠️ **IMPORTANTE**: O domínio `elitesistemas.io` deve estar registrado em algum provedor (Namecheap, GoDaddy, etc) — NÃO na Hostinger.

### 5.1 Adicionar Registro A no provedor do domínio

No painel do provedor onde `elitesistemas.io` está registrado:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `deliveryfood` | `89.116.115.227` | 3600 |

Espera **15 minutos a 24h** pra propagar.

### 5.2 Testar

```powershell
ping deliveryfood.elitesistemas.io
```

Deve resolver pra `89.116.115.227`.

---

## 📐 Passo 6 — Configurar Hostinger Business

### 6.1 Criar o subdomínio

1. hPanel → **Hospedagem** → seu plano → **Subdomínios**
2. **Criar subdomínio**:
   - Nome: `deliveryfood`
   - Domínio: `elitesistemas.io`
   - Pasta: `public_html`
3. Salvar

⚠️ Se aparecer erro "domínio não aponta pros nameservers da Hostinger", significa que você NÃO precisa fazer isso aqui — só precisa do DNS A record (Passo 5.1).

### 6.2 Resetar senha FTP

1. hPanel → **FTP** → **Contas FTP**
2. Conta `u222240285` → **Alterar senha**
3. Definir senha forte
4. Salvar

### 6.3 Configurar Node.js App

⚠️ Esta funcionalidade pode não existir em planos Business antigos. Se não tiver, **PULAR esta etapa — o arquivo `server.js` no root pode ser suficiente (Apache/Nginx do Hostinger serve como proxy).

1. hPanel → **Hospedagem** → **Avançado** → **Node.js**
2. **Criar aplicação**:
   - Versão Node: 22
   - Modo: Production
   - Startup file: `server.js`
   - Pasta: `/domains/deliveryfood.elitesistemas.io/public_html`
3. Variáveis de ambiente (no painel):
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `AUTH_TRUST_HOST=true`
   - `NEXTAUTH_URL=https://deliveryfood.elitesistemas.io`
   - `NODE_ENV=production`
   - `PORT=3000`
   - `ASAAS_ENV=sandbox`
   - `ASAAS_API_KEY=...`
4. **Iniciar / Reiniciar**

---

## 📐 Passo 7 — Upload Inicial (se não foi feito pelo GitHub Actions)

### 7.1 Conectar por FTP

Use **FileZilla**:

```
Host: 89.116.115.227
Username: u222240285
Password: (senha do passo 6.2)
Port: 21
TLS: ON
```

### 7.2 Upload do ZIP

Lado esquerdo → `B:\Projetos Open Code\delivery-food\dist\delicias-deploy.zip`
Lado direito → `/domains/deliveryfood.elitesistemas.io/public_html/`

Arrastar o ZIP pra lá.

### 7.3 Extrair ZIP via hPanel

1. hPanel → **Gerenciador de arquivos**
2. Vá em `/domains/deliveryfood.elitesistemas.io/public_html/`
3. Botão direito no `delicias-deploy.zip` → **Extrair / Extract**
4. Os arquivos vão aparecer na mesma pasta:

```
public_html/
├── server.js
├── package.json
├── .env
├── .next/
├── node_modules/
└── public/
```

---

## 📐 Passo 8 — Testar o Site

Aguarde 1-2 minutos pra Hostinger processar.

Abra: **https://deliveryfood.elitesistemas.io**

Deve aparecer:
- ✅ Tela inicial do cardápio
- ❌ Erro 502/503: reinicie o Node.js App no hPanel
- ❌ Erro de banco: confira `DATABASE_URL` no hPanel

---

## 📐 Passo 9 — Próximas Atualizações (deploy automático)

Depois da primeira vez, todo `git push origin main`:

```
Você edita código
       ↓
git add . && git commit -m "feat: melhoria X"
       ↓
git push origin main
       ↓
GitHub Actions dispara
       ↓
Build + upload automático
       ↓
Site atualiza em 3-5 minutos
```

---

## 🆘 Problemas Comuns

### Erro "Cannot find module 'server.js'"
Faltou extrair o ZIP. Volte ao passo 7.3.

### Erro "ECONNREFUSED" ou "Connection refused"
- Banco Neon offline (raro) — verifique console
- DATABASE_URL errada no `.env`

### Erro 500 imediato após deploy
Abra hPanel → Node.js App → **Logs**. Procure stack trace.

### FTP: "530 Login incorrect"
Resetar senha FTP (passo 6.2).

### DNS não resolve
Verificar:
```powershell
nslookup deliveryfood.elitesistemas.io
```
Deve retornar `89.116.115.227`.

---

## 📂 Estrutura Final no Servidor

```
/home/u222240285/
└── domains/
    └── deliveryfood.elitesistemas.io/
        └── public_html/
            ├── server.js                  ← entry point
            ├── package.json               ← "start": "node server.js"
            ├── .env                       ← banco + secrets
            ├── .next/
            │   ├── standalone/            ← código compilado
            │   └── static/                ← CSS, JS, imagens
            └── node_modules/              ← deps do standalone
```

---

## 💰 Custos Mensais

| Item | Custo |
|---|---|
| Hostinger Business Web | ~R$ 30/mês |
| Neon DB Free | R$ 0 (até 512 MB, depois plano pago) |
| Domínio `.io` | ~R$ 15/mês (renovação anual) |
| GitHub Actions | R$ 0 (até 2000 min/mês) |
| **Total** | **~R$ 45/mês** |

---

## 🏁 Resumo: 1 página

| Etapa | O que fazer |
|---|---|
| 1 | Neon: criar projeto `deliveryfood`, copiar URL |
| 2 | GitHub: criar repo `DeliveryFood`, push do código |
| 3 | Secrets: 5 do Hostinger + 4 opcionais (Neon, Auth, Asaas, Evolution) |
| 4 | Workflow: YAML em `.github/workflows/deploy-hostinger.yml` |
| 5 | DNS: Registro A `deliveryfood` → `89.116.115.227` |
| 6 | Hostinger: criar subdomínio + resetar FTP + Node.js App |
| 7 | Upload: ZIP manual ou via GitHub Actions |
| 8 | Testar o site |
| 9 | Próximas: `git push` atualiza sozinho |

---

**Versão**: 1.0  
**Data**: Outubro 2026  
**Mantenedor**: Dilson (Elite Sistemas)
