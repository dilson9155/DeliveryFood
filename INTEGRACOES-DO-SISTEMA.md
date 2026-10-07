# 🔌 Integrações do Sistema — Delícias das Estações

> Documento descrevendo **todas as integrações externas** do sistema. Para entender dependências, custos, substituições.

---

## 🎯 Visão Geral

O sistema Delícias depende de **5 integrações externas** + 1 opcional:

```
┌─────────────────────────────────────────────────────────┐
│                    SISTEMA CORE                          │
│            (Next.js + Prisma + Postgres)                │
└──────┬─────────┬─────────┬──────────┬─────────┬────────┘
       │         │         │          │         │
       ▼         ▼         ▼          ▼         ▼
    💳 Asaas  💬 WhatsApp 🗺️ Mapa    🔐 Auth   📧 Email
```

| # | Integração | Status | Custo |
|---|---|---|---|
| 1 | **Asaas** (Pagamentos PIX) | ✅ Ativo (sandbox) | Grátis no sandbox |
| 2 | **Evolution API** (WhatsApp) | ⚙️ Opcional | VPS próprio |
| 3 | **Leaflet + Nominatim + OSM** (Mapas) | ✅ Ativo | Grátis |
| 4 | **NextAuth** (Autenticação) | ✅ Ativo | Grátis |
| 5 | **bcrypt** (Hash de senha) | ✅ Ativo | Grátis |
| 6 | **Nodemailer / SMTP** (Email) | ⚙️ Opcional | Grátis com Gmail |

---

## 💳 INTEGRAÇÃO 1 — Asaas (Pagamentos PIX)

### O que faz

Permite o sistema **gerar cobranças PIX automaticamente** e receber confirmação de pagamento sem intervenção manual.

### Por que Asaas?

- ✅ PIX nativo (sem앵ditional)
- ✅ API simples e documentada
- ✅ Sandbox gratuito pra testes
- ✅ Webhook confiável
- ✅ Sem taxa de adesão

### Como funciona no sistema

#### 🔵 Fluxo — Cliente paga:

```
1. Cliente finaliza pedido
        ↓
2. Sistema chama Asaas: POST /v3/customers
    (cria cliente se primeira vez)
        ↓
3. Sistema chama Asaas: POST /v3/payments
    Body: { customer, billingType: "PIX", value, dueDate }
        ↓
4. Asaas retorna:
    - payment.id (no formato pay_xxxxx)
    - status: PENDING
    - dueDate
        ↓
5. Sistema chama Asaas: GET /v3/payments/{id}/pixQrCode
    Retorna QR Code (imagem + payload texto)
        ↓
6. Sistema mostra QR Code pro cliente
        ↓
7. Cliente paga em qualquer banco (5s a 5min)
        ↓
8. Asaas dispara webhook:
    POST /api/webhooks/asaas
    Body: { event: "PAYMENT_RECEIVED_IN_CASH" }
        ↓
9. Sistema atualiza status → CONFIRMED
        ↓
10. Pedido segue o fluxo: PREPARING → DELIVERED
```

#### 🔵 Onde Acontece no Sistema

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/asaas.ts` | Cliente HTTP (funções pra cada endpoint) |
| `src/app/api/payments/create/route.ts` | Cria intent quando checkout finaliza |
| `src/app/api/webhooks/asaas/route.ts` | Recebe notificação do Asaas |
| `prisma/models/payment.prisma` | Persiste `PaymentIntent`, `PaymentEvent` |
| `src/components/shop/QrCodePix.tsx` | Mostra QR Code ao cliente |

### Endpoints da Asaas que o Sistema Usa

| Método | Endpoint | Quando |
|---|---|---|
| `POST` | `/v3/customers` | Primeira compra do cliente |
| `GET` | `/v3/customers?email=X` | Verifica se já existe |
| `POST` | `/v3/payments` | Cria cobrança PIX |
| `GET` | `/v3/payments/{id}` | Consulta status |
| `GET` | `/v3/payments/{id}/pixQrCode` | Pega QR Code |
| `POST` | `/webhooks/asaas` | Recebe callback (no nosso sistema) |

### Variáveis de Ambiente

```bash
# Sandbox (atual):
ASAAS_ENV=sandbox
ASAAS_API_KEY=$aact_hmlg_...

