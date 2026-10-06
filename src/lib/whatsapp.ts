/**
 * Integração com Evolution API (WhatsApp self-hosted).
 *
 * O Evolution API é open-source e conecta ao WhatsApp Web via QR code.
 * Documentação: https://doc.evolution-api.com/v2/api-reference/
 *
 * Variáveis de ambiente esperadas:
 *   EVOLUTION_API_URL    - ex.: http://evolution-api:8080
 *   EVOLUTION_API_KEY    - token de autenticação da instância
 *   EVOLUTION_INSTANCE   - nome da instância (ex.: "delicias")
 *
 * Todas as funções são safe-by-default: se as variáveis não estiverem
 * configuradas OU se o envio falhar, retornam { ok: false } sem lançar.
 * A UI/log deve prosseguir normalmente (notificação é best-effort).
 */

export type WhatsappResult = { ok: true } | { ok: false; error: string };

type SendOptions = {
  /** Texto da mensagem (suporta *negrito*, _itálico_ e emojis) */
  text: string;
  /** Telefone no formato DDI+DDD+número, ex: 5531999887766 */
  phone: string;
};

/** Normaliza qualquer formato de telefone para 55… (BR default) */
export function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;
  // Se já começa com 55 e tem 12-13 dígitos, mantém
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  // Se tem 10-11 dígitos (BR sem DDI), prefixa 55
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  // Outros formatos: assume que já tem DDI
  return digits;
}

function getConfig() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!url || !key || !instance) return null;
  return { url: url.replace(/\/$/, ""), key, instance };
}

/** Envia uma mensagem de texto via Evolution API */
export async function sendWhatsApp({ phone, text }: SendOptions): Promise<WhatsappResult> {
  const cfg = getConfig();
  const normalized = normalizePhone(phone);
  if (!cfg) {
    return { ok: false, error: "WhatsApp não configurado (Evolution API)." };
  }
  if (!normalized) {
    return { ok: false, error: "Telefone inválido." };
  }
  if (!text.trim()) {
    return { ok: false, error: "Mensagem vazia." };
  }

  try {
    const res = await fetch(
      `${cfg.url}/message/sendText/${cfg.instance}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.key,
        },
        body: JSON.stringify({
          number: normalized,
          text,
          delay: 0,
        }),
        // 10s timeout
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}

// === Templates de mensagens ===
// Mantemos centralizados para fácil edição e tradução futura.

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

const STORE_NAME = "Delicias das Estações"; // pode virar dinâmico depois

export type OrderEventInput = {
  orderNumber: number;
  customerName: string;
  total: number;
  paymentMethod: string;
  deliveryMode?: "PICKUP" | "DELIVERY";
  /** Status antigo → status novo */
  fromStatus?: string;
  toStatus?: string;
  motoboyName?: string | null;
  motoboyPhone?: string | null;
  trackingUrl?: string;
};

function header(name: string) {
  const clean = name.split(" ")[0];
  return `Olá, ${clean}! 👋\n\n`;
}

function footer(text: string) {
  return `\n\n— *${STORE_NAME}*`;
}

export function messageOrderReceived(input: OrderEventInput): string {
  return (
    header(input.customerName) +
    `✅ Recebemos seu pedido *#${String(input.orderNumber).padStart(4, "0")}*!\n\n` +
    `💰 Total: ${fmtBRL(input.total)}\n` +
    `💳 Pagamento: ${input.paymentMethod}\n` +
    (input.deliveryMode === "DELIVERY" ? `🛵 Entrega\n` : `🏪 Retirada na loja\n`) +
    `\nAguarde a confirmação. Avisaremos por aqui mesmo quando o status mudar!` +
    footer("")
  );
}

export function messageOrderConfirmed(input: OrderEventInput): string {
  return (
    header(input.customerName) +
    `👍 Seu pedido *#${String(input.orderNumber).padStart(4, "0")}* foi *confirmado*!\n\n` +
    `Já estamos preparando tudo com carinho. 🍳` +
    footer("")
  );
}

export function messageOrderPreparing(input: OrderEventInput): string {
  return (
    header(input.customerName) +
    `👨‍🍳 Seu pedido *#${String(input.orderNumber).padStart(4, "0")}* está *em preparo*!\n\n` +
    `Logo ficará pronto.` +
    footer("")
  );
}

export function messageOrderReady(input: OrderEventInput): string {
  if (input.deliveryMode === "DELIVERY") {
    return (
      header(input.customerName) +
      `📦 Seu pedido *#${String(input.orderNumber).padStart(4, "0")}* está *pronto*!\n\n` +
      `Em instantes o motoboy${input.motoboyName ? ` *${input.motoboyName}*` : ""} ` +
      `sairá para a entrega.` +
      footer("")
    );
  }
  return (
    header(input.customerName) +
    `🎉 Seu pedido *#${String(input.orderNumber).padStart(4, "0")}* está *pronto*!\n\n` +
    `Pode vir buscá-lo na loja. 🏪` +
    footer("")
  );
}

export function messageOrderOutForDelivery(input: OrderEventInput): string {
  return (
    header(input.customerName) +
    `🛵 Seu pedido *#${String(input.orderNumber).padStart(4, "0")}* saiu para entrega!\n\n` +
    (input.motoboyName
      ? `Motoboy: *${input.motoboyName}*${input.motoboyPhone ? ` · ${input.motoboyPhone}` : ""}\n`
      : "") +
    `Acompanhe em tempo real pelo app: ${input.trackingUrl ?? "/meus-pedidos"}` +
    footer("")
  );
}

export function messageOrderDelivered(input: OrderEventInput): string {
  return (
    header(input.customerName) +
    `✅ Pedido *#${String(input.orderNumber).padStart(4, "0")}* *entregue*!\n\n` +
    `Obrigado pela preferência. Volte sempre! 🥰` +
    footer("")
  );
}

export function messageOrderCancelled(input: OrderEventInput): string {
  return (
    header(input.customerName) +
    `❌ Seu pedido *#${String(input.orderNumber).padStart(4, "0")}* foi *cancelado*.\n\n` +
    `Em caso de dúvidas, entre em contato conosco.` +
    footer("")
  );
}

/** Mensagem enviada para o motoboy quando recebe uma entrega */
export function messageMotoboyAssigned(input: {
  motoboyName: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string | null;
  addressStreet: string;
  addressNumber: string;
  addressNeighborhood: string;
  addressCity: string;
  trackingUrl: string;
}): string {
  return (
    `🛵 Nova entrega para você, *${input.motoboyName.split(" ")[0]}*!\n\n` +
    `Pedido *#${String(input.orderNumber).padStart(4, "0")}*\n` +
    `Cliente: ${input.customerName}${input.customerPhone ? ` · ${input.customerPhone}` : ""}\n` +
    `Endereço: ${input.addressStreet}, ${input.addressNumber} — ${input.addressNeighborhood}, ${input.addressCity}\n\n` +
    `Acesse o painel para iniciar a rota:\n${input.trackingUrl}` +
    footer("")
  );
}