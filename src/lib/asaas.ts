/**
 * Cliente Asaas - API REST oficial.
 *
 * Documentação: https://docs.asaas.com/reference
 *
 * Sandbox: https://sandbox.asaas.com/api/v3
 * Produção: https://www.asaas.com/api/v3
 *
 * Autenticação: API key enviada no header `access_token` (não Bearer).
 *
 * Variáveis de ambiente:
 *   ASAAS_ENV          - 'sandbox' | 'production' (default: sandbox)
 *   ASAAS_API_KEY      - chave de API (sandbox ou produção)
 *   ASAAS_WEBHOOK_URL  - URL pública do webhook (default: /api/webhooks/asaas)
 *
 * Safe-by-default: se as variáveis não estiverem configuradas, todas
 * as funções retornam { ok: false } sem lançar.
 */

export type AsaasEnv = "sandbox" | "production";

const SANDBOX_API = "https://sandbox.asaas.com/api/v3";
const PRODUCTION_API = "https://www.asaas.com/api/v3";

export type AsaasBillingType = "PIX" | "CREDIT_CARD" | "BOLETO" | "UNDEFINED";

export type AsaasChargeStatus =
  | "PENDING"
  | "RECEIVED"
  | "CONFIRMED"
  | "OVERDUE"
  | "REFUNDED"
  | "RECEIVED_IN_CASH"
  | "REFUND_REQUESTED"
  | "REFUND_IN_PROGRESS"
  | "CHARGEBACK_REQUESTED"
  | "CHARGEBACK_DISPUTE"
  | "AWAITING_CHARGEBACK_REVERSAL"
  | "DUNNING_RECEIVED"
  | "DUNNING_EXPIRED"
  | "CANCELLED";

export type CreatePaymentInput = {
  /** Identificador único no nosso sistema (Order.id) */
  customer: string; // customer ID na Asaas (ou usar createCustomer antes)
  /** Valor em REAIS (não centavos!) - Asaas formata internamente */
  value: number;
  /** Vencimento ISO date YYYY-MM-DD */
  dueDate: string;
  /** Descrição da fatura (até 1.x a 0 chars) */
  description?: string;
  /** Dados do cliente (Asaas exige) */
  customerData?: {
    name: string;
    cpfCnpj: string;
    email: string;
    phone?: string;
  };
  /** Tipo de billing (PIX é o que usamos agora) */
  billingType?: AsaasBillingType;
  /** Callback URL após pagamento (opcional) */
  callbackUrl?: string;
};

export type AsaasPayment = {
  id: string;
  customer: string;
  value: number;
  netValue: number;
  status: AsaasChargeStatus;
  billingType: AsaasBillingType;
  dueDate: string;
  description: string | null;
  invoiceUrl: string | null;
  /** PIX: encodedImage (base64) + payload (copia-cola) */
  pixTransaction?: {
    encodedImage?: string;
    payload?: string;
    expiresAt?: string;
  };
  confirmedDate?: string | null;
  paymentDate?: string | null;
};

export type AsaasResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function getConfig() {
  const env = (process.env.ASAAS_ENV ?? "sandbox") as AsaasEnv;
  const apiKey = process.env.ASAAS_API_KEY;
  if (!apiKey) return null;
  const baseUrl = env === "production" ? PRODUCTION_API : SANDBOX_API;
  return { env, apiKey, baseUrl };
}

async function request<T>(
  path: string,
  init: { method?: string; json?: unknown }
): Promise<AsaasResult<T>> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "Asaas não configurado." };
  const url = `${cfg.baseUrl}${path}`;
  try {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        access_token: cfg.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: init.json ? JSON.stringify(init.json) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    const data = text ? safeParseJSON(text) : null;
    if (!res.ok) {
      const errData = data as {
        errors?: Array<{ description: string }>;
        message?: string;
        error_description?: string;
      } | null;
      const errMsg =
        errData?.errors?.[0]?.description ||
        errData?.message ||
        errData?.error_description ||
        text.slice(0, 200);
      return { ok: false, error: errMsg, status: res.status };
    }
    return { ok: true, data: data as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro de rede",
    };
  }
}

