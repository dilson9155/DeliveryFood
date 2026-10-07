# 🍔 PROMPT COMPLETO DO SISTEMA — Delícias das Estações

> **Descrição detalhada** do sistema "Delícias das Estações" — plataforma completa de delivery de comida com gestão integrada. Use este documento como briefing para recriação, integração com novos devs, ou传承 团队.
>
> **Versão**: 1.0  
> **Data**: Outubro 2026  
> **Status**: Em produção em https://deliveryfood.elitesistemas.io

---

## 🎯 VISÃO GERAL DO NEGÓCIO

### O que é

**Delícias das Estações** é um SaaS de gestão para restaurantes e lanchonetes que fazem **delivery próprio** (com motoboys próprios, não usando iFood/Rappi). O sistema:

1. **Vende online** (cardápio digital, carrinho, checkout)
2. **Gerencia pedidos** (admin cozinha, motoboy, controle de status)
3. **Rastreia entregas em tempo real** (mapa com GPS do motoboy)
4. **Controla o financeiro** (caixa, contas a pagar/receber, parcelas)
5. **Gerencia clientes** (cadastro com CPF/CNPJ, endereço completo)
6. **Integra pagamento PIX** via Asaas
7. **Notifica via WhatsApp** em cada etapa

### Diferencial vs concorrência

| Funcionalidade | iFood | Rappi | **Delícias** |
|---|---|---|---|
| Loja online | ✅ | ✅ | ✅ |
| Gestão de motoboys próprios | ❌ | ❌ | ✅ |
| Rastreamento em tempo real | básico | básico | ✅ (Leaflet) |
| Painel admin completo | ❌ | ❌ | ✅ |
| Módulo financeiro | ❌ | ❌ | ✅ (DRE, fluxo de caixa, parcelas) |
| Impressão térmica | ❌ | ❌ | ✅ (58/76/80mm + A4) |
| Relatórios gerenciais | ❌ | básico | ✅ (6 relatórios completos) |
| Descontos manuais não-fiscais | ❌ | ❌ | ✅ (cortesia, avaria) |
| **Donos dos dados** | iFood | Rappi | **Você** (banco próprio) |

### Público-alvo

- Pequenos/médios restaurantes de comida por delivery
- Lanchonetes com motoboy próprio
- Donos que querem fugir da comissão de 12-27% do iFood

---

## 👥 ATORES / ROLES DO SISTEMA

O sistema tem **5 perfis de usuário** com permissões granulares (RBAC):

| Role | Descrição | Acesso |
|---|---|---|
| **ADMIN** | Dono do restaurante | TUDO |
| **MANAGER** | Gerente da loja | Quase tudo, exceto financeiro sensível |
| **CASHIER** | Operador de caixa | Pedidos + caixa + clientes |
| **KITCHEN** | Cozinha | Apenas gerenciamento de pedidos (receber, preparar) |
| **DELIVERY** | Motoboy | Painel próprio + tracking do GPS durante entregas |
| **CUSTOMER** | Cliente final | Loja + carrinho + checkout + status do pedido |

---

## 🏗️ ARQUITETURA TÉCNICA

### Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js | 16 (App Router) |
| Linguagem | TypeScript | 5.x (strict mode) |
| UI | React | 19 |
| Estilização | Tailwind CSS | 4.x |
| Componentes | shadcn/ui + Radix | latest |
| ORM | Prisma | 6.x |
| Banco | PostgreSQL (Neon) | 16 |
| Auth | NextAuth (Auth.js) | v5 (beta) |
| Validação | Zod | 3.x |
| Estado cliente | Zustand | 4.x |
| Mapa | Leaflet + OpenStreetMap | 1.9.x |
| Geocoding | Nominatim | API pública |
| Pagamento | Asaas SDK | 1.x |
| WhatsApp | Evolution API | self-hosted |
| PDF | jsPDF | 2.x |
| QR Code | qrcode | 1.x |
| Email | Nodemailer | 6.x |

### Estrutura de pastas

