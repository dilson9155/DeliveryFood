/**
 * Helpers para disparo de notificações em diversos canais.
 *
 * Mantém toda a regra de "qual mensagem enviar" centralizada,
 * evitando duplicação entre actions.
 */

import { prisma } from "@/lib/prisma";
import {
  sendWhatsApp,
  messageOrderReceived,
  messageOrderConfirmed,
  messageOrderPreparing,
  messageOrderReady,
  messageOrderOutForDelivery,
  messageOrderDelivered,
  messageOrderCancelled,
  type OrderEventInput,
} from "@/lib/whatsapp";
import type { OrderStatus } from "@prisma/client";
import { PAYMENT_LABELS } from "@/lib/order-ui";
import { formatTime } from "@/lib/format";

type SendEventInput = {
  order: {
    id: string;
    number: number;
    total: number;
    deliveryMode: "PICKUP" | "DELIVERY";
    customer: { name: string; phone: string | null };
    paymentMethod: string;
    motoboy?: { name: string; phone: string | null } | null;
  };
  toStatus: OrderStatus;
};

const TRACKING_BASE_URL =
  process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";

function buildEventInput(order: SendEventInput["order"]): OrderEventInput {
  return {
    orderNumber: order.number,
    customerName: order.customer.name,
    total: order.total,
    paymentMethod:
      PAYMENT_LABELS[order.paymentMethod as keyof typeof PAYMENT_LABELS] ??
      order.paymentMethod,
    deliveryMode: order.deliveryMode,
    motoboyName: order.motoboy?.name ?? null,
    motoboyPhone: order.motoboy?.phone ?? null,
    trackingUrl: TRACKING_BASE_URL
      ? `${TRACKING_BASE_URL}/pedido/${order.id}`
      : `/pedido/${order.id}`,
  };
}

/** Seleciona o template certo baseado no status e envia WhatsApp. */
export async function sendOrderEventWhatsApp(
  payload: SendEventInput
): Promise<void> {
  if (!payload.order.customer.phone) return;
  const eventInput = buildEventInput(payload.order);
  let message: string | null = null;
  switch (payload.toStatus) {
    case "CONFIRMED":
      message = messageOrderConfirmed(eventInput);
      break;
    case "PREPARING":
      message = messageOrderPreparing(eventInput);
      break;
    case "READY":
      message = messageOrderReady(eventInput);
      break;
    case "OUT_FOR_DELIVERY":
      message = messageOrderOutForDelivery(eventInput);
      break;
    case "DELIVERED":
      message = messageOrderDelivered(eventInput);
      break;
    case "CANCELLED":
      message = messageOrderCancelled(eventInput);
      break;
  }
  if (!message) return;
  // Best-effort: ignora erros silenciosamente
  await sendWhatsApp({ phone: payload.order.customer.phone, text: message });
}

/** Envia confirmação de pedido criado (não depende de mudança de status) */
export async function sendOrderReceivedWhatsApp(
  order: SendEventInput["order"]
): Promise<void> {
  if (!order.customer.phone) return;
  const eventInput = buildEventInput(order);
  await sendWhatsApp({
    phone: order.customer.phone,
    text: messageOrderReceived(eventInput),
  });
}