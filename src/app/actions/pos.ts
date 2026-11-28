"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { posOrderSchema, quickCustomerSchema } from "@/lib/validations";
import { priceItems, type PricedItem } from "@/lib/order-pricing";
import { priceDailyItems, reserveDailyStock } from "@/lib/daily-menu-pricing";
import { formatCurrency, roundMoney } from "@/lib/format";
import { sendOrderReceivedWhatsApp } from "@/lib/notify";
import {
  CashMovementType,
  DeliveryMode,
  OrderStatus,
  PaymentStatus,
  UserType,
  Prisma,
  SelfServiceMode,
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
  | { ok: true; orderId: string; number: number; total: number; change: number }
  | { ok: false; error: string };

type PosSpecialInput =
  | { kind: "DAILY"; mealId: string; sizeId: string; quantity: number }
  | {
      kind: "SELF_SERVICE";
      mode: "BY_WEIGHT" | "FIXED";
      weightGrams?: number;
      people?: number;
    };

type PosInput = {
  items: { productId: string; quantity: number; options?: OptionSelection[] }[];
  specialItems?: PosSpecialInput[];
  paymentMethod: PaymentMethod;
  customerId: string;
  paidNow?: boolean;
  amountReceived?: number;
  observation?: string | null;
};

type PricedSpecialItem = {
  productId: string | null;
  productName: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  options: PricedItem["options"];
  dailyMenuMealId?: string | null;
  dailyMenuSizeId?: string | null;
};

type PricedSelfServiceItem = PricedSpecialItem & {
  selfData: {
    mode: SelfServiceMode;
    weightGrams: number | null;
    pricePerKg: number | null;
    people: number | null;
    pricePerPerson: number | null;
  };
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
  const productItems: PricedSpecialItem[] = [];
  let productsTotal = 0;
  if (data.items.length > 0) {
    const priced = priceItems(data.items, products);
    if (!priced.ok) return { ok: false, error: priced.error };
    productItems.push(...priced.items);
    productsTotal = priced.total;
  }

  const dailyInputs = data.specialItems.filter((item) => item.kind === "DAILY");
  const selfInputs = data.specialItems.filter((item) => item.kind === "SELF_SERVICE");

  // Marmitas do dia: preço e estoque são revalidados com as mesmas regras da loja.
  const dailyPricing = await priceDailyItems(
    dailyInputs.map((item) => ({
      mealId: item.mealId,
      sizeId: item.sizeId,
      quantity: item.quantity,
    }))
  );
  if (!dailyPricing.ok) return { ok: false, error: dailyPricing.error };
  const dailyItems: PricedSpecialItem[] = dailyPricing.items;
  const stockByMeal = dailyPricing.stock;

  // Self-service: preços vêm de Settings, nunca do navegador.
  const selfItems: PricedSelfServiceItem[] = [];
  if (selfInputs.length > 0) {
    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
      select: { selfServicePricePerKg: true, selfServiceFixedPrice: true },
    });
    const pricePerKg = roundMoney(settings?.selfServicePricePerKg ?? 0);
    const fixedPrice = roundMoney(settings?.selfServiceFixedPrice ?? 0);

    for (const item of selfInputs) {
      if (item.mode === "BY_WEIGHT") {
        const grams = Number(item.weightGrams ?? 0);
        if (!Number.isFinite(grams) || grams <= 0) {
          return { ok: false, error: "Informe o peso do self-service." };
        }
        if (pricePerKg <= 0) {
          return { ok: false, error: "Preço por quilo do self-service não está configurado." };
        }
        const subtotal = roundMoney((grams / 1000) * pricePerKg);
        if (subtotal <= 0) return { ok: false, error: "Valor inválido para o self-service." };
        selfItems.push({
          productId: null,
          productName: `Self-service por quilo — ${grams} g`,
          unitPrice: subtotal,
          quantity: 1,
          subtotal,
          options: [],
          selfData: {
            mode: SelfServiceMode.BY_WEIGHT,
            weightGrams: grams,
            pricePerKg,
            people: null,
            pricePerPerson: null,
          },
        });
      } else {
        const people = Number(item.people ?? 0);
        if (!Number.isInteger(people) || people < 1) {
          return { ok: false, error: "Informe a quantidade de pessoas do self-service." };
        }
        if (fixedPrice <= 0) {
          return { ok: false, error: "Preço fixo do self-service não está configurado." };
        }
        const subtotal = roundMoney(fixedPrice * people);
        if (subtotal <= 0) return { ok: false, error: "Valor inválido para o self-service." };
        selfItems.push({
          productId: null,
          productName: `Self-service — ${people} pessoa(s)`,
          unitPrice: fixedPrice,
          quantity: people,
          subtotal,
          options: [],
          selfData: {
            mode: SelfServiceMode.FIXED,
            weightGrams: null,
            pricePerKg: null,
            people,
            pricePerPerson: fixedPrice,
          },
        });
      }
    }
  }

  const allItems: PricedSpecialItem[] = [...productItems, ...dailyItems, ...selfItems];
  const total = roundMoney(
    productsTotal + dailyItems.reduce((sum, item) => sum + item.subtotal, 0) +
      selfItems.reduce((sum, item) => sum + item.subtotal, 0)
  );
  const itemData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = allItems.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    subtotal: item.subtotal,
    ...(item.dailyMenuMealId
      ? { dailyMenuMealId: item.dailyMenuMealId, dailyMenuSizeId: item.dailyMenuSizeId }
      : {}),
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
  }));

  let cashChange = 0;
  if (paidNow && data.paymentMethod === "CASH") {
    const received = roundMoney(data.amountReceived ?? 0);
    if (data.amountReceived === undefined || received < total) {
      return {
        ok: false,
        error: `Valor recebido insuficiente. O total é ${formatCurrency(total)}.`,
      };
    }
    cashChange = roundMoney(received - total);
  }

  const initialStatus = paidNow ? OrderStatus.READY : OrderStatus.NEW;
  const initialPaymentStatus = paidNow ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING;
  const paymentNote =
    paidNow && data.paymentMethod === "CASH"
      ? `Valor recebido: ${formatCurrency(total + cashChange)}. Troco: ${formatCurrency(cashChange)}.`
      : null;
  const observation = [data.observation?.trim(), paymentNote].filter(Boolean).join(" — ").slice(0, 500) || null;
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      // Baixa atômica do estoque das marmitas: se outra venda esgotou o item,
      // toda a transação é abortada e nenhum pedido/pagamento é gravado.
      await reserveDailyStock(tx, stockByMeal);

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
          items: { create: itemData },
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

      // Mantém o histórico do self-service unificado com o restante do sistema.
      for (const item of selfItems) {
        await tx.selfServiceSale.create({
          data: {
            ...item.selfData,
            total: item.subtotal,
            paymentMethod: data.paymentMethod,
            paidNow,
            customerId: customer.id,
            operatorId: user.id,
            orderId: created.id,
          },
        });
      }

      if (paidNow && registerId) {
        await tx.cashMovement.create({
          data: {
            cashRegisterId: registerId,
            type: CashMovementType.INCOME,
            amount: total,
            description: `PDV — pagamento pedido #${created.number}${
              selfItems.length > 0 ? " (inclui self-service)" : ""
            }${cashChange > 0 ? ` — troco ${formatCurrency(cashChange)}` : ""}`,
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
          body: `${created.customer.name} — ${currency.format(total)} (${allItems.length} item(ns)).`,
          link: "/admin/fila-pedidos",
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
  } catch (error) {
    if (error instanceof Error && error.message.includes("acabou de esgotar")) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  await audit({
    userId: user.id,
    action: "CREATE",
    resource: "order",
    entityId: order.id,
    details: `PDV — pedido #${order.number} — ${currency.format(order.total)}${paidNow ? " (pago)" : " (a pagar)"}${
      cashChange > 0 ? ` — troco ${formatCurrency(cashChange)}` : ""
    }`,
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
  revalidatePath("/admin/fila-pedidos");
  revalidatePath("/admin/caixa");
  revalidatePath("/admin/clientes");
  revalidatePath("/admin/cardapio-do-dia");
  revalidatePath("/admin/autoatendimento");
  revalidatePath("/marmitas-do-dia");

  return { ok: true, orderId: order.id, number: order.number, total: order.total, change: cashChange };
}