# Produção (futuro):
ASAAS_ENV=production
ASAAS_API_KEY=$aact_prod_...
```

Quando muda `ASAAS_ENV`, o cliente HTTP muda automaticamente entre:

```
Sandbox:  https://api-sandbox.asaas.com/v3
Produção: https://api.asaas.com/v3
```

### Webhook — Validação de Segurança

O Asaas envia uma assinatura no header `x-asaas-signature`. O sistema valida com HMAC-SHA256 antes de processar.

```typescript
function validateAsaasWebhook(payload: string, signature: string): boolean {
  const hmac = crypto.createHmac('sha256', ASAAS_API_KEY);
  const expected = hmac.update(payload).digest('hex');
  return signature === expected;
}
```

### Tipos de Webhook Processados

| Evento | O que o sistema faz |
|---|---|
| `PAYMENT_CREATED` | (log apenas —já criamos localmente) |
| `PAYMENT_AWAITING_RISK_ANALYSIS` | (log) |
| `PAYMENT_RECEIVED_IN_CASH` | Marca como RECEBIDO |
| `PAYMENT_OVERDUE` | Status OVERDUE (cliente não pagou) |
| `PAYMENT_DELETED` | Cancela intent |
| `PAYMENT_RESTORED` | Reativa intent |

### Sandbox vs Produção

| Característica | Sandbox | Produção |
|---|---|---|
| URL | `api-sandbox.asaas.com` | `api.asaas.com` |
| Pagamentos | Fictícios (não desconta) | Reais (desconta do vendedor) |
| Webhook | Simula | Recebe real |
| Precisa CNPJ? | Não | Sim |
| Custo | Grátis | 0,99% por transação PIX |

---

## 💬 INTEGRAÇÃO 2 — Evolution API (WhatsApp)

### O que faz

Permite ao sistema **enviar mensagens automáticas via WhatsApp Business** para clientes e staff em eventos importantes.

### Por que Evolution API?

- ✅ Open source (grátis)
- ✅ Multi-instância (vários números)
- ✅ Auto-hospedável (em qualquer VPS)
- ✅ Webhook nativo
- ✅ Suporte a mensagens, imagens, documentos
- ✅ Funciona com WhatsApp Business normal (não precisa chip)

### Status Atual

⚙️ **Opcional** — sistema funciona sem WhatsApp, mas perde as notificações automáticas.

### Como Funciona

#### 🔵 Auto-hospedagem

A Evolution API roda em um **container Docker** separado (normalmente):

```yaml
# docker-compose.yml (referência)
services:
  evolution-api:
    image: atendai/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      - SERVER_TYPE=http
      - AUTHENTICATION_TYPE=apikey
    volumes:
      - evolution_data:/evolution/data
```

A URL da API é configurada no `.env` do nosso sistema.

#### 🔵 Fluxo — Envio de Mensagem:

```
1. Evento acontece (ex: pedido pago)
        ↓
2. Sistema identifica destinatário + texto
        ↓
3. Chama Evolution API:
    POST {EVOLUTION_URL}/message/sendText/{instance}
    Headers: { apikey: SECRET }
    Body: { number: "5511999999999", text: "..." }
        ↓
4. Evolution API entrega pro WhatsApp
        ↓
5. WhatsApp entrega pro destinatário
        ↓
6. Evolution retorna status (SENT | FAILED)
        ↓
7. Sistema registra em WhatsAppLog
```

#### 🔵 Eventos que Disparam Mensagens

| Evento | Destinatário | Mensagem |
|---|---|---|
| **Pedido pago** | Cozinha (staff) | "Novo pedido #1234 - 3 itens: X, Y, Z" |
| **Pedido pronto** | Cliente | "Seu pedido tá pronto pra entrega!" |
| **Saiu pra entrega** | Cliente | "Motoboy João a caminho! Código: ABC. Acompanhe: <link>" |
| **Chegou no destino** | Cliente | "Motoboy chegou no seu endereço!" |
| **Entrega confirmada** | Cliente | "Pedido entregue! Avalie: <link>" |
| **Conta vence hoje** | Admin | "Conta de Energia vence hoje. R$ 250,00" |
| **Caixa fechado** | Admin | "Caixa OK: R$ 1.250,00 em vendas" |
| **Cliente cancelou** | Admin | "Pedido #1234 foi cancelado pelo cliente" |

#### 🔵 Onde Acontece no Sistema

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/whatsapp.ts` | Cliente HTTP da Evolution |
| `src/lib/whatsapp-templates.ts` | Templates de mensagem |
| `prisma/models/whatsapp.prisma` | Tabela `WhatsAppLog` |
| `src/app/api/webhooks/evolution/route.ts` | Recebe mensagens recebidas (futuro) |

### Variáveis de Ambiente

```bash
EVOLUTION_API_URL=http://evolution-api:8080
EVOLUTION_API_KEY=sua-chave-secreta
EVOLUTION_INSTANCE=delicias
```

### Modo "Falhar Silencioso"

Se Evolution API está offline, o sistema **não quebra**:

```typescript
async function sendWhatsApp(to: string, message: string) {
  try {
    // tenta enviar...
  } catch (err) {
    // log mas não trava o resto
    await prisma.whatsAppLog.create({
      data: { to, message, status: 'FAILED', error: err.message }
    });
  }
}
```

