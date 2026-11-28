"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { createOrderSchema } from "@/lib/validations";
import { priceDailyItems, reserveDailyStock } from "@/lib/daily-menu-pricing";
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
  Prisma,
} from "@prisma/client";
import type { OptionSelection } from "@/lib/product-options";

export type CreateOrderInput = {
  items: { productId: string; quantity: number; options?: OptionSelection[] }[];
  /** Marmitas do dia: mesmas regras de preço/estoque do PDV. */
  specialItems?: { mealId: string; sizeId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  observation?: string | null;
  // Snapshot exibido no recibo (nome/telefone/endereço informados no checkout).
  recipientName?: string;
  recipientPhone?: string;
  recipientAddress?: string | null;
  delivery?: {
    mode: DeliveryMode;
    addressId?: string;
    address?: {
      street: string;
      number: string;
      complement?: string | null;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
    };
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

  const productIds = [...new Set(parsed.data.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, active: true },
    include: {
      optionGroups: {
        where: { active: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: {
          options: { where: { active: true }, orderBy: [{ order: "asc" }, { name: "asc" }] },
        },
      },
    },
  });

  if (products.length !== productIds.length) {
    return { ok: false, error: "Algum produto está indisponível no momento." };
  }
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Preço e nome das opções são sempre recalculados no servidor: o cliente
  // envia apenas os ids e as quantidades escolhidas.
  let total = 0;
  const orderItems: {
    productId: string | null;
    productName: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    dailyMenuMealId?: string | null;
    dailyMenuSizeId?: string | null;
    options: {
      groupId: string;
      optionId: string;
      groupName: string;
      optionName: string;
      quantity: number;
      unitPrice: number;
    }[];
  }[] = [];

  for (const item of parsed.data.items) {
    const product = productMap.get(item.productId);
    if (!product) return { ok: false, error: "Algum produto está indisponível no momento." };

    const selections = item.options ?? [];
    let unitPrice = product.price;
    const options: (typeof orderItems)[number]["options"] = [];

    for (const selection of selections) {
      const group = product.optionGroups.find((g) => g.id === selection.groupId);
      if (!group) {
        return { ok: false, error: `Escolha inválida para ${product.name}.` };
      }
      const option = group.options.find((o) => o.id === selection.optionId);
      if (!option) {
        return { ok: false, error: `Opção indisponível em ${product.name}.` };
      }
      unitPrice = roundMoney(unitPrice + option.price * selection.quantity);
      options.push({
        groupId: group.id,
        optionId: option.id,
        groupName: group.name,
        optionName: option.name,
        quantity: selection.quantity,
        unitPrice: option.price,
      });
    }

    for (const group of product.optionGroups) {
      const chosen = selections
        .filter((s) => s.groupId === group.id)
        .reduce((sum, s) => sum + s.quantity, 0);
      if (group.required && chosen < group.minQuantity) {
        return {
          ok: false,
          error: `${product.name}: escolha ${group.minQuantity} opção(ões) em "${group.name}".`,
        };
      }
      if (chosen > group.maxQuantity) {
        return {
          ok: false,
          error: `${product.name}: no máximo ${group.maxQuantity} opção(ões) em "${group.name}".`,
        };
      }
    }

    const subtotal = roundMoney(unitPrice * item.quantity);
    total = roundMoney(total + subtotal);
    orderItems.push({
      productId: product.id,
      productName: product.name,
      unitPrice,
      quantity: item.quantity,
      subtotal,
      options,
    });
  }

  // Marmitas do dia entram no mesmo pedido dos produtos, com preço e estoque
  // recalculados no servidor a partir do cardápio vigente.
  const dailyPricing = await priceDailyItems(parsed.data.specialItems);
  if (!dailyPricing.ok) return { ok: false, error: dailyPricing.error };
  for (const item of dailyPricing.items) {
    orderItems.push(item);
    total = roundMoney(total + item.subtotal);
  }

  const customer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, active: true, name: true, phone: true, defaultObservation: true },
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
  const deliveryMode = deliveryInput?.mode ?? DeliveryMode.PICKUP;
  if (deliveryMode === DeliveryMode.DELIVERY && !context.settings.deliveryEnabled) {
    return {
      ok: false,
      error: "A entrega não está disponível no momento. Retire seu pedido na loja.",
    };
  }

  // Taxa fixa configurada pelo admin — nunca confiada no cliente.
  const deliveryFee = deliveryMode === DeliveryMode.DELIVERY
    ? roundMoney(context.settings.deliveryFee)
    : 0;
  const totalWithDelivery = roundMoney(total + deliveryFee);

  type AddressFields = {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
  };
  const formatAddress = (a: AddressFields) =>
    `${a.street}, ${a.number}${a.complement ? ` - ${a.complement}` : ""} — ${a.neighborhood}, ${a.city}/${a.state} — CEP ${a.zipCode}`.slice(0, 300);

  let addressFields: AddressFields | null = null;
  if (deliveryMode === DeliveryMode.DELIVERY) {
    if (deliveryInput?.addressId) {
      const addr = await prisma.address.findFirst({
        where: { id: deliveryInput.addressId, userId: customer.id },
      });
      if (addr) {
        addressFields = {
          street: addr.street,
          number: addr.number,
          complement: addr.complement,
          neighborhood: addr.neighborhood,
          city: addr.city,
          state: addr.state,
          zipCode: addr.zipCode,
        };
      }
    }
    if (!addressFields && deliveryInput?.address) {
      const a = deliveryInput.address;
      addressFields = {
        street: a.street,
        number: a.number,
        complement: a.complement ?? null,
        neighborhood: a.neighborhood,
        city: a.city,
        state: a.state,
        zipCode: a.zipCode,
      };
    }
    if (!addressFields) {
      return { ok: false, error: "Informe o endereço de entrega." };
    }
  }

  const recipientName = parsed.data.recipientName?.trim() || customer.name;
  const recipientPhone = parsed.data.recipientPhone || customer.phone || null;
  const recipientAddress = parsed.data.recipientAddress?.trim() ||
    (addressFields ? formatAddress(addressFields) : null);

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      await reserveDailyStock(tx, dailyPricing.stock);

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
        recipientName,
        recipientPhone,
        recipientAddress,
        items: {
          create: orderItems.map(
            (i): Prisma.OrderItemUncheckedCreateWithoutOrderInput => ({
              productId: i.productId,
              productName: i.productName,
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              subtotal: i.subtotal,
              ...(i.dailyMenuMealId
                ? {
                    dailyMenuMealId: i.dailyMenuMealId,
                    dailyMenuSizeId: i.dailyMenuSizeId,
                  }
                : {}),
              options: {
                create: i.options.map((o) => ({
                  groupId: o.groupId,
                  optionId: o.optionId,
                  groupName: o.groupName,
                  optionName: o.optionName,
                  quantity: o.quantity,
                  unitPrice: o.unitPrice,
                })),
              },
            })
          ),
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

    // Registro de entrega apenas para organizar a fila de recibos do entregador.
    // Sem coordenadas, rota, atribuição de motoboy ou rastreamento.
    if (deliveryMode === DeliveryMode.DELIVERY && addressFields) {
      await tx.delivery.create({
        data: {
          orderId: created.id,
          mode: DeliveryMode.DELIVERY,
          status: DeliveryStatus.PENDING,
          addressSnapshot: {
            ...addressFields,
            recipientName,
            recipientPhone,
          } as object,
          fee: deliveryFee,
        },
      });
    }

    // Notificações dentro da transação (best-effort: se falhar aqui
    // o rollback garante consistência)
    await tx.notification.create({
      data: {
        userId: null,
        type: "NEW_ORDER",
        title: `Novo pedido #${created.number}`,
        body: `${created.customer.name} realizou um pedido de ${created.items.length} item(ns) — ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalWithDelivery)}.`,
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
  } catch (error) {
    if (error instanceof Error && error.message.includes("acabou de esgotar")) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  await audit({
    userId: customer.id,
    action: "CREATE",
    resource: "order",
    entityId: order.id,
    details: `Pedido #${order.number} criado — total ${order.total}`,
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
  revalidatePath("/admin/fila-pedidos");
  revalidatePath("/admin/delivery");
  revalidatePath("/marmitas-do-dia");

  return { ok: true, orderId: order.id, number: order.number, total: order.total };
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

type QueueResult =
  | { ok: true; number: number; alreadyDone?: boolean }
  | { ok: false; error: string };

/** Sequência única da fila simplificada: cada clique avança quantos passos forem necessários. */
const DELIVERY_FLOW: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];
const PICKUP_FLOW: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.PICKED_UP,
  OrderStatus.FINISHED,
];

function stepsAfter(flow: OrderStatus[], current: OrderStatus): OrderStatus[] {
  const index = flow.indexOf(current);
  return index < 0 ? [] : flow.slice(index + 1);
}

/**
 * Fila de entregas: o operador confirma que recebeu o pedido.
 * O cliente passa a ver "recebido / em preparo" no acompanhamento.
 */
export async function confirmOrderReceiptAdminAction(
  orderId: string
): Promise<QueueResult> {
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
  if (!can(user, "orders.manage") && !can(user, "orders.prepare")) {
    return { ok: false, error: "Você não tem permissão para receber pedidos." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.status === OrderStatus.CANCELLED) {
    return { ok: false, error: "Pedido cancelado não pode ser recebido." };
  }
  if (
    order.deliveryMode !== DeliveryMode.DELIVERY ||
    stepsAfter(DELIVERY_FLOW, order.status).length === 0 ||
    DELIVERY_FLOW.indexOf(order.status) >= DELIVERY_FLOW.indexOf(OrderStatus.READY)
  ) {
    return { ok: true, number: order.number, alreadyDone: true };
  }

  const steps = stepsAfter(DELIVERY_FLOW, order.status).filter(
    (step) => DELIVERY_FLOW.indexOf(step) <= DELIVERY_FLOW.indexOf(OrderStatus.PREPARING)
  );
  const historyData = steps.map((toStatus, index) => ({
    orderId: order.id,
    fromStatus: index === 0 ? order.status : steps[index - 1],
    toStatus,
    userId: user.id,
  }));

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PREPARING },
    }),
    prisma.orderHistory.createMany({ data: historyData }),
  ]);

  await prisma.notification.create({
    data: {
      userId: order.customerId,
      type: "ORDER_STATUS",
      title: `Pedido #${order.number}: recebido e em preparo`,
      body: `Recebemos seu pedido #${order.number} e já estamos preparando para entrega.`,
      link: `/pedido/${order.id}`,
    },
  });

  await sendOrderEventWhatsApp({
    order: {
      id: order.id,
      number: order.number,
      total: order.total,
      deliveryMode: order.deliveryMode,
      customer: order.customer,
      paymentMethod: order.paymentMethod,
    },
    toStatus: OrderStatus.CONFIRMED,
  }).catch(() => undefined);

  await audit({
    userId: user.id,
    action: "STATUS_CHANGE",
    resource: "order",
    entityId: order.id,
    details: `Pedido #${order.number}: recebimento confirmado pela fila de entregas.`,
  });

  revalidatePath("/admin/fila-pedidos");
  revalidatePath("/admin/pedidos");
  revalidatePath(`/pedido/${order.id}`);
  revalidatePath("/admin/dashboard");

  return { ok: true, number: order.number };
}

/** Conclui a entrega em um clique, registrando todos os passos no histórico. */
export async function markOrderDeliveredAdminAction(
  orderId: string
): Promise<QueueResult> {
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
  if (!can(user, "orders.pickup") && !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para concluir pedidos." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, delivery: { include: { motoboy: true } } },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };
  if (order.status === OrderStatus.CANCELLED) {
    return { ok: false, error: "Pedido cancelado não pode ser entregue." };
  }
  if (
    order.status === OrderStatus.DELIVERED ||
    order.status === OrderStatus.FINISHED
  ) {
    return { ok: true, number: order.number, alreadyDone: true };
  }

  const flow = order.deliveryMode === DeliveryMode.DELIVERY ? DELIVERY_FLOW : PICKUP_FLOW;
  const steps = stepsAfter(flow, order.status);
  if (steps.length === 0) {
    return { ok: true, number: order.number, alreadyDone: true };
  }

  const now = new Date();
  const finalStatus = steps[steps.length - 1];
  const historyData = steps.map((toStatus, index) => ({
    orderId: order.id,
    fromStatus: index === 0 ? order.status : steps[index - 1],
    toStatus,
    userId: user.id,
  }));

  await prisma.$transaction([
    prisma.order.update({
      where: { id: order.id },
      data: { status: finalStatus },
    }),
    prisma.orderHistory.createMany({ data: historyData }),
    ...(order.delivery && finalStatus === OrderStatus.DELIVERED
      ? [
          prisma.delivery.update({
            where: { id: order.delivery.id },
            data: {
              status: DeliveryStatus.DELIVERED,
              pickedUpAt: order.delivery.pickedUpAt ?? now,
              deliveredAt: now,
            },
          }),
        ]
      : []),
  ]);

  await prisma.notification.create({
    data: {
      userId: order.customerId,
      type: "ORDER_STATUS",
      title: `Pedido #${order.number}: entregue`,
      body: `Seu pedido #${order.number} foi entregue. Obrigado!`,
      link: `/pedido/${order.id}`,
    },
  });

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
    toStatus: OrderStatus.DELIVERED,
  }).catch(() => undefined);

  await audit({
    userId: user.id,
    action: "STATUS_CHANGE",
    resource: "order",
    entityId: order.id,
    details: `Pedido #${order.number}: marcado como entregue pela fila operacional.`,
  });

  revalidatePath("/admin/fila-pedidos");
  revalidatePath("/admin/pedidos");
  revalidatePath(`/pedido/${order.id}`);
  revalidatePath("/admin/dashboard");

  return { ok: true, number: order.number };
}

/** Registra auditoria de impressão/reimpressão do comprovante. */
export async function registerReceiptPrintAction(
  orderId: string,
  reprint = false
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { number: true },
  });
  if (!order) return { ok: false, error: "Pedido não encontrado." };

  await audit({
    userId: session.user.id,
    action: "UPDATE",
    resource: "receipt",
    entityId: orderId,
    details: `Comprovante ${reprint ? "reimpresso" : "impresso"} — pedido #${order.number}.`,
  });
  return { ok: true };
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
        options: {
          groupId: string;
          optionId: string;
          groupName: string;
          optionName: string;
          quantity: number;
          unitPrice: number;
        }[];
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
          options: true,
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
      unitPrice: i.product!.price + i.options.reduce((s, o) => s + o.unitPrice * o.quantity, 0),
      imageUrl: i.product!.imageUrl,
      quantity: i.quantity,
      options: i.options.map((o) => ({
        groupId: o.groupId ?? o.groupName,
        optionId: o.optionId ?? o.optionName,
        groupName: o.groupName,
        optionName: o.optionName,
        quantity: o.quantity,
        unitPrice: o.unitPrice,
      })),
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