import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentProviderStatus } from "@prisma/client";

/**
 * Webhook Asaas - recebe notificações de mudança de status
 * de cobranças PIX.
 *
 * Eventos processados:
 *   - PAYMENT_RECEIVED  - PIX confirmado (mais comum)
 *   - PAYMENT_CONFIRMED - Cartão autorizado
 *   - PAYMENT_OVERDUE   - Vencido
 *   - PAYMENT_REFUNDED  - Estornado
 *
 * Segurança: valida assinatura HMAC se ASAAS_WEBHOOK_SECRET
 * estiver configurado. Em produção, é obrigatório.
 */

export const dynamic = "force-dynamic";

type AsaasWebhookBody = {
  event: string;
  payment?: {
    id: string;
    status: string;
    value: number;
    netValue: number;
    customer: string;
    billingType: string;
    confirmedDate?: string;
    paymentDate?: string;
  };
};

export async function POST(req: Request) {
  const rawBody = await req.text();

  // Validação de assinatura (opcional mas recomendado)
  const secret = process.env.ASAAS_WEBHOOK_SECRET;
  if (secret) {
    const sig = req.headers.get("asaas-access-token") || req.headers.get("x-asaas-signature");
    const { verifyWebhookSignature } = await import("@/lib/asaas");
    if (!verifyWebhookSignature(rawBody, sig, secret)) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }
  }

  let body: AsaasWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.event || !body.payment) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Encontra o intent pelo payment ID da Asaas
  const intent = await prisma.paymentIntent.findFirst({
    where: { providerPaymentId: body.payment.id },
  });
  if (!intent) {
    // Não temos o intent — pode ser de outro sistema. Silencioso.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Mapeia evento Asaas → nosso enum
  let newStatus: PaymentProviderStatus = PaymentProviderStatus.PENDING;
  let paid = false;
  switch (body.event) {
    case "PAYMENT_RECEIVED":
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED_IN_CASH":
      newStatus = PaymentProviderStatus.PAID;
      paid = true;
      break;
    case "PAYMENT_OVERDUE":
      newStatus = PaymentProviderStatus.PENDING;
      break;
    case "PAYMENT_REFUNDED":
      newStatus = PaymentProviderStatus.REFUNDED;
      break;
    case "PAYMENT_CANCELLED":
    case "PAYMENT_CANCELED":
    case "PAYMENT_DELETED":
      newStatus = PaymentProviderStatus.CANCELED;
      break;
    default:
      // evento não tratado, ignora
      return NextResponse.json({ ok: true, ignored: true });
  }

  // Atualiza intent
  await prisma.paymentIntent.update({
    where: { id: intent.id },
    data: {
      status: newStatus,
      paidAt: paid && !intent.paidAt ? new Date() : intent.paidAt,
      rawLastResponse: body as unknown as object,
    },
  });

  // Log do evento
  await prisma.paymentEvent.create({
    data: {
      intentId: intent.id,
      type: `webhook.${body.event.toLowerCase()}`,
      rawPayload: body as unknown as object,
    },
  });

  // Se confirmou, atualiza Order + Payment
  if (paid) {
    await prisma.order.update({
      where: { id: intent.orderId },
      data: { paymentStatus: "CONFIRMED" },
    });
    await prisma.payment.upsert({
      where: { orderId: intent.orderId },
      update: {
        status: "CONFIRMED",
        confirmedAt: new Date(),
        method: "PIX",
      },
      create: {
        orderId: intent.orderId,
        method: "PIX",
        status: "CONFIRMED",
        amount: intent.amount,
        confirmedAt: new Date(),
      },
    });
  }

  return NextResponse.json({ ok: true });
}