### Setup Inicial — Passo a Passo

1. Criar VPS ou container (Ubuntu 22, Docker)
2. Subir Evolution API via Docker
3. Criar instância (ex: "delicias")
4. Escanear QR Code com WhatsApp Business do restaurante
5. Copiar chave da API pro `.env`

---

## 🗺️ INTEGRAÇÃO 3 — Leaflet + Nominatim + OpenStreetMap

### 3 Componentes que Trabalham Juntos

```
┌──────────────────────────────────┐
│  1. LEAFLET (renderer)            │
│     → Mostra mapa interativo      │
│     → Recebe coordenadas         │
│                                      │
│  2. NOMINATIM (geocoding)         │
│     → Endereço → coordenadas      │
│     → Coordenadas → endereço      │
│                                      │
│  3. OSM TILES (background)        │
│     → Fornece imagens do mapa     │
└──────────────────────────────────┘
```

### Por que essas ferramentas?

- ✅ **100% gratuitas**
- ✅ Sem API key
- ✅ Sem limite rígido (rate limit 1 req/s Nominatim)
- ✅ Open source (sem vendor lock-in)

### Como Funciona

#### 🔵 Componente 1 — Leaflet (cliente)

Rodando **no navegador** do cliente/motoboy.

| Funcionalidade |
|---|---|
| Renderiza mapa interativo |
| Adiciona marcadores (origem, destino, motoboy) |
| Centraliza em coordenadas |
| Anima a posição do motoboy em tempo real |
| Polylines para rota (futuro) |

#### 🔵 Componente 2 — Nominatim (servidor público)

API gratuita do OpenStreetMap.

| Endpoint | Uso no sistema |
|---|---|
| `GET /search?q={endereço}` | Cliente digita CEP, acha no mapa |
| `GET /reverse?lat=X&lng=Y` | GPS do motoboy → endereço legível |

**Rate limit**: 1 requisição por segundo. Sistema implementa cache em memória pra respeitar.

#### 🔵 Componente 3 — OpenStreetMap Tiles

Servidor de imagens (tiles raster) do OpenStreetMap.

```
URL base: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
Atribuição obrigatória: "© OpenStreetMap contributors"
```

### Fluxo — Cliente Acompanha Motoboy:

```
1. Cliente acessa /pedido/[id]
        ↓
2. Página carrega Leaflet
        ↓
3. Sistema chama /api/orders/[id]/tracking
    Retorna: lat/lng do motoboy + lat/lng do destino
        ↓
4. Leaflet mostra 2 marcadores (origem + destino)
        ↓
5. A cada 5s, JS recusa /api/delivery/[id]/location
    Atualiza marcador do motoboy com animação
        ↓
6. Cliente vê bolinha se mexendo em tempo real
```

### Variáveis de Ambiente

Não precisa. Tudo público.

### Onde Acontece no Sistema

| Arquivo | Responsabilidade |
|---|---|
| `src/components/Map.tsx` | Componente React com Leaflet |
| `src/components/admin/OrderTrackingMap.tsx` | Mapa no painel admin |
| `src/lib/geocoding.ts` | Wrapper do Nominatim |
| `src/lib/delivery-tracking.ts` | Updates em tempo real |

---

## 🔐 INTEGRAÇÃO 4 — NextAuth (Autenticação)

### O que faz

Gerencia **sessões, login, logout** dos usuários (clientes e staff).

### Por que NextAuth?

- ✅ Integração nativa com Next.js (App Router)
- ✅ Suporta múltiplos providers (Credentials, Google, GitHub, etc)
- ✅ Sessões via JWT ou database
- ✅ Open source e gratuito
- ✅ Versão 5 (mais moderna, escrita em TypeScript)

### Providers Usados

| Provider | Quem usa | Como |
|---|---|---|
| **Credentials** | Todos | Email + senha (bcrypt) |

Outros providers (Google, etc.) podem ser adicionados facilmente.

### Fluxo — Login:

```
1. Usuário acessa /login
        ↓
2. Digita email + senha
        ↓
3. POST /api/auth/callback/credentials
        ↓
4. NextAuth busca User no banco
        ↓
5. Compara senha com bcrypt
        ↓
6. Se válido: cria JWT + cookie
        ↓
7. Redireciona pra dashboard ou loja
```

### Estrutura do JWT

```json
{
  "sub": "user-id-123",
  "email": "joao@email.com",
  "name": "João",
  "role": "ADMIN",
  "iat": 1234567890,
  "exp": 1234575090
}
```

### Proteção de Rotas

3 camadas:

1. **Middleware (proxy.ts)** — bloqueia `/admin/*` se não logado
2. **Layout** — exige role específica
3. **API routes** — valida permissão no servidor