```
delivery-food/
├── prisma/
│   ├── schema.prisma          # 70+ models
│   ├── migrations/            # 14 migrations
│   └── seed.ts                # Admin + cliente demo + 15 produtos
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (admin)/          # Rotas admin (protegidas)
│   │   │   ├── dashboard/
│   │   │   ├── orders/
│   │   │   ├── products/
│   │   │   ├── customers/
│   │   │   ├── delivery/
│   │   │   ├── finance/
│   │   │   ├── reports/
│   │   │   └── settings/
│   │   ├── (shop)/           # Loja pública
│   │   ├── (delivery)/       # Painel motoboy
│   │   ├── api/              # ~40 endpoints REST
│   │   │   ├── auth/
│   │   │   ├── webhooks/
│   │   │   ├── orders/
│   │   │   ├── payments/
│   │   │   └── ...
│   │   └── auth/             # Login/signup
│   ├── components/           # ~50 componentes React
│   │   ├── ui/               # shadcn primitives
│   │   ├── admin/
│   │   ├── shop/
│   │   └── shared/
│   ├── lib/                  # Utilitários
│   │   ├── auth.ts           # NextAuth config
│   │   ├── prisma.ts         # Singleton Prisma
│   │   ├── asaas.ts          # Integração pagamento
│   │   ├── whatsapp.ts       # Evolution API
│   │   ├── finance.ts        # Cálculos DRE
│   │   ├── pdf.ts            # Geração PDFs
│   │   └── ...
│   ├── stores/
│   │   └── cart.ts           # Zustand store
│   ├── proxy.ts              # Next.js 16 middleware
│   └── types/
├── public/                   # Imagens, fontes
├── scripts/
│   ├── build-standalone.js   # Build custom
│   └── package-deploy.js     # Empacotamento
├── .github/workflows/        # CI/CD
├── docker-compose.yml        # Postgres dev local
├── Dockerfile
└── package.json
```

---

## 📦 MODELOS DE DADOS (Prisma Schema — 70+ models)

### 1. Identidade & Usuários

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  password      String   // bcrypt
  role          UserRole // ADMIN | MANAGER | CASHIER | KITCHEN | DELIVERY | CUSTOMER
  phone         String?
  taxId         String?  // CPF ou CNPJ
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  // Relations: addresses, orders (cliente), deliveries (motoboy)
}

model Address {
  id          String  @id @default(cuid())
  userId      String
  user        User    @relation(...)
  street      String
  number      String
  complement  String?
  neighborhood String
  city        String
  state       String
  zipCode     String
  // Geo: lat, lng (Nominatim reverse)
  isDefault   Boolean @default(false)
}
```

### 2. Catálogo

```prisma
model Category {
  id        String    @id @default(cuid())
  name      String
  slug      String    @unique
  icon      String?
  order     Int       @default(0)
  active    Boolean   @default(true)
  products  Product[]
}

model Product {
  id          String   @id @default(cuid())
  categoryId  String
  category    Category @relation(...)
  name        String
  description String?
  price       Decimal  @db.Decimal(10, 2)
  cost        Decimal? @db.Decimal(10, 2) // CMV
  imageUrl    String?
  available   Boolean  @default(true)
  isHighlight Boolean  @default(false)
  preparationTime Int? // minutos
  // Many-to-many com AddonGroup
  orderItems  OrderItem[]
}

model AddonGroup {
  id        String  @id @default(cuid())
  name      String
  required  Boolean @default(false)
  min       Int     @default(0)
  max       Int     @default(1)
  products  Product[] @relation("ProductAddonGroups")
  options   AddonOption[]
}

model AddonOption {
  id            String @id @default(cuid())
  addonGroupId  String
  name          String
  price         Decimal @db.Decimal(10, 2)
}
```

### 3. Pedidos (core)

```prisma
enum OrderStatus {
  PENDING        // Criado, aguardando pagamento
  PAID           // PIX confirmado
  PREPARING      // Cozinha preparando
  READY          // Pronto p/ entrega ou retirada
  OUT_FOR_DELIVERY  // Com motoboy
  DELIVERED      // Entregue
  CANCELLED      // Cancelado
}

