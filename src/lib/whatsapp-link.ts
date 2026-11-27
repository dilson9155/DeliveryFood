import { normalizePhone } from "@/lib/phone";
import { orderNumberLabel } from "@/lib/order-ui";

/**
 * Link wa.me com telefone normalizado e mensagem pré-preenchida.
 * Funciona sem Evolution API — abre o WhatsApp do operador.
 */
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message?: string
): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const query = message?.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";
  return `https://wa.me/${normalized}${query}`;
}

type OrderCallMessageInput = {
  orderNumber: number;
  customerName: string;
  deliveryMode: "PICKUP" | "DELIVERY";
  storeName?: string | null;
  status?: string;
};

/** Mensagem curta e profissional para chamar o cliente pelo pedido. */
export function buildOrderCallMessage(input: OrderCallMessageInput): string {
  const store = input.storeName?.trim() || "RestaurantePro";
  const firstName = input.customerName.trim().split(/\s+/)[0] || "cliente";
  const number = orderNumberLabel(input.orderNumber);
  const greeting = `Olá, ${firstName}! Aqui é o ${store}. Seu pedido ${number}`;

  const ready = ["READY", "OUT_FOR_DELIVERY", "PICKED_UP", "DELIVERED", "FINISHED"].includes(
    input.status ?? ""
  );
  const onTheWay = ["OUT_FOR_DELIVERY", "ARRIVED", "DELIVERED"].includes(
    input.status ?? ""
  );

  if (input.deliveryMode === "DELIVERY") {
    if (onTheWay) return `${greeting} está a caminho. Em instantes chegamos aí!`;
    if (ready) return `${greeting} já está pronto e será entregue em breve.`;
    return `${greeting} está em preparo. Avisaremos assim que sair para entrega.`;
  }

  if (ready) return `${greeting} está pronto para retirada. Pode vir buscar quando quiser!`;
  return `${greeting} está em preparo. Avisaremos assim que estiver pronto para retirada.`;
}