```typescript
// exemplo middleware
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/admin/:path*", "/delivery/:path*"]
};

// exemplo API
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }
  // ...
}
```

### Variáveis de Ambiente

```bash
AUTH_SECRET=$(openssl rand -base64 32)
AUTH_TRUST_HOST=true   # importante em proxy reverso
NEXTAUTH_URL=https://deliveryfood.elitesistemas.io
```

---

## 🔒 INTEGRAÇÃO 5 — bcrypt (Hash de Senha)

### O que faz

**Nunca** armazena senhas em texto puro. Quando user cria senha:

```
"senha123"
      ↓ bcrypt (12 rounds)
"$2b$12$xYz....345 caracteres"
```

### Por que bcrypt?

- ✅ Padrão da indústria
- ✅ Lento de propósito (resistente a brute force)
- ✅ Salt automático (não precisa gerar)

### Onde Acontece

```typescript
import bcrypt from "bcrypt";

// ao criar user
const hashedPassword = await bcrypt.hash(password, 12);

// ao validar login
const ok = await bcrypt.compare(passwordInput, user.password);
```

Não tem custo externo, não tem configuração.

---

## 📧 INTEGRAÇÃO 6 — Nodemailer + SMTP (Email) — OPCIONAL

### O que faz

Sistema pode enviar **emails transacionais**:

- Recuperação de senha
- Confirmação de pedido
- Fechamento de caixa (relatório)

### Status Atual

⚙️ **Não implementado ainda.** Estrutura existe mas não usada.

### Como funcionaria

#### Provedores SMTP comuns

| Provedor | Custo | Limite |
|---|---|---|
| **Gmail** | Grátis | 500 emails/dia |
| **SendGrid** | Grátis até 100/dia | Plano pago: 35$/mês p/ 50k |
| **Amazon SES** | $0,10 por 1000 | Quase ilimitado |
| **Hostinger SMTP** | Grátis | 100/dia |

#### Configuração Recomendada (Gmail)

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=deliveryfood.elitesistemas.io@gmail.com
SMTP_PASS=senha-de-app-gmail
SMTP_FROM="Delícias <no-reply@elitesistemas.io>"
```

⚠️ Gmail precisa de "Senha de app" (2FA obrigatório).

### Onde Ficaria no Sistema

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/email.ts` | Cliente Nodemailer |
| `src/lib/email-templates.ts` | Templates HTML |
| `src/app/api/auth/forgot/route.ts` | Recuperação de senha |

---

## 🔄 Resumo das Dependências Externas

| Integração | Custo Mensal | Plano Gratuito | Vendor Lock-in? |
|---|---|---|---|
| 💳 Asaas | Grátis (sandbox) | Sim | Sim |
| 💬 Evolution API | Custo do VPS | Self-hosted | Não |
| 🗺️ Nominatim + OSM | Grátis | Ilimitado (com rate limit) | Não |
| 🔐 NextAuth | Grátis | Sim | Não |
| 🔒 bcrypt | Grátis | Sim | Não |
| 📧 Nodemailer + SMTP | Grátis (Gmail) | Sim | Sim (Gmail) |

---

## 🛡️ Como Substituir uma Integração

Se você quiser **trocar Asaas por outro gateway** (ex: Mercado Pago, Pagar.me):

| O que mudar | Esforço |
|---|---|
| `src/lib/asaas.ts` → `src/lib/mercadopago.ts` | Médio |
| Endpoint `/api/payments/create` | Baixo |
| Webhook `/api/webhooks/asaas` → `/webhooks/mercadopago` | Médio |
| Validar assinatura do webhook | Baixo |

**A maior parte do sistema NÃO muda** porque pagamentos ficam isolados no módulo. Cada integração é "plugável" porque foi abstraída em uma lib.

---

## 📊 Diagrama Completo de Dependências

```
┌────────────┬─────────────┬──────────────┬──────────────┐
│ Banco       │ Auth.d.ts    │ Vendedores   │
│ (Neon PG)   │ (Prisma)     │ (People)     │
└─────┬────────┴──────┬──────┴──────┬───────┘
      │                │              │
      ▼                ▼              ▼
   ┌─────────────────────────────────┐
   │     SISTEMA CORE                │
   │  (Next.js + Prisma + Auth)      │
   └──────┬──────────┬──────────┬────┘
          │          │          │
    ┌─────┘          │          └─┐
    │                │            │
    ▼                ▼            ▼
 [Asaas]      [Evolution API] [Leaflet]
    │                │            │
    ▼                ▼            ▼
 [Banco]         [WhatsApp]    [OSM + 
  [Cleinte]      [Cleinte]    Nominatim]
```

---

> **Use esta doc para**: avaliar custos, decidir substituições, entender dependências do sistema, integrar novos provedores.
