"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { posOrderSchema, quickCustomerSchema } from "@/lib/validations";
import { priceItems } from "@/lib/order-pricing";
import { sendOrderReceivedWhatsApp } from "@/lib/notify";
import {
  CashMovementType,
  DeliveryMode,
  OrderStatus,
  PaymentStatus,
  UserType,
  Prisma,
  type PaymentMethod,
} from "@prisma/client";
import type { OptionSelection } from "@/lib/product-options";

export type PosCustomer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  ordersCount: number;
};

export type PosActionResult =
  | { ok: true; customer: PosCustomer }
  | { ok: false; error: string; existing?: PosCustomer };

export type PosOrderResult =
  | { ok: true; orderId: string; number: number; total: number }
  | { ok: false; error: string };

type PosInput = {
  items: { productId: string; quantity: number; options?: OptionSelection[] }[];
  paymentMethod: PaymentMethod;
  customerId: string;
  paidNow?: boolean;
  observation?: string | null;
};

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

async function findDuplicate(input: {
  phone: string;
  email: string | null;
  taxId: string | null;
}) {
  return prisma.user.findFirst({
    where: {
      OR: [
        { phone: input.phone },
        ...(input.email ? [{ email: input.email }] : []),
        ...(input.taxId ? [{ taxId: input.taxId }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      _count: { select: { orders: true } },
    },
  });
}

function toPosCustomer(customer: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  _count: { orders: number };
}): PosCustomer {
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    ordersCount: customer._count.orders,
  };
}

/** Cadastro em segundos dentro do PDV. Senha aleatória: o cliente redefine depois, se quiser. */
export async function quickCreateCustomerAction(input: {
  name: string;
  phone: string;
  email?: string | null;
  taxId?: string | null;
}): Promise<PosActionResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para cadastrar clientes no PDV." };
  }

  const parsed = quickCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const data = parsed.data;
  const duplicate = await findDuplicate(data);
  if (duplicate) {
    return {
      ok: false,
      error: "Já existe cliente com esse telefone. Selecione-o na busca.",
      existing: toPosCustomer(duplicate),
    };
  }

  const passwordHash = await bcrypt.hash(randomBytes(18).toString("hex"), 10);
  const customer = await prisma.user.create({
    data: {
      userType: UserType.CUSTOMER,
      name: data.name.trim(),
      phone: data.phone,
      email: data.email,
      taxId: data.taxId,
      password: passwordHash,
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      _count: { select: { orders: true } },
    },
  });

  await audit({
    userId: user.id,
    action: "CREATE",
    resource: "customer",
    entityId: customer.id,
    details: `Cliente cadastrado pelo PDV: ${customer.name}`,
  });

  revalidatePath("/admin/clientes");
  return { ok: true, customer: toPosCustomer(customer) };
}

/**
 * Fecha a venda do PDV. Cliente, preços e opções são validados no servidor;
 * nenhum dado de entrega é aceito (operação é sempre balcão/salão).
 */
export async function createPosOrderAction(input: PosInput): Promise<PosOrderResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para usar o PDV." };
  }

  const parsed = posOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados do pedido inválidos." };
  }
  const data = parsed.data;
  const paidNow = data.paidNow;

  if (paidNow && !can(user, "payments.confirm")) {
    return {
      ok: false,
      error: "Você não tem permissão para receber pagamentos. Finalize sem recebimento.",
    };
  }

  const customer = await prisma.user.findFirst({
    where: { id: data.customerId, userType: UserType.CUSTOMER, active: true },
    select: { id: true, name: true, active: true },
  });
  if (!customer) {
    return { ok: false, error: "Cliente não encontrado. Selecione ou cadastre um cliente." };
  }

  let registerId: string | null = null;
  if (paidNow) {
    const register = await prisma.cashRegister.findFirst({ where: { status: "OPEN" } });
    if (!register) {
      return { ok: false, error: "Não há caixa aberto. Abra o caixa para receber o pagamento." };
    }
    registerId = register.id;
  }

  const productIds = [...new Set(data.items.map((item) => item.productId))];
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

  // Nomes e preços das opções são sempre recalculados no servidor, nunca confiados no cliente.
  const priced = priceItems(data.items, products);
  if (!priced.ok) return { ok: false, error: priced.error };
  const orderItems = priced.items;
  const total = priced.total;

  const initialStatus = paidNow ? OrderStatus.READY : OrderStatus.NEW;
  const initialPaymentStatus = paidNow ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING;
  const observation = data.observation?.trim() || null;
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        customerId: customer.id,
        subtotal: total,
        deliveryFee: 0,
        total,
        paymentMethod: data.paymentMethod,
        paymentStatus: initialPaymentStatus,
        observation,
        status: initialStatus,
        deliveryMode: DeliveryMode.PICKUP,
        items: {
          create: orderItems.map(
            (item): Prisma.OrderItemUncheckedCreateWithoutOrderInput => ({
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
            })
          ),
        },
        history: {
          create: { toStatus: initialStatus, userId: user.id },
        },
        payment: {
          create: {
            method: data.paymentMethod,
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
          description: `PDV — pagamento pedido #${created.number}`,
          paymentMethod: data.paymentMethod,
          orderId: created.id,
          userId: user.id,
        },
      });
    }

    await tx.notification.create({
      data: {
        userId: null,
        type: "NEW_ORDER",
        title: `Pedido PDV #${created.number}`,
        body: `${created.customer.name} — ${currency.format(total)} (${orderItems.length} item(ns)).`,
        link: "/admin/pedidos",
      },
    });

    await tx.notification.create({
      data: {
        userId: customer.id,
        type: "ORDER_STATUS",
        title: `Pedido #${created.number} recebido`,
        body: paidNow
          ? "Pagamento recebido no balcão. Seu pedido está sendo preparado."
          : "Seu pedido foi registrado e aguarda confirmação.",
        link: `/pedido/${created.id}`,
      },
    });

    return created;
  });

  await audit({
    userId: user.id,
    action: "CREATE",
    resource: "order",
    entityId: order.id,
    details: `PDV — pedido #${order.number} — ${currency.format(order.total)}${paidNow ? " (pago)" : " (a pagar)"}`,
  });

  await sendOrderReceivedWhatsApp({
    id: order.id,
    number: order.number,
    total: order.total,
    deliveryMode: order.deliveryMode,
    customer: order.customer,
    paymentMethod: order.paymentMethod,
  }).catch(() => undefined);

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/caixa");
  revalidatePath("/admin/clientes");

  return { ok: true, orderId: order.id, number: order.number, total: order.total };
}
