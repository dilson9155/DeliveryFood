# 📦 Módulos do Sistema — Delícias das Estações

> Documento descrevendo **apenas os módulos** (sem detalhes técnicos de implementação). Para integração com novos devs ou visão geral do produto.

---

## 🎯 4 Macro-Áreas

O sistema é dividido em **4 macro-áreas**, cada uma com seus módulos:

```
┌─────────────────────────────────────────────────────────┐
│ 1. LOJA PÚBLICA       → Público geral (clientes)       │
│ 2. PAINEL ADMIN       → Dono, gerentes, cozinha, caixa  │
│ 3. PAINEL MOTOBOY     → Entregadores                   │
│ 4. CROSS-CUTTING      → Recursos compartilhados         │
│    (Autenticação, Notificações, Impressão, Pagamentos)  │
└─────────────────────────────────────────────────────────┘
```

---

## 🛍️ ÁREA 1 — LOJA PÚBLICA

O que o **visitante** vê e faz no site (sem precisar login).

### 📦 Módulo 1.1 — Cardápio Digital

| Funcionalidade | Descrição |
|---|---|
| Home | Categorias em destaque + produtos em promoção |
| Listagem por categoria | Produtos organizados por seção |
| Detalhe do produto | Foto, descrição, preço, addons |
| Busca | Por nome do produto |
| Imagem | Cada produto tem foto + descrição rica |

### 📦 Módulo 1.2 — Carrinho de Compras

| Funcionalidade | Descrição |
|---|---|
| Adicionar/remover itens | Quantidade ajustável |
| Addons | Adicionar extras (radio/checkbox) |
| Observações por item | Ex: "sem cebola" |
| Persistência | Mantém itens mesmo se fechar navegador |
| Recálculo automático | Subtotal + frete + desconto |

### 📦 Módulo 1.3 — Checkout

| Funcionalidade | Descrição |
|---|---|
| Autenticação | Login/cadastro rápido (com CPF) |
| Escolha do tipo | Delivery, Pickup ou Dine-in |
| Endereço | Autocomplete via CEP/coordenadas |
| Tempo estimado | Baseado em horário + preparo |
| Forma de pagamento | PIX (gera QR Code automaticamente) |
| Confirmação | Mostra resumo antes de finalizar |

### 📦 Módulo 1.4 — Acompanhamento do Pedido

| Funcionalidade | Descrição |
|---|---|
| Status em tempo real | Cria → Pago → Preparando → Pronto → Entregue |
| Mapa com motoboy | Vê onde tá o entregador agora |
| Código PIX | Se ainda não pagou |
| Chat WhatsApp | Botão direto pro atendimento |

---

## 🔐 ÁREA 2 — PAINEL ADMIN

Acesso restrito a **funcionários da loja**.

### 📦 Módulo 2.1 — Dashboard Administrativo

Mostra o panorama **geral do dia/turno**.

| Indicador | Mostra |
|---|---|
| Vendas hoje | Total em R$ + quantos pedidos |
| Pedidos pendentes | Lista de pedidos não finalizados |
| Ticket médio | Valor médio por pedido |
| Saldo | Caixa - contas a pagar |
| Top produto | Mais vendido hoje |
| Gráfico 7 dias | Linha de vendas da semana |

**Sub-recursos:**
- 📊 Card de KPI (4 cards coloridos no topo)
- 📈 Gráfico de vendas (linha temporal)
- 🔔 Alertas (notificações importantes)

---

### 📦 Módulo 2.2 — Gestão de Pedidos

O **módulo central** do sistema. Tudo gira em torno dele.

| Tela | O que faz |
|---|---|
| Kanban | 6 colunas (status) com drag visual |
| Detalhe modal | Itens, cliente, histórico, ações |
| Filtros | Por data, status, tipo, motoboy |
| Ações rápidas | Avançar status, cancelar, reimprimir |
| Timeline | Histórico de mudanças |

**Status possíveis:**
1. `PENDING` — Criado, aguardando pagamento
2. `PAID` — PIX confirmado
3. `PREPARING` — Cozinha preparando
4. `READY` — Pronto p/ entrega
5. `OUT_FOR_DELIVERY` — Em rota
6. `DELIVERED` — Entregue
7. `CANCELLED` — Cancelado (com motivo)

**Sub-recursos:**
- 🔔 Atribuição de motoboy
- 📝 Notas internas (só staff vê)
- 🏷️ Desconto não-fiscal (cortesia/avaria)
- 🖨️ Impressão térmica (cupom cozinha, cupom entregador)

---

### 📦 Módulo 2.3 — Catálogo (Produtos & Categorias)

Gerencia o **que é vendido**.

#### Sub-módulo 2.3.1 — Produtos

