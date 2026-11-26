"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { priceItems } from "@/lib/order-pricing";
import { roundMoney } from "@/lib/format";
import { sendOrderReceivedWhatsApp } from "@/lib/notify";
import {
  addComandaItemsSchema,
  closeComandaSchema,
  comandaItemQuantitySchema,
  openComandaSchema,
  transferComandaSchema,
} from "@/lib/validations";
import {
  CashMovementType,
  ComandaStatus,
  DeliveryMode,
  OrderStatus,
  PaymentStatus,
  UserType,
  type PaymentMethod,
} from "@prisma/client";

type SimpleResult = { ok: true } | { ok: false; error: string };
type OpenResult =
  | { ok: true; id: string; number: number; tableLabel: string }
  | { ok: false; error: string };
type CloseResult =
  | { ok: true; orderId: string; orderNumber: number; total: number }
  | { ok: false; error: string };

function employeeOrError(session: unknown): SessionUser | null {
  const s = session as {
    user?: {
      id: string;
      userType: UserType;
      role: SessionUser["role"];
      name?: string | null;
      email?: string | null;
    };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) return null;
  return {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role,
    name: s.user.name,
    email: s.user.email,
  };
}

async function openComandaOrError(comandaId: string) {
  const comanda = await prisma.comanda.findUnique({
    where: { id: comandaId },
    include: {
      table: true,
      customer: { select: { id: true, name: true, phone: true } },
      items: { orderBy: { createdAt: "asc" }, include: { options: true } },
    },
  });
  if (!comanda) return { error: "Comanda não encontrada." } as const;
  if (comanda.status !== ComandaStatus.OPEN) {
    return { error: "Esta comanda já foi encerrada." } as const;
  }
  return { comanda } as const;
}

/** Cliente padrão usado quando a comanda foi aberta sem cliente. */
async function findOrCreateWalkInCustomer() {
  const email = "consumidor.final@restaurantepro.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(randomBytes(18).toString("hex"), 10);
  return prisma.user.create({
    data: {
      userType: UserType.CUSTOMER,
      name: "Consumidor final",
      email,
      password: passwordHash,
      active: true,
    },
  });
}

export async function openComandaAction(input: {
  tableId: string;
  customerId?: string | null;
  customerName?: string | null;
  observation?: string | null;
}): Promise<OpenResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para abrir comandas." };
  }

  const parsed = openComandaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const [table, alreadyOpen] = await Promise.all([
    prisma.restaurantTable.findUnique({ where: { id: data.tableId } }),
    prisma.comanda.findFirst({
      where: { tableId: data.tableId, status: ComandaStatus.OPEN },
      select: { number: true },
    }),
  ]);
  if (!table || !table.active) return { ok: false, error: "Mesa indisponível." };
  if (alreadyOpen) {
    return {
      ok: false,
      error: `A ${table.label ?? `mesa ${table.number}`} já tem a comanda #${alreadyOpen.number} aberta.`,
    };
  }

  if (data.customerId) {
    const customer = await prisma.user.findFirst({
      where: { id: data.customerId, userType: UserType.CUSTOMER, active: true },
      select: { id: true },
    });
    if (!customer) return { ok: false, error: "Cliente não encontrado." };
  }

  const comanda = await prisma.comanda.create({
    data: {
      tableId: table.id,
      customerId: data.customerId || null,
      customerName: data.customerName?.trim() || null,
      observation: data.observation?.trim() || null,
      openedBy: user.id,
    },
  });

  await audit({
    userId: user.id,
    action: "CREATE",
    resource: "comanda",
    entityId: comanda.id,
    details: `Comanda #${comanda.number} aberta em ${table.label ?? `mesa ${table.number}`}`,
  });

  revalidatePath("/admin/comandas");
  revalidatePath("/admin/mesas");
  return {
    ok: true,
    id: comanda.id,
    number: comanda.number,
    tableLabel: table.label ?? `Mesa ${table.number}`,
  };
}

export async function addComandaItemsAction(input: {
  comandaId: string;
  items: { productId: string; quantity: number; options?: { groupId: string; optionId: string; quantity: number }[] }[];
}): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para usar comandas." };
  }

  const parsed = addComandaItemsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Itens inválidos." };
  }

  const checked = await openComandaOrError(parsed.data.comandaId);
  if (checked.error) return { ok: false, error: checked.error };

  const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];
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
    return { ok: false, error: "Algum produto não está mais disponível." };
  }

  const priced = priceItems(parsed.data.items, products);
  if (!priced.ok) return { ok: false, error: priced.error };

  const total = await prisma.$transaction(async (tx) => {
    for (const item of priced.items) {
      await tx.comandaItem.create({
        data: {
          comandaId: parsed.data.comandaId,
          productId: item.productId,
          productName: item.productName,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          subtotal: item.subtotal,
          options: {
            create: item.options.map((option) => ({
              groupId: option.groupId,
              optionId: option.optionId,
              groupName: option.groupName,
              optionName: option.optionName,
              quantity: option.quantity,
              unitPrice: option.unitPrice,
            })),
          },
        },
      });
    }
    const all = await tx.comandaItem.findMany({
      where: { comandaId: parsed.data.comandaId },
      select: { subtotal: true },
    });
    return roundMoney(all.reduce((sum, item) => sum + item.subtotal, 0));
  });

  revalidatePath("/admin/comandas");
  return { ok: true, total };
}