enum OrderType {
  DELIVERY    // Entrega no endereço
  PICKUP      // Retirada no balcão
  DINE_IN     // Comer no local
}

model Order {
  id            String   @id @default(cuid())
  customerId    String
  customer      User     @relation("CustomerOrders", ...)
  type          OrderType
  status        OrderStatus @default(PENDING)
  
  // Valores
  subtotal      Decimal  @db.Decimal(10, 2)
  deliveryFee   Decimal  @db.Decimal(10, 2) @default(0)
  discount      Decimal  @db.Decimal(10, 2) @default(0)
  total         Decimal  @db.Decimal(10, 2)
  
  // Entrega
  addressId     String?
  deliveryId    String?  // relação com Delivery
  estimatedTime DateTime?
  deliveredAt   DateTime?
  
  // Pagamento
  paymentIntentId String? @unique
  paidAt        DateTime?
  
  // Observações
  notes         String?
  internalNotes String? // Visível só pro staff
  
  // Desconto não-fiscal
  nonFiscalDiscount Decimal? @db.Decimal(10, 2)
  nonFiscalReason   String? // "Cortesia", "Avaria", "Ação comercial"
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  items     OrderItem[]
  timeline  OrderTimeline[]
}

model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  order     Order   @relation(...)
  productId String
  product   Product @relation(...)
  quantity  Int
  unitPrice Decimal @db.Decimal(10, 2)
  total     Decimal @db.Decimal(10, 2)
  notes     String?
  addons    OrderItemAddon[]
}

model OrderItemAddon {
  id            String @id @default(cuid())
  orderItemId   String
  addonOptionId String
  price         Decimal @db.Decimal(10, 2)
}

model OrderTimeline {
  id        String   @id @default(cuid())
  orderId   String
  status    OrderStatus
  notes     String?
  createdAt DateTime @default(now())
  createdBy String?  // User que mudou
}

model BusinessHour {
  id        String   @id @default(cuid())
  dayOfWeek Int      // 0=domingo ... 6=sábado
  openTime  String   // "18:00"
  closeTime String   // "23:00"
  isClosed  Boolean  @default(false)
}
```

### 4. Delivery / Motoboys

```prisma
model Delivery {
  id          String   @id @default(cuid())
  orderId     String   @unique
  order       Order    @relation(...)
  driverId    String
  driver      User     @relation("DriverDeliveries", ...)
  status      DeliveryStatus // ASSIGNED | PICKED_UP | IN_TRANSIT | DELIVERED
  pickedUpAt  DateTime?
  deliveredAt DateTime?
  
  // Tracking
  currentLat  Decimal? @db.Decimal(10, 8)
  currentLng  Decimal? @db.Decimal(11, 8)
  lastLocationUpdate DateTime?
  
  notes       String?
  createdAt   DateTime @default(now())
}

enum DeliveryStatus {
  ASSIGNED    // Atribuído
  PICKED_UP   // Pegou o pedido
  IN_TRANSIT   // A caminho
  DELIVERED   // Entregue
  FAILED      // Falhou (cliente ausente, etc)
}
```

### 5. Pagamentos (Asaas)

```prisma
model PaymentIntent {
  id            String   @id @default(cuid())
  orderId       String   @unique
  order         Order    @relation(...)
  
  asaasPaymentId String  @unique // pay_xxxxx
  status        PaymentStatus // PENDING | CONFIRMED | RECEIVED | OVERDUE | REFUNDED
  
  // QR Code PIX
  qrCodePayload   String? // código PIX copia-cola
  qrCodeImageUrl  String? // URL da imagem
  
  // Valores
  amount       Decimal  @db.Decimal(10, 2)
  
  expiresAt    DateTime?
  paidAt       DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  events PaymentEvent[]
}

model PaymentEvent {
  id        String @id @default(cuid())
  paymentIntentId String
  type      String // PAYMENT_CREATED | PAYMENT_RECEIVED | etc
  payload   Json
  receivedAt DateTime @default(now())
}

enum PaymentStatus {
  PENDING
  CONFIRMED
  RECEIVED
  OVERDUE
  REFUNDED
  FAILED
}
```

### 6. Financeiro

```prisma
enum AccountType {
  PAYABLE    // A pagar
  RECEIVABLE // A receber
}

