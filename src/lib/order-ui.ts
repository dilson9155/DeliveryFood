import type { OrderStatus, PaymentMethod, PaymentStatus, DeliveryStatus } from "@prisma/client";

type Tone = "default" | "muted" | "success" | "warning" | "danger" | "info" | "brand";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Novo",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparação",
  READY: "Pronto",
  OUT_FOR_DELIVERY: "Saiu para entrega",
  PICKED_UP: "Retirado",
  DELIVERED: "Entregue",
  FINISHED: "Finalizado",
  CANCELLED: "Cancelado",
};

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  NEW: "info",
  CONFIRMED: "brand",
  PREPARING: "warning",
  READY: "success",
  OUT_FOR_DELIVERY: "info",
  PICKED_UP: "default",
  DELIVERED: "success",
  FINISHED: "success",
  CANCELLED: "danger",
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  CARD: "Cartão",
  PIX: "PIX",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  CANCELLED: "Cancelado",
};

export const STATUS_STEPS: OrderStatus[] = [
  "NEW",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "PICKED_UP",
  "FINISHED",
];

/** Etapas exibidas para pedidos com ENTREGA (substituem PICKED_UP/FINISHED). */
export const STATUS_STEPS_DELIVERY: OrderStatus[] = [
  "NEW",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Aguardando motoboy",
  ASSIGNED: "Motoboy atribuído",
  OUT_FOR_DELIVERY: "A caminho",
  ARRIVED: "No endereço",
  DELIVERED: "Entregue",
  FAILED: "Não entregue",
};

export const DELIVERY_STATUS_STEPS: DeliveryStatus[] = [
  "PENDING",
  "ASSIGNED",
  "OUT_FOR_DELIVERY",
  "ARRIVED",
  "DELIVERED",
];

export function orderNumberLabel(number: number) {
  return `#${String(number).padStart(4, "0")}`;
}