| Funcionalidade | Descrição |
|---|---|
| CRUD completo | Criar, editar, desativar |
| Campos | Nome, descrição, preço, custo (CMV), foto, categoria |
| Disponibilidade | Liga/desliga sem deletar |
| Destaque | Marca produtos para a home |
| Tempo de preparo | Minutos (usado no tempo estimado) |
| Vínculo com addons | Grupos de opcionais |

#### Sub-módulo 2.3.2 — Categorias

| Funcionalidade | Descrição |
|---|---|
| CRUD simples | Nome, slug, ícone |
| Ordem | Drag & drop para reordenar |

#### Sub-módulo 2.3.3 — Addons (Extras)

Permite criar "grupos de opções" para produtos.

**Exemplo:** pizza → tamanho (R$ +5, R$ +10) + borda (R$ +4) + extras (R$ +2 cada)

| Funcionalidade | Descrição |
|---|---|
| Grupos | Obrigatório ou opcional |
| Mínimo/máximo | Quantas opções pode escolher |
| Ordem dos grupos | Sequência de exibição |

---

### 📦 Módulo 2.4 — Gestão de Clientes

Base de **clientes cadastrados**.

| Funcionalidade | Descrição |
|---|---|
| Lista completa | Tabela pesquisável |
| Busca | Por nome, CPF, telefone, email |
| Detalhe | Histórico, gasto total, endereço padrão |
| Top 10 | Ranking de clientes por valor gasto |
| Cadastro | Com CPF/CNPJ + endereço completo |
| Bloqueio | Desativar cliente (não apaga histórico) |

**Sub-recursos:**
- 📇 Endereços múltiplos por cliente
- 📊 Estatísticas (LTV, frequência)

---

### 📦 Módulo 2.5 — Gestão de Motoboys

Gerencia os **entregadores próprios**.

| Funcionalidade | Descrição |
|---|---|
| Lista | Motoboys cadastrados |
| Status | Livre / Em entrega |
| Histórico | Entregas feitas por motoboy |
| Performance | Tempo médio, avaliação |
| Cadastro | Nome, telefone, placa, veículo |

**Sub-recursos:**
- 🏆 Ranking (top motoboys do mês)
- 📊 Métricas (taxa de sucesso, distância média)

---

### 📦 Módulo 2.6 — Caixa (Turno)

Controle de **abertura/fechamento de caixa** (turno).

| Funcionalidade | Descrição |
|---|---|
| Abertura | Registra valor inicial + operador |
| Movimentações | Sangria (retirada) / Suprimento (entrada) |
| Vendas por turno | Lista de pedidos pagos no turno |
| Fechamento | Calcula saldo final automaticamente |
| Relatório imprimível | Resumo do turno (entra-saída) |

**Sub-recursos:**
- 📋 Histórico de caixas anteriores
- 🔍 Auditoria (quem abriu/fechou)

---

### 📦 Módulo 2.7 — Módulo Financeiro

Controle **contábil básico** da loja.

#### Sub-módulo 2.7.1 — Dashboard Financeiro

| Indicador | Mostra |
|---|---|
| Entradas totais | Vendas, recebimentos |
| Saídas totais | Pagamentos feitos |
| Saldo | Entradas - saídas |
| Projeção 30 dias | Baseado em contas a pagar/receber |
| Gráfico de barras | Evolução mês a mês |

#### Sub-módulo 2.7.2 — Contas a Pagar

| Funcionalidade | Descrição |
|---|---|
| CRUD de contas | Descrição, valor, vencimento, categoria |
| Categorização | Aluguel, energia, fornecedores, etc |
| Parcelamento | 2x, 3x, 12x com juros ou sem |
| Anexo de comprovante | Upload de boleto/nota |
| Marcar pago | Com data de pagamento |
| Alertas | Vencendo hoje / vencido |

#### Sub-módulo 2.7.3 — Contas a Receber

| Funcionalidade | Descrição |
|---|---|
| Cadastro manual | Vendas a prazo feitas diretamente |
| Auto via pedidos | Cada DELIVERY pendente gera receivable |
| Status | Aberto, recebido, vencido |

#### Sub-módulo 2.7.4 — DRE Simplificado

| Demonstra | Como |
|---|---|
| Receita bruta | Soma vendas do período |
| (-) CMV | Soma custos dos produtos vendidos |
| (-) Despesas fixas | Soma contas a pagar do período |
| (-) Despesas variáveis | Soma contas variáveis |
| **= Lucro líquido** | Resultado |

#### Sub-módulo 2.7.5 — Fluxo de Caixa Projetado