export async function setComandaItemQuantityAction(input: {
  itemId: string;
  quantity: number;
}): Promise<SimpleResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para usar comandas." };
  }

  const parsed = comandaItemQuantitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Quantidade inválida." };

  const item = await prisma.comandaItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { comanda: { select: { status: true } } },
  });
  if (!item || item.comanda.status !== ComandaStatus.OPEN) {
    return { ok: false, error: "Item ou comanda indisponível." };
  }

  if (parsed.data.quantity === 0) {
    await prisma.comandaItem.delete({ where: { id: item.id } });
  } else {
    await prisma.comandaItem.update({
      where: { id: item.id },
      data: {
        quantity: parsed.data.quantity,
        subtotal: roundMoney(item.unitPrice * parsed.data.quantity),
      },
    });
  }

  revalidatePath("/admin/comandas");
  return { ok: true };
}

export async function removeComandaItemAction(itemId: string): Promise<SimpleResult> {
  return setComandaItemQuantityAction({ itemId, quantity: 0 });
}

export async function setComandaObservationAction(
  comandaId: string,
  observation: string
): Promise<SimpleResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para usar comandas." };
  }

  const checked = await openComandaOrError(comandaId);
  if (checked.error) return { ok: false, error: checked.error };

  await prisma.comanda.update({
    where: { id: comandaId },
    data: { observation: observation.slice(0, 500).trim() || null },
  });

  revalidatePath("/admin/comandas");
  return { ok: true };
}

export async function transferComandaAction(input: {
  comandaId: string;
  tableId: string;
}): Promise<SimpleResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para usar comandas." };
  }

  const parsed = transferComandaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const checked = await openComandaOrError(parsed.data.comandaId);
  if (checked.error) return { ok: false, error: checked.error };

  const [target, occupied] = await Promise.all([
    prisma.restaurantTable.findUnique({ where: { id: parsed.data.tableId } }),
    prisma.comanda.findFirst({
      where: {
        tableId: parsed.data.tableId,
        status: ComandaStatus.OPEN,
        id: { not: parsed.data.comandaId },
      },
      select: { number: true },
    }),
  ]);
  if (!target || !target.active) return { ok: false, error: "Mesa de destino indisponível." };
  if (occupied) {
    return { ok: false, error: `A ${target.label ?? `mesa ${target.number}`} já está ocupada.` };
  }

  await prisma.comanda.update({
    where: { id: parsed.data.comandaId },
    data: { tableId: target.id },
  });

  await audit({
    userId: user.id,
    action: "UPDATE",
    resource: "comanda",
    entityId: parsed.data.comandaId,
    details: `Comanda #${checked.comanda.number} transferida para ${target.label ?? `mesa ${target.number}`}`,
  });

  revalidatePath("/admin/comandas");
  revalidatePath("/admin/mesas");
  return { ok: true };
}

export async function cancelComandaAction(comandaId: string): Promise<SimpleResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para usar comandas." };
  }

  const checked = await openComandaOrError(comandaId);
  if (checked.error) return { ok: false, error: checked.error };

  await prisma.comanda.update({
    where: { id: comandaId },
    data: {
      status: ComandaStatus.CANCELLED,
      closedAt: new Date(),
      closedBy: user.id,
    },
  });

  await audit({
    userId: user.id,
    action: "DELETE",
    resource: "comanda",
    entityId: comandaId,
    details: `Comanda #${checked.comanda.number} cancelada`,
  });

  revalidatePath("/admin/comandas");
  revalidatePath("/admin/mesas");
  return { ok: true };
}

/**
 * Fecha a comanda: gera o pedido, registra pagamento e (quando pago agora)
 * lança a entrada no caixa. Nenhum preço é recalculado aqui: os itens já
 * foram precificados no servidor quando entraram na comanda.
 */