model Account {
  id          String      @id @default(cuid())
  type        AccountType
  description String
  amount      Decimal     @db.Decimal(10, 2)
  paid        Boolean     @default(false)
  dueDate     DateTime
  paidAt      DateTime?
  category    String?     // Fixo: Aluguel, Energia, Fornecedor | Variável: ...
  
  // Origem
  source      String?     // "manual" | "order:123" | "payroll:5" | ...
  sourceId    String?
  
  // Anexos
  attachmentUrl String?
  
  // Parcelamento
  installmentId String?
  installment   Installment? @relation(...)
  installmentNumber Int?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([type, dueDate])
  @@index([paid])
}

model Installment {
  id        String  @id @default(cuid())
  totalAmount Decimal @db.Decimal(12, 2)
  totalInstallments Int
  startDate DateTime
  description String
  // relations: accounts[]
}

enum InstallmentStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}
```

### 7. Impressão / Templates

```prisma
model PrintTemplate {
  id        String  @id @default(cuid())
  name      String
  paperSize PaperSize // THERMAL_58 | THERMAL_76 | THERMAL_80 | A4 | LETTER
  type      PrintTemplateType // ORDER | RECEIPT | REPORT
  content   String  // HTML template
  isDefault Boolean @default(false)
}

enum PaperSize { THERMAL_58 THERMAL_76 THERMAL_80 A4 LETTER }

enum PrintTemplateType { ORDER RECEIPT REPORT }
```

### 8. WhatsApp (log)

```prisma
model WhatsAppLog {
  id        String  @id @default(cuid())
  to        String  // telefone destino
  message   String
  status    String  // SENT | FAILED | DELIVERED
  error     String?
  relatedType String? // ORDER | DELIVERY | etc
  relatedId   String?
  sentAt    DateTime @default(now())
}
```

---

## 🔄 FLUXOS PRINCIPAIS

### Fluxo 1 — Cliente faz pedido (DELIVERY)

```
Visitante acessa https://deliveryfood.elitesistemas.io
        ↓
Vê cardápio (público, sem login)
        ↓
Adiciona produtos ao carrinho (Zustand persiste em localStorage)
        ↓
Clica "Finalizar pedido"
        ↓
[Se não logado] → Modal de login/cadastro (NextAuth)
        ↓
Coleta endereço (autocomplete via Nominatim)
        ↓
Escolhe forma de pagamento: PIX (único por enquanto)
        ↓
Sistema cria Order (status=PENDING) + PaymentIntent (Asaas)
        ↓
Asaas retorna QR Code PIX
        ↓
Cliente paga (no próprio app ou outro banco)
        ↓
Asaas → webhook /api/webhooks/asaas
        ↓
Webhook atualiza PaymentIntent.status = RECEIVED
        ↓
Order.status = PAID
        ↓
Sistema dispara WhatsApp p/ cozinha: "Novo pedido #1234"
        ↓
Admin vê pedido no painel (status PAID → PREPARING)
        ↓
Admin atribui motoboy
        ↓
Order.status = OUT_FOR_DELIVERY
        ↓
Motoboy compartilha GPS (a cada 30s)
        ↓
Cliente acompanha no mapa em tempo real
        ↓
Motoboy confirma entrega
        ↓
Order.status = DELIVERED
        ↓
WhatsApp p/ cliente: "Obrigado pela preferência!"
```

### Fluxo 2 — Admin gerencia pedido

```
Admin entra em /admin/orders
        ↓
Vê Kanban por status (PENDING, PAID, PREPARING, READY, OUT_FOR_DELIVERY, DELIVERED)
        ↓
Clica em pedido PAID → modal com detalhes
        ↓
[Botão] Iniciar preparo (status → PREPARING)
        ↓
Cozinha vê notificação, prepara
        ↓
[Botão] Marcar como pronto (status → READY)
        ↓
[Se DELIVERY] Atribuir motoboy (combobox, busca usuários com role=DELIVERY)
        ↓