| Mostra | Como |
|---|---|
| Saldo atual | Do caixa + banco (futuro) |
| Entradas previstas | Receivables próximos 30 dias |
| Saídas previstas | Payables próximos 30 dias |
| Saldo projetado | Hoje + futuras movimentações |

---

### 📦 Módulo 2.8 — Relatórios Gerenciais

São **6 relatórios prontos**, todos com filtro de período.

| # | Relatório | Mostra |
|---|---|---|
| 1 | **Vendas por período** | Total, ticket médio, evolução diária |
| 2 | **Produtos mais vendidos** | Top 20 com quantidade + receita |
| 3 | **Performance motoboys** | Entregas, tempo médio, avaliação |
| 4 | **Análise de clientes** | LTV, frequência, churn estimado |
| 5 | **DRE** | Lucro/prejuízo por período |
| 6 | **Fluxo de caixa projetado** | Saldos futuros |

**Sub-recursos:**
- 🔍 Filtros (data inicial/final, categoria, etc)
- 📤 Exportação CSV
- 🖨️ Exportação PDF
- 📊 Gráficos visuais

---

### 📦 Módulo 2.9 — Configurações

Central de **ajustes da loja**.

| Aba | Configura |
|---|---|

| **Dados da loja** | Nome, CNPJ, endereço, logo |
| **Horário de funcionamento** | Por dia da semana |
| **Entrega** | Taxa fixa, raio de entrega, tempo médio |
| **Impressão térmica** | Templates customizáveis |
| **Asaas** | Ambiente (sandbox/produção), API key |
| **Usuários** | Criar/editar/desativar funcionários |
| **Backup** | Download de tabelas em CSV |

**Sub-recursos:**
- 👥 CRUD de usuários do sistema (com permissões)
- 🔐 Tokens de API gerenciados

---

## 🛵 ÁREA 3 — PAINEL MOTOBOY

Acesso exclusivo para **motoboys cadastrados**.

### 📦 Módulo 3.1 — Dashboard do Motoboy

Mostra o **"agora"** do motoboy.

| Exibido | Detalhe |
|---|---|
| Entregas do dia | Lista com hora estimada |
| Em andamento | 1 entrega atual (se houver) |
| Ganhos do dia | Soma de taxas previstas |
| Próxima entrega | Endereço, mapa, telefone do cliente |

---

### 📦 Módulo 3.2 — Rastreamento de Entrega

É aqui que o motoboy **compartilha GPS**.

| Funcionalidade | Descrição |
|---|---|
| Solicitar GPS | Browser pede permissão |
| Iniciar entrega | Começa a enviar localização (a cada 30s) |
| Mapa próprio | Vê rota até o cliente |
| Cancelar (justificativa) | Falha: cliente ausente, endereço errado... |
| Confirmar entrega | Finaliza + registra timestamp |

**Sub-recursos:**
- 📍 Localização precisa (lat/lng)
- 📞 Ligar direto pro cliente (botão)
- 📱 Botão WhatsApp app do celular
- 📷 Foto opcional (comprovante)

---

### 📦 Módulo 3.3 — Histórico do Motoboy

| Exibido | Detalhe |
|---|---|
| Entregas passadas | Lista cronológica |
| Total de entregas | Quantidade + tempo médio |
| Avaliação média | Estrelas (1-5) |
| Ganhos totais | Soma de taxas |

---

### 📦 Módulo 3.4 — Perfil do Motoboy

| Editável | Detalhe |
|---|---|
| Nome completo | CPF vinculado |
| Telefone | WhatsApp |
| Placa da moto | Modelo do veículo |
| Trocar senha | Senha de login |

---

## 🔧 ÁREA 4 — CROSS-CUTTING

Recursos **compartilhados** entre várias áreas.

### 📦 Módulo 4.1 — Autenticação e Autorização

| Componente | O que faz |
|---|---|
| Login (NextAuth) | Email + senha (com bcrypt) |
| Cadastro público | Cliente se cadastra no checkout |
| Cadastro admin | Dono cria usuário staff |
| RBAC | 6 níveis de permissão |
| 2FA (opcional) | Para admins (futuro) |
| Recuperação de senha | Por email |

---

### 📦 Módulo 4.2 — Notificações WhatsApp

Mensagens automáticas enviadas via **Evolution API**.

| Evento | Quem recebe | Conteúdo |
|---|---|---|
| Pedido pago | COZINHA | "Novo pedido #1234 - 3 itens" |
| Pedido pronto | CLIENTE | "Seu pedido tá pronto!" |
| Saiu pra entrega | CLIENTE | "Motoboy a caminho, código ABC" |
| Entrega confirmada | CLIENTE | "Obrigado! Avalie: link" |
| Conta vence hoje | ADMIN | "Conta de energia vence hoje, R$ 250" |
| Caixa fechado | ADMIN | "Caixa OK: R$ 1.250 em vendas" |

