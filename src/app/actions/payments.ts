"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  createPixPayment,
  getPayment,
  refundPayment,
  isAsaasConfigured,
  type AsaasPayment,
} from "@/lib/asaas";
import { PaymentProvider, PaymentProviderStatus } from "@prisma/client";
import { roundMoney } from "@/lib/format";

type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

type PixCreated = {
  paymentId: string;
  intentId: string;
  qrBase64: string | null;
  qrText: string | null;
  expiresAt: string | null;
};

/**
 * A API PIX do Asaas pode devolver uma validade distante (ex.: 1 ano).
 * Limitamos a 1h, que é o tempo de confirmação do pedido — e é o valor
 * usado como fallback quando a API não informa a expiração.
 */
function resolvePixExpiry(asaasExpiresAt: string | null | undefined): Date {
  const max = new Date(Date.now() + 60 * 60 * 1000);
  if (!asaasExpiresAt) return max;
  const parsed = new Date(asaasExpiresAt);
  if (Number.isNaN(parsed.getTime())) return max;
  return parsed.getTime() > max.getTime() ? max : parsed;
}

/** Cria um PIX no Asaas para o pedido */
export async function createPixForOrderAction(
  orderId: string
): Promise<ActionResult<PixCreated>> {
  const session = await auth();
  if (!session?.user || session.user.userType !== "CUSTOMER") {
    return { ok: false, error: "Faça login para pagar." };
  }

  if (!isAsaasConfigured()) {
    return { ok: false, error: "Pagamento online indisponível no momento." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          taxId: true,
          defaultObservation: true,
        },
      },
      items: { select: { quantity: true, productName: true, subtotal: true } },
    },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.customerId !== session.user.id) {
    return { ok: false, error: "Este pedido não é seu." };
  }
  if (order.paymentStatus === "CONFIRMED") {
    return { ok: false, error: "Este pedido já foi pago." };
  }

  if (!order.customer.taxId) {
    return {
      ok: false,
      error:
        "Para pagar com PIX é necessário informar seu CPF/CNPJ. Atualize em Meus Dados.",
    };
  }

  // Reusa o intent se já existe e ainda está válido
  const existing = await prisma.paymentIntent.findUnique({ where: { orderId } });
  if (existing && existing.status === "PENDING" && existing.providerPaymentId) {
    // Re-consulta na API para checar se o QR ainda é válido
    const check = await getPayment(existing.providerPaymentId);
    if (
      check.ok &&
      check.data.status === "PENDING" &&
      existing.pixExpiresAt &&
      existing.pixExpiresAt > new Date()
    ) {
      return {
        ok: true,
        paymentId: existing.providerPaymentId,
        intentId: existing.id,
        qrBase64: existing.qrCodeBase64,
        qrText: existing.qrCodeText,
        expiresAt: existing.pixExpiresAt.toISOString(),
      };
    }
  }

  const taxId = order.customer.taxId; // já validado acima
  const email = order.customer.email || `pedido-${order.number}@delivery.local`;
  const phone = order.customer.phone?.replace(/\D/g, "") ?? "";

  const dueDate = new Date(Date.now() + 60 * 60 * 1000) // +1h
    .toISOString()
    .slice(0, 10);

  const result = await createPixPayment({
    customer: "",
    customerData: {
      name: order.customer.name,
      cpfCnpj: taxId,
      email,
      phone: phone || undefined,
    },
    value: roundMoney(order.total),
    dueDate,
    description: `Pedido #${String(order.number).padStart(4, "0")} - ${order.items.length} item(ns)`,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Cria/atualiza PaymentIntent no banco
  const pix = result.data.pixTransaction;
  const intent = existing
    ? await prisma.paymentIntent.update({
        where: { id: existing.id },
        data: {
          provider: PaymentProvider.ASAAS,
          providerPaymentId: result.data.id,
          status: PaymentProviderStatus.PENDING,
          method: "PIX",
          amount: roundMoney(order.total),
          qrCodeBase64: pix?.encodedImage ?? null,
          qrCodeText: pix?.payload ?? null,
          pixExpiresAt: resolvePixExpiry(pix?.expiresAt),
          invoiceUrl: result.data.invoiceUrl,
          rawLastResponse: result.data as unknown as object,
        },
      })
    : await prisma.paymentIntent.create({
        data: {
          orderId: order.id,
          provider: PaymentProvider.ASAAS,
          providerPaymentId: result.data.id,
          status: PaymentProviderStatus.PENDING,
          method: "PIX",
          amount: roundMoney(order.total),
          qrCodeBase64: pix?.encodedImage ?? null,
          qrCodeText: pix?.payload ?? null,
          pixExpiresAt: resolvePixExpiry(pix?.expiresAt),
          invoiceUrl: result.data.invoiceUrl,
          rawLastResponse: result.data as unknown as object,
        },
      });

  await prisma.paymentEvent.create({
    data: {
      intentId: intent.id,
      type: "pix.created",
      rawPayload: result.data as unknown as object,
    },
  });

  return {
    ok: true,
    paymentId: result.data.id,
    intentId: intent.id,
    qrBase64: intent.qrCodeBase64,
    qrText: intent.qrCodeText,
    expiresAt: intent.pixExpiresAt ? intent.pixExpiresAt.toISOString() : null,
  };
}

/** Consulta o status atual do PIX no Asaas (para o polling) */
export async function refreshPixStatusAction(
  orderId: string
): Promise<ActionResult<{ status: string; paid: boolean }>> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Faça login." };

  const intent = await prisma.paymentIntent.findUnique({
    where: { orderId },
  });
  if (!intent || !intent.providerPaymentId) {
    return { ok: false, error: "PIX não gerado." };
  }

  const result = await getPayment(intent.providerPaymentId);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  // Mapeia status Asaas → nosso enum
  let newStatus: PaymentProviderStatus = PaymentProviderStatus.PENDING;
  let paid = false;
  switch (result.data.status) {
    case "PENDING":
    case "OVERDUE":
      newStatus = PaymentProviderStatus.PENDING;
      break;
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      newStatus = PaymentProviderStatus.PAID;
      paid = true;
      break;
    case "REFUNDED":
      newStatus = PaymentProviderStatus.REFUNDED;
      break;
    case "CANCELLED": {
      newStatus = PaymentProviderStatus.CANCELED;
      break;
    }
    default:
      newStatus = PaymentProviderStatus.PENDING;
  }

  // Atualiza intent
  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: newStatus,
      paidAt: paid && !intent.paidAt ? new Date() : intent.paidAt,
      rawLastResponse: result.data as unknown as object,
    },
  });

  // Se confirmou, atualiza Order + Payment
  if (paid) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "CONFIRMED",
      },
    });
    await prisma.payment.upsert({
      where: { orderId },
      update: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
      },
      create: {
        orderId,
        method: "PIX",
        status: "CONFIRMED",
        amount: intent.amount,
        confirmedAt: new Date(),
      },
    });
    revalidatePath(`/pedido/${orderId}`);
    revalidatePath(`/admin/pedidos`);
    revalidatePath(`/admin/dashboard`);
  }

  await prisma.paymentEvent.create({
    data: {
      intentId: intent.id,
      type: `status.${result.data.status.toLowerCase()}`,
      rawPayload: result.data as unknown as object,
    },
  });

  return { ok: true, status: result.data.status, paid };
}

/** Estorna/cancela uma cobrança PIX (admin) */
export async function refundPaymentAction(
  orderId: string
): Promise<ActionResult<unknown>> {
  const session = await auth();
  if (!session?.user || session.user.userType !== "EMPLOYEE") {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }

  const intent = await prisma.paymentIntent.findUnique({
    where: { orderId },
  });
  if (!intent?.providerPaymentId) {
    return { ok: false, error: "PIX não encontrado para este pedido." };
  }
  if (intent.status !== PaymentProviderStatus.PAID) {
    return { ok: false, error: "Só é possível ver pagamentos confirmados." };
  }

  const result = await refundPayment(intent.providerPaymentId);
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: PaymentProviderStatus.REFUNDED,
    },
  });

  await audit({
    userId: session.user.id,
    action: "PAYMENT",
    resource: "payment_intent",
    entityId: intent.id,
    details: "Pagamento estornado via Asaas",
  });

  revalidatePath(`/admin/pedidos`);
  revalidatePath(`/pedido/${orderId}`);
  return { ok: true };
}