[Botão] Despachar (status → OUT_FOR_DELIVERY)
        ↓
Sistema notifica cliente com link de mapa
        ↓
[Botão] Confirmar entrega (status → DELIVERED, registra deliveredAt)
```

### Fluxo 3 — Motoboy compartilha localização

```
Motoboy entra em /delivery (login com sua conta de role DELIVERY)
        ↓
Vê lista de entregas pendentes (ORDER.status=OUT_FOR_DELIVERY + driverId=eu)
        ↓
Clica em "Iniciar entrega"
        ↓
App pede permissão de geolocalização (browser API)
        ↓
A cada 30s, envia POST /api/delivery/:id/location {lat, lng}
        ↓
Cliente vê bolinha do motoboy se mover no mapa
        ↓
[Botão] "Confirmar entrega"
        ↓
Sistema atualiza Delivery.status=DELIVERED
        ↓
Admin vê mudança no Kanban em tempo real (refetch a cada 10s)
```

### Fluxo 4 — Admin registra conta a pagar

```
Admin entra em /admin/finance/payables
        ↓
Clica "Nova conta"
        ↓
Formulário: descrição, valor, vencimento, categoria, anexo (opcional)
        ↓
[Checkbox] "Parcelar"
   Se sim: número de parcelas + intervalo (mensal)
        ↓
Salva → gera N Accounts (N = parcelas) com installmentId comum
        ↓
Sistema mostra no dashboard "Contas vencendo em 5 dias: R$ X"
        ↓
[Dia do vencimento] Status muda para OVERDUE (cron job ou na leitura)
        ↓
[Botão] Marcar como pago (registra paidAt, paid=true)
```

### Fluxo 5 — Webhook Asaas

```
Cliente paga PIX no banco dele
        ↓
Asaas recebe o pagamento
        ↓
Webhook dispara POST https://deliveryfood.elitesistemas.io/api/webhooks/asaas
        ↓
Body: { event: "PAYMENT_RECEIVED", payment: { id: "pay_xxx", ... } }
        ↓
Sistema valida assinatura do webhook (header x-asaas-signature)
        ↓
Encontra PaymentIntent pelo asaasPaymentId
        ↓
Atualiza status = RECEIVED, paidAt = now
        ↓
Recursivamente: Order.status = PAID
        ↓
Dispara WhatsApp + cria eventos no OrderTimeline
        ↓