**Sub-recursos:**
- ✅ Templates editáveis
- 📊 Log de todas as mensagens enviadas
- 🔁 Retry automático se falha

---

### 📦 Módulo 4.3 — Impressão

Sistema de **templates de impressão térmica** configuráveis.

#### Tipos de papel suportados:

| Tamanho | Uso típico |
|---|---|
| 58mm | Impressoras mini (PDV) |
| 76mm | Impressoras médias |
| 80mm | Impressoras comuns |
| A4 | Impressoras jato de tinta |
| Letter | Impressoras internacionais |

#### Templates padrão:

| Template | Conteúdo |
|---|---|
| **Cupom de cozinha** | Nº pedido, itens, observações |
| **Cupom de entrega** | Endereço, cliente, motoboy |
| **Recibo do cliente** | Total pago, PIX confirmado |
| **Fechamento de caixa** | Resumo do turno |

**Sub-recursos:**
- ✏️ Editor de templates (HTML/CSS)
- 👁️ Preview antes de salvar
- 🖨️ Imprimir direto do navegador

---

### 📦 Módulo 4.4 — Pagamentos (Asaas)

Integração com gateway de pagamento PIX.

| Funcionalidade | Descrição |
|---|---|
| Criar cliente | Auto, na primeira compra |
| Gerar cobrança PIX | Valor + vencimento |
| QR Code | Mostra no checkout |
| Webhook | Recebe confirmação automática |
| Status tracking | PENDENTE → CONFIRMADO → RECEBIDO |
| Reembolso (futuro) | Em caso de cancelamento |

**Sub-recursos:**
- 🔐 Assinatura do webhook (validação)
- 📊 Relatório de pagamentos
- 🔄 Retry se webhook falha

---

### 📦 Módulo 4.5 — Geolocalização

Integração com **Nominatim** (OpenStreetMap).

| Funcionalidade | Descrição |
|---|---|
| Endereço → coordenadas | Cliente digita CEP, sistema acha no mapa |
| Coordenadas → endereço | Reverse geocoding do motoboy |
| Cálculo de distância | Para taxa de entrega (futuro) |
| Mapa interativo | Leaflet no tracking |

**Sub-recursos:**
- 🗺️ Cache de buscas repetidas
- 🌐 Rate limit respeitado (1 req/s)

---

### 📦 Módulo 4.6 — Auditoria / Logs

Registro de **tudo que acontece** no sistema.

| Log | O que registra |
|---|---|
| OrderTimeline | Cada mudança de status de pedido |
| PaymentEvent | Cada webhook do Asaas recebido |
| WhatsAppLog | Cada mensagem enviada (com sucesso/falha) |
| Login tentativas | Sucesso/falha de autenticação |

**Sub-recursos:**
- 🔍 Rastreamento de qualquer pedido/usuário
- 📜 Conformidade (LGPD)

---

## 📊 Resumo — Quantidade de Módulos

| Área | Módulos | Telas |
|---|---|---|
| 🛍️ Loja Pública | 4 | 8 |
| 🔐 Painel Admin | 9 (com 14 sub-módulos) | ~25 |
| 🛵 Painel Motoboy | 4 | 6 |
| 🔧 Cross-cutting | 6 | — |
| **TOTAL** | **23 módulos** | **~40 telas** |

---

## 🗺️ Mapa Mental Rápido

```
Delícias das Estações
│
├── 🛍️ LOJA (público)
│   ├── Cardápio
│   ├── Carrinho
│   ├── Checkout
│   └── Acompanhamento
│
├── 🔐 ADMIN (staff)
│   ├── Dashboard
│   ├── Pedidos ★ (core)
│   ├── Catálogo
│   │   ├── Produtos
│   │   ├── Categorias
│   │   └── Addons
│   ├── Clientes
│   ├── Motoboys
│   ├── Caixa
│   ├── Financeiro
│   │   ├── Dashboard
│   │   ├── Payables
│   │   ├── Receivables
│   │   ├── DRE
│   │   └── Fluxo de Caixa
│   ├── Relatórios (6)
│   └── Configurações
│
├── 🛵 MOTOBOY (entregador)
│   ├── Dashboard
│   ├── Rastreamento
│   ├── Histórico
│   └── Perfil
│
└── 🔧 CROSS
    ├── Autenticação
    ├── WhatsApp
    ├── Impressão
    ├── Pagamentos (Asaas)
    ├── Mapa/Nominatim
    └── Logs/Auditoria
```

---

**Use este mapa** pra explicar o sistema de forma rápida pra qualquer pessoa (cliente, dev novo, investidor).
