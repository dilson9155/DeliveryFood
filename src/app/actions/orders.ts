"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { createOrderSchema } from "@/lib/validations";
import { roundMoney } from "@/lib/format";
import { getStoreContext } from "@/lib/store-status";
import {
  sendOrderEventWhatsApp,
  sendOrderReceivedWhatsApp,
} from "@/lib/notify";
import {
  OrderStatus,
  PaymentStatus,
  UserType,
  DeliveryMode,
  DeliveryStatus,
  type Order,
  type PaymentMethod,
} from "@prisma/client";

export type CreateOrderInput = {
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  observation?: string | null;
  delivery?: {
    mode: DeliveryMode;
    addressId?: string;
    // Snapshot de endereço (caso o cliente não tenha salvo)
    address?: {
      street: string;
      number: string;
      complement?: string | null;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
    };
    fee?: number;
    distanceKm?: number;
    lat?: number;
    lng?: number;
  };
};

export type OrderActionResult =
  | { ok: true; orderId: string; number: number; total: number }
  | { ok: false; error: string };

export async function createOrderAction(
  input: CreateOrderInput
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Faça login para realizar o pedido." };
  }
  if (session.user.userType !== UserType.CUSTOMER) {
    return { ok: false, error: "Sessão inválida para cliente." };
  }

  const parsed = createOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Dados do pedido inválidos." };
  }

  const context = await getStoreContext();
  if (!context.open) {
    return { ok: false, error: "Estamos fechados no momento. Tente novamente no próximo horário de atendimento." };
  }

  const products = await prisma.product.findMany({
    where: {
      id: { in: parsed.data.items.map((i) => i.productId) },
      active: true,
    },
  });

  if (products.length !== new Set(parsed.data.items.map((i) => i.productId)).size) {
    return { ok: false, error: "Algum produto está indisponível no momento." };
  }

  const priceMap = new Map(products.map((p) => [p.id, p.price]));

  let total = 0;
  const orderItems = parsed.data.items.map((i) => {
    const unitPrice = priceMap.get(i.productId);
    if (unitPrice === undefined) {
      return null;
    }
    const subtotal = roundMoney(unitPrice * i.quantity);
    total = roundMoney(total + subtotal);
    const product = products.find((p) => p.id === i.productId)!;
    return {
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity: i.quantity,
      subtotal,
    };
  });

  if (orderItems.some((i) => i === null)) {
    return { ok: false, error: "Algum produto está indisponível no momento." };
  }

  const customer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, active: true, name: true, defaultObservation: true },
  });
  if (!customer || !customer.active) {
    return { ok: false, error: "Conta inválida. Fale conosco." };
  }

  // Observação final: usa a do pedido ou a padrão do cliente se vazia
  const observation =
    parsed.data.observation?.trim() ||
    customer.defaultObservation ||
    null;

  // Cria pedido + itens + histórico + pagamento em uma única transação
  // para garantir que ou tudo persiste, ou nada persiste.
  const deliveryInput = parsed.data.delivery;
  const order = await prisma.$transaction(async (tx) => {
    const deliveryMode = deliveryInput?.mode ?? DeliveryMode.PICKUP;
    const deliveryFee = deliveryMode === DeliveryMode.DELIVERY
      ? roundMoney(deliveryInput?.fee ?? 0)
      : 0;
    const totalWithDelivery = roundMoney(total + deliveryFee);

    const created = await tx.order.create({
      data: {
        customerId: customer.id,
        subtotal: total,
        deliveryFee,
        total: totalWithDelivery,
        paymentMethod: parsed.data.paymentMethod,
        paymentStatus: PaymentStatus.PENDING,
        observation,
        status: OrderStatus.NEW,
        deliveryMode,
        items: {
          create: orderItems as {
            productId: string;
            productName: string;
            unitPrice: number;
            quantity: number;
            subtotal: number;
          }[],
        },
        history: {
          create: { toStatus: OrderStatus.NEW, userId: customer.id },
        },
        payment: {
          create: {
            method: parsed.data.paymentMethod,
            status: PaymentStatus.PENDING,
            amount: totalWithDelivery,
          },
        },
      },
      include: { customer: true, items: true },
    });

    // Se for entrega, cria o registro de Delivery com snapshot do endereço
    if (deliveryMode === DeliveryMode.DELIVERY) {
      let addressSnapshot: Record<string, unknown> | null = null;
      let distanceKm: number | null = null;
      let lat: number | null = null;
      let lng: number | null = null;

      if (deliveryInput?.addressId) {
        const addr = await tx.address.findFirst({
          where: { id: deliveryInput.addressId, userId: customer.id },
        });
        if (addr) {
          addressSnapshot = {
            label: addr.label,
            recipientName: addr.recipientName,
            street: addr.street,
            number: addr.number,
            complement: addr.complement,
            neighborhood: addr.neighborhood,
            city: addr.city,
            state: addr.state,
            zipCode: addr.zipCode,
            lat: addr.lat,
            lng: addr.lng,
          };
          lat = addr.lat;
          lng = addr.lng;
        }
      }
      if (!addressSnapshot && deliveryInput?.address) {
        const a = deliveryInput.address;
        addressSnapshot = {
          label: null,
          recipientName: null,
          street: a.street,
          number: a.number,
          complement: a.complement ?? null,
          neighborhood: a.neighborhood,
          city: a.city,
          state: a.state,
          zipCode: a.zipCode,
          lat: deliveryInput.lat ?? null,
          lng: deliveryInput.lng ?? null,
        };
        lat = deliveryInput.lat ?? null;
        lng = deliveryInput.lng ?? null;
      }
      distanceKm = deliveryInput?.distanceKm ?? null;

      if (addressSnapshot) {
        await tx.delivery.create({
          data: {
            orderId: created.id,
            mode: DeliveryMode.DELIVERY,
            status: DeliveryStatus.PENDING,
            addressSnapshot: addressSnapshot as object,
            distanceKm,
          },
        });
      }
    }

    // Notificações dentro da transação (best-effort: se falhar aqui
    // o rollback garante consistência)
    await tx.notification.create({
      data: {
        userId: null,
        type: "NEW_ORDER",
        title: `Novo pedido #${created.number}`,
        body: `${created.customer.name} realizou um pedido de ${created.items.length} item(ns) — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}.`,
        link: `/admin/pedidos`,
      },
    });

    await tx.notification.create({
      data: {
        userId: customer.id,
        type: "ORDER_STATUS",
        title: `Pedido #${created.number} recebido`,
        body: "Seu pedido foi recebido e aguarda confirmação do estabelecimento.",
        link: `/pedido/${created.id}`,
      },
    });

    return created;
  });

  await audit({
    userId: customer.id,
    action: "CREATE",
    resource: "order",
    entityId: order.id,
    details: `Pedido #${order.number} criado — total ${total + (deliveryInput?.fee ?? 0)}`,
  });

  // Notificação WhatsApp (best-effort)
  await sendOrderReceivedWhatsApp({
    id: order.id,
    number: order.number,
    total: order.total,
    deliveryMode: order.deliveryMode,
    customer: order.customer,
    paymentMethod: order.paymentMethod,
  }).catch(() => undefined);

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/delivery");

  return { ok: true, orderId: order.id, number: order.number, total: total + (deliveryInput?.fee ?? 0) };
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  NEW: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  PREPARING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.PICKED_UP, OrderStatus.OUT_FOR_DELIVERY, OrderStatus.FINISHED],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  PICKED_UP: [OrderStatus.FINISHED],
  DELIVERED: [OrderStatus.FINISHED],
  FINISHED: [],
  CANCELLED: [],
};

