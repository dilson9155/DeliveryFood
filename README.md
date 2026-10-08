# 🍔 Delicias das Estações

> Sistema completo de **delivery de comida** com cardápio digital,
> gestão de pedidos, **delivery tracking em tempo real** (estilo iFood)
> e painel administrativo. Construído com Next.js 16 + Prisma + PostgreSQL.

[![Status](https://img.shields.io/badge/status-em%20produ%C3%A7%C3%A3o-green)]()
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://typescriptlang.org)

---

## ✨ Funcionalidades

### 👥 Cliente (loja)
- Cardápio com categorias
- Carrinho persistente (Zustand)
- Checkout com **escolha entre Retirada ou Entrega**
- Múltiplos endereços salvos (geocoding automático via Nominatim/OSM)
- Cálculo de frete por distância (Haversine + fórmula configurável)
- Pedidos com **rastreamento em tempo real** (mapa com Leaflet)
- Pedir de novo (1-click reorders)
- Observação padrão salva no perfil
- Notificações de status (cliente + estabelecimento)

### 🛵 Motoboy
- Painel dedicado `/entregador`
- Lista de entregas atribuídas
- Iniciar rota / confirmar entrega / reportar falha
- **Compartilhamento de localização em tempo real** (10s)
- Mapa da loja → cliente com posição do motoboy e rota percorrida
- Contato direto (telefone + WhatsApp)

### 🛠️ Admin
- Dashboard
- Board de pedidos estilo Kanban (com polling de 3s, som de novo pedido, ações inline)
- **Desconto de finalização** não-fiscal (cortesia, avaria, promoção etc.)
- Board de entregas com atribuição de motoboy
- CRUD de produtos, categorias, clientes, motoboys
- Caixa (abertura/fechamento + movimentações)
- Relatórios
- Notificações
- Configurações (loja, horários, taxa de entrega, WhatsApp)

### 📲 Notificações WhatsApp
- Via **Evolution API** (open-source, self-hosted, sem custo)
- Templates bonitos e centralizados
- Dispara em: pedido recebido, confirmado, em preparo, pronto,
  saiu para entrega, entregue, cancelado
- Adicionalmente: notificação ao motoboy quando recebe uma entrega
- **Não-fatal**: se Evolution API estiver off, o sistema continua funcionando

---

## 🚀 Stack

| Camada | Tecnologia |
|--------|------------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Linguagem | TypeScript (strict) |
| UI | Tailwind CSS 4 + Lucide Icons |
| Banco | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | NextAuth v5 (JWT) |
| Validação | Zod |
| Mapa | Leaflet + OpenStreetMap (grátis, sem token) |
| Geocoding | Nominatim (OSM) |
| Estado | Zustand (carrinho) + Server Actions + Server Components |
| Deploy | Docker + Docker Compose + Nginx + Let's Encrypt |

---

## 🏗️ Arquitetura

```
┌──────────────────────────────────────────┐
│              Browser (cliente)          │
│   React Server Components + Zustand      │
└─────────────┬────────────────────────────┘
              │ HTTPS
              ▼
┌──────────────────────────────────────────┐
│     Nginx (reverse proxy + SSL/HSTS)     │
└─────────────┬────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────┐
│   Next.js (Node 20, standalone build)    │
│  • Server Actions (mutations)            │
│  • Route Handlers (REST)                 │
│  • React Server Components               │
└─────────┬───────────────┬────────────────┘
          │               │
          ▼               ▼
┌─────────────────┐  ┌──────────────────┐
│   PostgreSQL    │  │  Nominatim (OSM) │
│   (Prisma)      │  │  (geocoding)     │
└─────────────────┘  └──────────────────┘
```

---

## 📦 Setup local

### Pré-requisitos

- Node.js 20+
- PostgreSQL 16 (pode ser local ou via Docker)

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar `.env`

```bash
cp .env.example .env
# edite DATABASE_URL, AUTH_SECRET e NEXTAUTH_URL
```

### 3. Subir o banco (Docker)

```bash
docker run -d --name delicias-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=delicias \
  -p 5432:5432 \
  postgres:16-alpine
```

### 4. Aplicar migrations + popular

```bash
npx prisma migrate deploy
npx prisma db seed
```

### 5. Rodar dev server

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

### Credenciais padrão

**Admin**
- Login: `admin`
- Senha: `admin123` ⚠️ troque imediatamente

**Cliente demo**
- Telefone: `(31) 98888-8888`
- Senha: `cliente123`

---

## 🚀 Deploy em produção

### 🔹 VPS / Docker (Hostinger VPS, Cloud, AWS, etc.)

```bash
cd /opt/delicias
git clone https://github.com/dilson9155/Delivery-Food.git .
cp .env.example .env  # edite com seus valores
docker compose up -d --build
```

### 🔹 Hospedagem compartilhada (Hostinger Business)

Veja [DEPLOY_HOSTINGER.md](./DEPLOY_HOSTINGER.md) — guia SFTP + GitHub Actions.

1. Crie conta grátis no [Neon](https://neon.tech) (Postgres)
2. Configure 5 Secrets no GitHub (Settings → Secrets → Actions):
   - `HOSTINGER_HOST`, `HOSTINGER_USERNAME`, `HOSTINGER_PASSWORD`
   - `HOSTINGER_TARGET_PATH`, `HOSTINGER_DOMAIN`
3. Crie `.env` na Hostinger via File Manager (com Neon `DATABASE_URL`)
4. Cada push na `main` = deploy automático via GitHub Actions

---

## 🧪 Scripts úteis

```bash
npm run dev          # Dev server (Turbopack)
npm run build        # Build de produção (standalone)
npm run start        # Roda o build de produção
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run db:migrate   # Cria e aplica migration em dev
npm run db:deploy    # Aplica migrations em produção
npm run db:seed      # Popula o banco com dados de exemplo
npm run db:studio    # GUI do Prisma para o banco
```

---

## 📂 Estrutura

```
delivery-food/
├── prisma/
│   ├── schema.prisma         # Schema com 14 models (pedidos, delivery, motoboy, etc.)
│   ├── seed.ts               # Dados iniciais
│   └── migrations/           # Histórico de migrations
├── src/
│   ├── app/
│   │   ├── (auth)/           # /login, /cadastro, /esqueci-senha
│   │   ├── (store)/          # /, /pedido/[id], /checkout, /meus-pedidos, /meus-dados
│   │   ├── admin/            # /admin/dashboard, /pedidos, /delivery, /entregadores, ...
│   │   ├── entregador/       # /entregador (painel do motoboy)
│   │   ├── api/              # Endpoints REST
│   │   └── actions/          # Server Actions (mutations)
│   ├── components/
│   │   ├── admin/            # Componentes do painel admin
│   │   ├── store/            # Componentes da loja
│   │   ├── delivery/         # Mapa, painel do motoboy
│   │   ├── auth/             # Formulários de login/cadastro
│   │   └── ui/               # Componentes base (Button, Card, Input, ...)
│   ├── lib/
│   │   ├── auth.ts           # Configuração NextAuth
│   │   ├── prisma.ts         # Cliente Prisma singleton
│   │   ├── permissions.ts    # RBAC
│   │   ├── geo.ts            # Haversine, geocoding (Nominatim)
│   │   ├── delivery.ts       # Helpers de entrega (taxa, ETA, origin)
│   │   └── ...               # outras libs
│   ├── stores/
│   │   └── cart.ts           # Estado global do carrinho (Zustand)
│   └── types/
│       └── next-auth.d.ts    # Tipos do NextAuth
├── docker-compose.yml        # Produção: app + Postgres
├── Dockerfile                # Build multi-stage
├── .dockerignore
├── .env.example              # Template de variáveis
├── DEPLOY_HOSTINGER.md       # Guia detalhado de deploy
└── README.md                 # Este arquivo
```

---

## 🗺️ Roadmap (próximas features)

- [ ] Integração PIX automática (OpenPix / Mercado Pago)
- [ ] Notificações push (Web Push)
- [ ] PWA (instalável no celular)
- [ ] Impressão automática de pedido na cozinha (Bluetooth)
- [ ] Sistema de cupons / promoções
- [ ] Avaliação pós-pedido
- [ ] Chat cliente ↔ motoboy

---

## 📝 Licença

MIT — use como quiser.

---

## 🤝 Suporte

- 🐛 Bugs e features: abra uma [issue no GitHub](https://github.com/SEU_USUARIO/delicias-das-estacoes/issues)
- 📖 Deploy: veja [DEPLOY_HOSTINGER.md](./DEPLOY_HOSTINGER.md)

---

Desenvolvido com ☕ por **Delicias das Estações**.<!-- last-deploy: trigger Vercel rebuild -->