export async function closeComandaAction(input: {
  comandaId: string;
  paymentMethod: PaymentMethod;
  paidNow?: boolean;
}): Promise<CloseResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para fechar comandas." };
  }

  const parsed = closeComandaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { comanda } = await (async () => {
    const checked = await openComandaOrError(parsed.data.comandaId);
    if (checked.error) return { comanda: null, error: checked.error } as const;
    return { comanda: checked.comanda, error: null } as const;
  })();
  if (!comanda || comanda.items.length === 0) {
    return { ok: false, error: "A comanda está vazia. Adicione itens antes de fechar." };
  }

  const paidNow = parsed.data.paidNow ?? false;
  if (paidNow && !can(user, "payments.confirm")) {
    return {
      ok: false,
      error: "Você não tem permissão para receber pagamentos. Feche sem recebimento.",
    };
  }

  let registerId: string | null = null;
  if (paidNow) {
    const register = await prisma.cashRegister.findFirst({ where: { status: "OPEN" } });
    if (!register) {
      return { ok: false, error: "Não há caixa aberto. Abra o caixa para receber o pagamento." };
    }
    registerId = register.id;
  }

  const total = roundMoney(comanda.items.reduce((sum, item) => sum + item.subtotal, 0));
  const tableLabel = comanda.table.label ?? `Mesa ${comanda.table.number}`;
  const header = `Comanda #${comanda.number} · ${tableLabel}${
    comanda.customerName ? ` · Cliente: ${comanda.customerName}` : ""
  }`;
  const observation = [header, comanda.observation?.trim()].filter(Boolean).join(" — ").slice(0, 500);
  const initialStatus = paidNow ? OrderStatus.READY : OrderStatus.NEW;
  const initialPaymentStatus = paidNow ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING;
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const order = await prisma.$transaction(async (tx) => {
    const customer = comanda.customerId
      ? await tx.user.findFirst({
          where: { id: comanda.customerId, userType: UserType.CUSTOMER, active: true },
          select: { id: true, name: true, active: true },
        })
      : null;
    const resolvedCustomer = customer ?? (await findOrCreateWalkInCustomer());

    const created = await tx.order.create({
      data: {
        customerId: resolvedCustomer.id,
        subtotal: total,
        deliveryFee: 0,
        total,
        paymentMethod: parsed.data.paymentMethod,
        paymentStatus: initialPaymentStatus,
        observation,
        status: initialStatus,
        deliveryMode: DeliveryMode.PICKUP,
        recipientName: comanda.customerName?.trim() || resolvedCustomer.name,
        recipientPhone: comanda.customer?.phone ?? null,
        recipientAddress: `${tableLabel} (comanda #${comanda.number})`.slice(0, 300),
        items: {
          create: comanda.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.subtotal,
            options: {
              create: item.options.map((option) => ({
                groupId: option.groupId,
                optionId: option.optionId,
                groupName: option.groupName,
                optionName: option.optionName,
                quantity: option.quantity,
                unitPrice: option.unitPrice,
              })),
            },
          })),
        },
        history: { create: { toStatus: initialStatus, userId: user.id } },
        payment: {
          create: {
            method: parsed.data.paymentMethod,
            status: initialPaymentStatus,
            amount: total,
            ...(paidNow ? { confirmedAt: new Date(), confirmedBy: user.id } : {}),
          },
        },
      },
      include: { customer: true },
    });

    if (paidNow && registerId) {
      await tx.cashMovement.create({
        data: {
          cashRegisterId: registerId,
          type: CashMovementType.INCOME,
          amount: total,
          description: `${tableLabel} — comanda #${comanda.number} — pedido #${created.number}`,
          paymentMethod: parsed.data.paymentMethod,
          orderId: created.id,
          userId: user.id,
        },
      });
    }

    await tx.comanda.update({
      where: { id: comanda.id },
      data: {
        status: ComandaStatus.CLOSED,
        closedAt: new Date(),
        closedBy: user.id,
        paymentMethod: parsed.data.paymentMethod,
        paidNow,
        orderId: created.id,
      },
    });

    await tx.notification.create({
      data: {
        userId: null,
        type: "NEW_ORDER",
        title: `Comanda #${comanda.number} fechada — pedido #${created.number}`,
        body: `${tableLabel} — ${currency.format(total)}.`,
        link: "/admin/pedidos",
      },
    });
    if (comanda.customerId) {
      await tx.notification.create({
        data: {
          userId: comanda.customerId,
          type: "ORDER_STATUS",
          title: `Pedido #${created.number} recebido`,
          body: paidNow
            ? "Pagamento recebido no salão. Seu pedido foi registrado."
            : "Sua comanda foi fechada e o pedido registrado.",
          link: `/pedido/${created.id}`,
        },
      });
    }

    return created;
  });

  await audit({
    userId: user.id,
    action: "UPDATE",
    resource: "comanda",
    entityId: comanda.id,
    details: `Comanda #${comanda.number} fechada — pedido #${order.number} — ${currency.format(total)}${paidNow ? " (pago)" : " (a pagar)"}`,
  });

  await sendOrderReceivedWhatsApp({
    id: order.id,
    number: order.number,
    total: order.total,
    deliveryMode: order.deliveryMode,
    customer: order.customer,
    paymentMethod: order.paymentMethod,
  }).catch(() => undefined);

  revalidatePath("/admin/comandas");
  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/caixa");
  revalidatePath("/admin/mesas");
  return { ok: true, orderId: order.id, orderNumber: order.number, total };
}