const TRANSITION_LABELS: Record<OrderStatus, string> = {
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

function assertTransition(user: SessionUser, current: OrderStatus, next: OrderStatus): string | null {
  if (current === next) return "O pedido já está nesse status.";
  if (!ALLOWED_TRANSITIONS[current].includes(next)) {
    return `Não é possível mudar de "${TRANSITION_LABELS[current]}" para "${TRANSITION_LABELS[next]}".`;
  }

  if (next === OrderStatus.CANCELLED && !can(user, "orders.cancel")) {
    return "Você não tem permissão para cancelar pedidos.";
  }
  if (next === OrderStatus.PREPARING || next === OrderStatus.READY) {
    if (next === OrderStatus.READY && !can(user, "orders.prepare")) {
      return "Você não tem permissão para marcar como pronto.";
    }
  }
  return null;
}

export async function changeOrderStatusAction(
  orderId: string,
  toStatus: OrderStatus
): Promise<OrderActionResult> {
  const session = await auth();
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const user: SessionUser = {
    id: session.user.id,
    userType: session.user.userType,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      delivery: { include: { motoboy: true } },
    },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };

  const denied = assertTransition(user, order.status, toStatus);
  if (denied) return { ok: false, error: denied };

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: toStatus,
      history: {
        create: {
          fromStatus: order.status,
          toStatus,
          userId: session.user.id,
        },
      },
    },
    include: { history: true },
  });

  await prisma.notification.create({
    data: {
      userId: order.customerId,
      type: "ORDER_STATUS",
      title: `Pedido #${order.number}: ${TRANSITION_LABELS[toStatus]}`,
      body: `Seu pedido #${order.number} agora está "${TRANSITION_LABELS[toStatus]}".`,
      link: `/pedido/${order.id}`,
    },
  });

  // Notificação WhatsApp ao cliente (best-effort)
  await sendOrderEventWhatsApp({
    order: {
      id: order.id,
      number: order.number,
      total: order.total,
      deliveryMode: order.deliveryMode,
      customer: order.customer,
      paymentMethod: order.paymentMethod,
      motoboy: order.delivery?.motoboy
        ? { name: order.delivery.motoboy.name, phone: order.delivery.motoboy.phone }
        : null,
    },
    toStatus,
  }).catch(() => undefined);

  await audit({
    userId: session.user.id,
    action: "STATUS_CHANGE",
    resource: "order",
    entityId: order.id,
    details: `Pedido #${order.number}: ${TRANSITION_LABELS[order.status]} → ${TRANSITION_LABELS[toStatus]}`,
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/pedido/${order.id}`);
  revalidatePath("/admin/dashboard");

  return { ok: true, orderId: order.id, number: order.number, total: updated.total };
}

export type OrderWithRelations = Order & {
  customer: { name: string; phone: string | null };
  items: { id: string; productName: string; quantity: number; unitPrice: number; subtotal: number }[];
};

/**
 * Busca os itens de um pedido anterior do cliente para permitir
 * "pedir de novo". Retorna apenas itens cujo produto ainda existe
 * e está ativo, para evitar carrinho com produto indisponível.
 */
export async function getOrderForReorderAction(
  orderId: string
): Promise<
  | {
      ok: true;
      items: {
        productId: string;
        productName: string;
        unitPrice: number;
        imageUrl: string | null;
        quantity: number;
      }[];
    }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user || session.user.userType !== UserType.CUSTOMER) {
    return { ok: false, error: "Faça login para repetir um pedido." };
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId: session.user.id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, price: true, imageUrl: true, active: true } },
        },
      },
    },
  });

  if (!order) {
    return { ok: false, error: "Pedido não encontrado." };
  }

  const items = order.items
    .filter((i) => i.product && i.product.active)
    .map((i) => ({
      productId: i.product!.id,
      productName: i.product!.name,
      unitPrice: i.product!.price,
      imageUrl: i.product!.imageUrl,
      quantity: i.quantity,
    }));

  return { ok: true, items };
}

// === Desconto de finalização ===
// Aplica (ou remove) um desconto não-fiscal ao pedido.
// Limites: só permitido em pedidos não finalizados/cancelados.
// Valor máximo: subtotal + deliveryFee (não zoma o pedido).

export type DiscountResult =
  | { ok: true; discount: number; newTotal: number }
  | { ok: false; error: string };

export async function applyDiscountAction(
  orderId: string,
  amount: number,
  reason: string
): Promise<DiscountResult> {
  const session = await auth();
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  if (!can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "orders.discount"
  )) {
    return { ok: false, error: "Você não tem permissão para aplicar descontos." };
  }

  const reasonTrim = reason.trim();
  if (!reasonTrim) {
    return { ok: false, error: "Informe o motivo do desconto." };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, error: "Valor de desconto inválido." };
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.status === OrderStatus.FINISHED || order.status === OrderStatus.CANCELLED) {
    return { ok: false, error: "Não é possível alterar um pedido finalizado ou cancelado." };
  }

  // Limite máximo = subtotal + deliveryFee (não pode exceder o total original)
  const maxDiscount = roundMoney(order.subtotal + order.deliveryFee);
  if (amount > maxDiscount) {
    return { ok: false, error: `O desconto máximo permitido é R$ ${maxDiscount.toFixed(2)}.` };
  }

  const newTotal = roundMoney(order.subtotal + order.deliveryFee - amount);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      discount: roundMoney(amount),
      discountReason: reasonTrim,
      discountByUserId: session.user.id,
      total: newTotal,
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE",
    resource: "order",
    entityId: orderId,
    details: `Desconto de R$ ${amount.toFixed(2)} aplicado — "${reasonTrim}" (não fiscal)`,
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/dashboard");
  revalidatePath(`/pedido/${orderId}`);

  return { ok: true, discount: roundMoney(amount), newTotal };
}

export async function removeDiscountAction(orderId: string): Promise<DiscountResult> {
  const session = await auth();
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  if (!can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "orders.discount"
  )) {
    return { ok: false, error: "Você não tem permissão para remover descontos." };
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.status === OrderStatus.FINISHED || order.status === OrderStatus.CANCELLED) {
    return { ok: false, error: "Não é possível alterar um pedido finalizado ou cancelado." };
  }
  if (order.discount <= 0) {
    return { ok: false, error: "Este pedido não possui desconto." };
  }

  const newTotal = roundMoney(order.subtotal + order.deliveryFee);

  await prisma.order.update({
    where: { id: orderId },
    data: {
      discount: 0,
      discountReason: null,
      discountByUserId: null,
      total: newTotal,
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE",
    resource: "order",
    entityId: orderId,
    details: "Desconto removido",
  });

  revalidatePath("/admin/pedidos");
  revalidatePath(`/pedido/${orderId}`);
  return { ok: true, discount: 0, newTotal };
}