Retorna 200 (Asaas aguarda ack)
```

---

## 📊 MÓDULOS DETALHADOS

### Módulo 1 — Loja Pública (Cardápio Digital)

**Rota**: `/` (qualquer visitante)

#### Páginas:
- `/` — Home com categorias + produtos em destaque
- `/categoria/[slug]` — Listagem filtrada
- `/produto/[id]` — Detalhe do produto + addons
- `/carrinho` — Revisão antes do checkout (Zustand store)
- `/checkout` — Login/cadastro → endereço → pagamento
- `/pedido/[id]` — Status do pedido (público via token)

#### Funcionalidades:
- ✅ Cardápio responsivo (mobile-first)
- ✅ Filtros por categoria + busca
- ✅ Addons obrigatórios/opcionais por produto (radio/checkbox)
- ✅ Carrinho persistente em localStorage
- ✅ Cálculo automático de frete (se DELIVERY)
- ✅ Tempo estimado de preparo (BusinessHour + Product.preparationTime)
- ✅ Checkout simplificado p/ clientes recorrentes
- ✅ Página de status com mapa em tempo real

### Módulo 2 — Painel Admin

**Rota**: `/admin/*` (require role: ADMIN/MANAGER/CASHIER/KITCHEN)

#### Sub-módulos:

**2.1 Dashboard** (`/admin`)
- KPI cards: vendas hoje, pedidos pendentes, ticket médio, saldo
- Gráfico de vendas últimos 7 dias
- Pedidos recentes
- Contas a pagar/receber próximas

**2.2 Pedidos** (`/admin/orders`)
- Kanban com 6 colunas (status)
- Filtros: data, status, tipo, motoboy
- Detalhe modal: items, cliente, histórico, ações
- Ações rápidas por status
- Imprimir (templates térmicos)

**2.3 Produtos** (`/admin/products`)
- Tabela com categorias
- CRUD completo (criar, editar, desativar)
- Imagem (upload local ou URL)
- CMV (custo) — usado em relatórios de lucro
- Addons vinculados (add/remove groups)

**2.4 Categorias** (`/admin/categories`)
- CRUD com reorder (drag handle)
- Ícones (emoji ou Font Awesome)

**2.5 Clientes** (`/admin/customers`)
- Lista com busca por nome/CPF/telefone
- Detalhe: histórico de pedidos, gasto total, endereço padrão
- Top 10 clientes por valor

**2.6 Motoboys** (`/admin/delivery`)
- Lista de usuários role=DELIVERY
- Status (livre, em entrega)
- Histórico de entregas por motoboy
- Avaliação média (1-5)

**2.7 Caixa** (`/admin/cashier`)
- Abertura/fechamento de caixa (turno)
- Resumo: vendas PIX, retiradas, cancelamentos
- Sangria (retirada de valor), Suprimento (entrada)
- Relatório imprimível do fechamento

**2.8 Financeiro** (`/admin/finance`)
- 3 abas: Dashboard, Payables, Receivables
- Dashboard: gráfico de fluxo de caixa (entradas vs saídas)
- Filtros: mês, categoria, status
- Formulário "Nova conta" com parcelamento
- Reconciliação (marcar como pago)

**2.9 Relatórios** (`/admin/reports`)
- 6 relatórios principais:
  1. **Vendas por período** (dia/semana/mês)
  2. **Produtos mais vendidos** (top 20)
  3. **Performance motoboys** (entregas, tempo médio, avaliação)
  4. **Análise de clientes** (LTV, frequência, churn)
  5. **DRE simplificado** (receita - custos = lucro)
  6. **Fluxo de caixa projetado** (futuras contas)
- Filtros + exportação CSV/PDF

**2.10 Configurações** (`/admin/settings`)
- Horário de funcionamento
- Dados da loja (nome, endereço, logo, tempo médio entrega)
- Taxa de entrega (fixo ou por bairro)
- Templates de impressão (CRUD com preview)
- Usuários do sistema (RBAC)
- Configurações Asaas (ambiente sandbox/produção)
- Backup do banco (download CSV)

### Módulo 3 — Painel do Motoboy

**Rota**: `/delivery/*` (require role: DELIVERY)

#### Páginas:
- `/delivery` — Dashboard pessoal (entregas em andamento, próximas)
- `/delivery/historico` — Histórico completo
- `/delivery/perfil` — Seus dados + trocou de moto/placa

#### Funcionalidades mobile-first:
- ✅ Solicitar permissão de geolocalização (browser)
- ✅ Botão "Iniciar entrega" → ativa GPS tracking
- ✅ Botão "Confirmar entrega" → upload proof (opcional)
- ✅ Foto do produto no balcão (opcional)
- ✅ Ligar para cliente (link `tel:`)
- ✅ Ver endereço em mapa

### Módulo 4 — Loja do Cliente (Pós-pedido)

**Rota**: `/pedido/[id]` (público via token único)

- ✅ Status em tempo real
- ✅ Mapa com motoboy em movimento
- ✅ Tempo estimado de chegada
- ✅ Código PIX (se ainda não pagou)
- ✅ Botão "Falar no WhatsApp" (link wa.me)

---

## 🛣️ ~40 ENDPOINTS DA API

```
/api/auth/*                        # NextAuth (login, callback, etc)
/api/webhooks/asaas                # Webhook pagamento
/api/webhooks/evolution            # Webhook WhatsApp (opcional)

# Pedidos
POST   /api/orders                 # Criar pedido
GET    /api/orders                 # Listar (admin)
GET    /api/orders/[id]            # Detalhe
PATCH  /api/orders/[id]/status     # Mudar status
POST   /api/orders/[id]/cancel     # Cancelar

# Pagamentos
POST   /api/payments/create        # Criar intent (Asaas)
GET    /api/payments/[id]/qr       # Buscar QR Code
GET    /api/payments/[id]/status   # Status atual

# Delivery
POST   /api/delivery/[id]/location # Atualizar GPS
POST   /api/delivery/[id]/start    # Iniciar
POST   /api/delivery/[id]/finish   # Finalizar

# Financeiro
GET    /api/finance/accounts       # Listar (filtros)
POST   /api/finance/accounts       # Criar
PATCH  /api/finance/accounts/[id]  # Atualizar (marcar pago)
GET    /api/finance/dre            # DRE de um período
GET    /api/finance/cashflow       # Fluxo projetado

# Relatórios
GET    /api/reports/sales          # Vendas por período
GET    /api/reports/products       # Top produtos
GET    /api/reports/customers      # Análise clientes
GET    /api/reports/drivers        # Performance motoboys

# Produtos / Categorias
POST   /api/products
PATCH  /api/products/[id]
DELETE /api/products/[id]
(idem para /api/categories)

# Clientes (admin)
GET    /api/customers
GET    /api/customers/[id]

# Caixa
POST   /api/cashier/open
POST   /api/cashier/close
POST   /api/cashier/movement       # Sangria/suprimento

# Impressão
GET    /api/print/order/[id]       # Renderiza template
GET    /api/print/receipt/[id]     # Recibo

# Utilities
POST   /api/upload                 # Upload imagem
GET    /api/business-hours/current # Horário aberto agora?
```

---

## 🎨 INTERFACE / UX

### Design system

- **shadcn/ui** como base (componentes Radix)
- **Tailwind 4** com tema custom (verde #16a34a + laranja #f97316)
- **Light mode** (sem dark ainda)
- **Responsivo** (320px até 4K)
- Tipografia: Inter (UI) + JetBrains Mono (códigos)

### Padrões

- Formulários com **react-hook-form + Zod**
- Tabelas com **TanStack Table v8** (sort, filter, paginate)
- Notificações com **Sonner** (toast)
- Loading com **Skeleton** (shadcn)
- Confirmações destructivas com **AlertDialog**

### Telas especiais

- **Kanban de pedidos** (drag não permitido, só clique → modal)
- **Mapa em tempo real** (Leaflet, atualização a cada 5s)
- **Relatórios com gráficos** (Recharts)
- **Templates de impressão** (preview antes de salvar)

---

## 🔌 INTEGRAÇÕES

### 1. Asaas (sandbox atual)

```
Base URL: https://api-sandbox.asaas.com/v3
Auth: Bearer token (header Authorization)

Endpoints usados:
- POST /customers                    # Cria cliente
- POST /payments                     # Cria cobrança PIX
- GET  /payments/{id}/PixQrCode      # QR Code
- (webhooks)                         # Recebe callbacks
```

### 2. Evolution API (self-hosted, opcional)

```
Base URL: configurable (http://evolution-api:8080 ou VPS)
API key: header apikey

Endpoints:
- POST /message/sendText/{instance}
- POST /message/sendImage/{instance}
```

Mensagens enviadas automaticamente:
- ✅ Pedido pago → cozinha ("Novo pedido #1234 - João")
- ✅ Pedido pronto → cliente ("Seu pedido tá pronto!")
- ✅ Saiu pra entrega → cliente ("Motoboy saiu, código de rastreio: ABC")
- ✅ Entregue → cliente ("Obrigado! Avalie: link")
- ✅ Conta vence hoje → admin ("Conta de energia vence hoje, R$ 250")
- ✅ Caixa fechado → admin ("Fechamento do caixa OK: R$ 1.250 em vendas")

### 3. Nominatim (geocoding gratuito)

```
Base URL: https://nominatim.openstreetmap.org
Sem auth (rate limit 1 req/s)

Endpoints:
- GET /search?q=ENDERECO&format=json   # Endereço → lat/lng
- GET /reverse?lat=X&lng=Y&format=json # lat/lng → endereço
```

### 4. OpenStreetMap tiles

```
URL: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
Gratuito com atribuição
```

---

## 🔐 SEGURANÇA

### Autenticação

- **NextAuth v5** com Credentials Provider
- Senhas: **bcrypt** (12 rounds)
- Sessões: **JWT** + cookie httpOnly/secure/samesite
- RBAC enforced em 3 camadas:
  1. Middleware (proxy.ts) — bloqueia rotas
  2. Layout de rota — exige role específica
  3. API routes — valida permissão no servidor

### Dados sensíveis

- CPF/CNPJ armazenado plain (não é PII sensível em legislação atual, mas ideal seria hash + 2 últimos dígitos)
- Senha nunca retornada em API (select password: false)
- Tokens Asaas em `.env` (nunca no Git)
- Webhook Asaas valida signature (`x-asaas-signature`)

### HTTPS

- Forçado em produção (Hostinger Cert + Next.js `headers()`)
- Cookies com `Secure` flag
- CORS restrito ao próprio domínio

---

## 📈 MÉTRICAS / OBSERVABILIDADE

- **Logs estruturados** em `/var/log/pm2/*.log` (se deployado em VPS)
- **Print de erros** no terminal
- **WhatsAppLog** table rastreia todas as mensagens
- **OrderTimeline** rastreia cada mudança de status
- **PaymentEvent** rastreia cada evento do Asaas

---

## 📋 CASOS DE USO ATENDIDOS (1º release)

1. ✅ Cliente pede delivery pelo site
2. ✅ Cliente paga com PIX (QR Code gerado automaticamente)
3. ✅ Cliente acompanha motoboy em tempo real no mapa
4. ✅ Cliente retira no balcão (PICKUP)
5. ✅ Cozinha recebe pedido em sequência certa
6. ✅ Admin gerencia motoboys
7. ✅ Admin vê fluxo de caixa projetado
8. ✅ Admin parcela contas grandes (12x)
9. ✅ Admin gera relatórios em PDF
10. ✅ Admin imprime em impressora térmica 58/80mm
11. ✅ Admin aplica desconto não-fiscal (cortesia)
12. ✅ Admin gerencia caixa (abertura/fechamento/sangria)
13. ✅ Admin recebe notificações WhatsApp
14. ✅ Cliente recebe notificações WhatsApp
15. ✅ Cliente edita perfil (endereço, dados)

---

## 🚧 FORA DO ESCOPO (versão 1)

- ❌ Cartões de crédito/débito (só PIX)
- ❌ Multi-tenant (uma loja por deploy)
- ❌ App mobile nativo (PWA simples)
- ❌ Integração com iFood/Rappi
- ❌ Marketing cupons/descontos progressivos
- ❌ Fidelidade (pontos)
- ❌ Avaliações/reviews
- ❌ Chatbot
- ❌ SMS (só WhatsApp)
- ❌ Multi-idioma (só PT-BR)

---

## 🧪 TESTES

- **Manual** principal (lista em `docs/TESTE-FUNCIONAL.md`)
- **Smoke test** após cada deploy:
  1. Site carrega
  2. Login funciona
  3. Criar pedido PIX → ver QR Code → confirmar manualmente
  4. Painel admin mostra pedido
- **Testes Asaas** (sandbox): `docs/TESTES-ASAAS.md`
- **Testes webhook**: ferramenta Asaas simulador

---

## 📅 CRONOGRAMA HISTÓRICO (resumo)

| Data | Marco |
|---|---|
| 2026-09 | Spec inicial + schema Prisma |
| 2026-10 | Auth + catálogo + pedidos + Asaas |
| 2026-10 | Delivery + GPS + tracking |
| 2026-10 | Financeiro + relatórios + impressão |
| 2026-10 | Deploy Hostinger + domínio + SSL |

---

## 📞 CONTATOS DO PROJETO

- **Dono do produto**: Dilson (Elite Sistemas)
- **Domínio público**: https://deliveryfood.elitesistemas.io
- **Banco**: Neon (projeto `shiny-scene-05750305`)
- **Email técnico**: deploy@delivery.local

---

> **Use este documento para**: integrar novos devs, gerar prompts pra IA recriar o sistema, mostrar pro cliente o que tá pronto, planejar próximas features.