function safeParseJSON(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

// ============== Customer ==============

export async function findOrCreateCustomer(
  data: {
    name: string;
    cpfCnpj: string;
    email: string;
    phone?: string;
    externalReference?: string;
  }
): Promise<AsaasResult<{ id: string }>> {
  const cpf = data.cpfCnpj.replace(/\D/g, "");
  // Tenta encontrar por CPF
  const found = await request<{ data: Array<{ id: string }> }>(
    `/customers?cpfCnpj=${cpf}`,
    { method: "GET" }
  );
  if (found.ok && found.data.data.length > 0) {
    return { ok: true, data: { id: found.data.data[0].id } };
  }
  // Cria novo
  const payload = {
    name: data.name,
    cpfCnpj: cpf,
    email: data.email,
    ...(data.phone ? { phone: data.phone.replace(/\D/g, "") } : {}),
    ...(data.externalReference ? { externalReference: data.externalReference } : {}),
  };
  const created = await request<{ id: string }>(`/customers`, {
    method: "POST",
    json: payload,
  });
  if (!created.ok) return created;
  return { ok: true, data: { id: created.data.id } };
}

// ============== Cobrança PIX ==============

export async function createPixPayment(
  input: CreatePaymentInput & { customerData: { name: string; cpfCnpj: string; email: string; phone?: string } }
): Promise<AsaasResult<AsaasPayment>> {
  // 1. Cria/encontra cliente
  const customer = await findOrCreateCustomer(input.customerData);
  if (!customer.ok) return customer;

  // 2. Cria cobrança PIX
  const payload = {
    customer: customer.data.id,
    billingType: "PIX" as AsaasBillingType,
    value: input.value,
    dueDate: input.dueDate,
    description: (input.description ?? "Pedido Delivery Food").slice(0, 500),
    postalService: false,
    ...(input.callbackUrl ? { callback: input.callbackUrl } : {}),
  };

  const charge = await request<{ id: string }>(`/payments`, {
    method: "POST",
    json: payload,
  });
  if (!charge.ok) return charge;

  // 3. Gera QR Code PIX
  const pix = await request<{
    encodedImage: string;
    payload: string;
    expirationDate: string;
  }>(`/payments/${charge.data.id}/pixQrCode`, { method: "GET" });
  if (!pix.ok) return pix;

  // 4. Monta resposta unificada
  return {
    ok: true,
    data: {
      id: charge.data.id,
      customer: customer.data.id,
      value: input.value,
      netValue: input.value,
      status: "PENDING",
      billingType: "PIX",
      dueDate: input.dueDate,
      description: payload.description,
      invoiceUrl: null,
      pixTransaction: {
        encodedImage: pix.data.encodedImage,
        payload: pix.data.payload,
        expiresAt: pix.data.expirationDate,
      },
    },
  };
}

// ============== Consultas ==============

export async function getPayment(paymentId: string): Promise<AsaasResult<AsaasPayment>> {
  return request(`/payments/${paymentId}`, { method: "GET" });
}

// ============== Estorno / Cancelamento ==============

export async function refundPayment(
  paymentId: string,
  value?: number
): Promise<AsaasResult<unknown>> {
  return request(`/payments/${paymentId}/refund`, {
    method: "POST",
    json: value ? { value } : {},
  });
}

export async function cancelPayment(
  paymentId: string
): Promise<AsaasResult<unknown>> {
  return request(`/payments/${paymentId}`, { method: "DELETE" });
}

// ============== Sandbox: simulação ==============

/** Em sandbox, simula pagamento manual para testes */
export async function simulatePixReceived(
  paymentId: string
): Promise<AsaasResult<unknown>> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "Asaas não configurado." };
  if (cfg.env !== "sandbox") {
    return { ok: false, error: "Simulação só funciona em sandbox." };
  }
  // A API sandbox da Asaas não tem endpoint de simulação público,
  // mas clientes podem pagar com chave PIX de teste via app.
  return { ok: false, error: "Use um pagamento PIX real no sandbox para testar." };
}

// ============== Webhook ==============

/** Verifica assinatura HMAC do webhook (Asaas envia X-Asaas-Signature) */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto");
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    return safeEqual(expected, signature);
  } catch {
    return false;
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** Detecta se Asaas está configurado */
export function isAsaasConfigured(): boolean {
  return getConfig() !== null;
}

/** Util: retorna a URL do webhook (para enviar na criação) */
export function getWebhookUrl(): string | null {
  const url = process.env.ASAAS_WEBHOOK_URL;
  if (url) return url;
  const base = process.env.NEXTAUTH_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/api/webhooks/asaas`;
}