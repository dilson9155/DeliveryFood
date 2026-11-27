"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { formatCurrency, roundMoney } from "@/lib/format";
import { selfServiceSaleSchema, selfServiceSettingsSchema } from "@/lib/validations";
import {
  CashMovementType,
  DeliveryMode,
  OrderStatus,
  PaymentStatus,
  SelfServiceMode,
  UserType,
  type PaymentMethod,
} from "@prisma/client";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
type SaleResult =
  | {
      ok: true;
      saleId: string;
      orderId: string;
      orderNumber: number;
      total: number;
      change: number;
    }
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

export async function saveSelfServiceSettingsAction(input: {
  pricePerKg: number;
  fixedPrice: number;
}): Promise<Result> {
  const user = employeeOrError(await auth());
  if (!user || !can(user, "settings.manage")) {
    return { ok: false, error: "Você não tem permissão para configurar preços." };
  }

  const parsed = selfServiceSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Preços inválidos." };
  }

  await prisma.settings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      selfServicePricePerKg: roundMoney(parsed.data.pricePerKg),
      selfServiceFixedPrice: roundMoney(parsed.data.fixedPrice),
    },
    update: {
      selfServicePricePerKg: roundMoney(parsed.data.pricePerKg),
      selfServiceFixedPrice: roundMoney(parsed.data.fixedPrice),
    },
  });
  await audit({
    userId: user.id,
    action: "SETTINGS_CHANGE",
    resource: "self-service-settings",
    details: `Quilo ${formatCurrency(parsed.data.pricePerKg)} · pessoa ${formatCurrency(parsed.data.fixedPrice)}.`,
  });
  revalidatePath("/admin/autoatendimento");
  return { ok: true };
}

/** Registra uma venda de self-service independente das vendas de marmitas. */
export async function createSelfServiceSaleAction(input: {
  mode: "BY_WEIGHT" | "FIXED";
  weightGrams?: number;
  people?: number;
  customerId?: string | null;
  paymentMethod: PaymentMethod;
  paidNow?: boolean;
  amountReceived?: number;
  observation?: string | null;
}): Promise<SaleResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para registrar vendas." };
  }

  const parsed = selfServiceSaleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados da venda inválidos." };
  }
  const data = parsed.data;
  const paidNow = data.paidNow ?? true;
  if (paidNow && !can(user, "payments.confirm")) {
    return { ok: false, error: "Você não tem permissão para receber pagamentos." };
  }

  if (data.mode === SelfServiceMode.BY_WEIGHT && !data.weightGrams) {
    return { ok: false, error: "Informe o peso da refeição." };
  }
  if (data.mode === SelfServiceMode.FIXED && !data.people) {
    return { ok: false, error: "Informe a quantidade de refeições." };
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { selfServicePricePerKg: true, selfServiceFixedPrice: true },
  });
  const pricePerKg = roundMoney(settings?.selfServicePricePerKg ?? 0);
  const fixedPrice = roundMoney(settings?.selfServiceFixedPrice ?? 0);

  let total: number;
  let productName: string;
  let weightGrams: number | null = null;
  let people: number | null = null;
  let unitPrice: number;
  let quantity: number;

  if (data.mode === SelfServiceMode.BY_WEIGHT) {
    if (pricePerKg <= 0) {
      return { ok: false, error: "Configure o preço por quilo antes de vender." };
    }
    weightGrams = Number(data.weightGrams);
    total = roundMoney((weightGrams / 1000) * pricePerKg);
    unitPrice = total;
    quantity = 1;
    productName = `Self-service por quilo — ${weightGrams} g`;
  } else {
    if (fixedPrice <= 0) {
      return { ok: false, error: "Configure o preço por pessoa antes de vender." };
    }
    people = data.people!;
    total = roundMoney(fixedPrice * people);
    unitPrice = fixedPrice;
    quantity = people;
    productName = `Self-service — ${people} pessoa(s)`;
  }
  if (total <= 0) return { ok: false, error: "Valor inválido para a venda." };

  let registerId: string | null = null;
  if (paidNow) {
    const register = await prisma.cashRegister.findFirst({ where: { status: "OPEN" } });
    if (!register) {
      return { ok: false, error: "Não há caixa aberto. Abra o caixa para receber." };
    }
    registerId = register.id;
  }

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

  const customer = data.customerId
    ? await prisma.user.findFirst({
        where: { id: data.customerId, userType: UserType.CUSTOMER, active: true },
        select: { id: true, name: true },
      })
    : await findOrCreateWalkInCustomer();
  if (!customer) return { ok: false, error: "Cliente não encontrado." };

  const paymentNote =
    paidNow && data.paymentMethod === "CASH"
      ? `Valor recebido: ${formatCurrency(total + cashChange)}. Troco: ${formatCurrency(cashChange)}.`
      : null;
  const observation =
    [data.observation?.trim(), paymentNote].filter(Boolean).join(" — ").slice(0, 500) || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: customer.id,
          status: OrderStatus.FINISHED,
          paymentMethod: data.paymentMethod,
          paymentStatus: paidNow ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING,
          subtotal: total,
          total,
          deliveryMode: DeliveryMode.PICKUP,
          deliveryFee: 0,
          observation,
          recipientName: customer.name,
          items: {
            create: {
              productName,
              unitPrice,
              quantity,
              subtotal: total,
            },
          },
          history: {
            create: { toStatus: OrderStatus.FINISHED, userId: user.id },
          },
          payment: {
            create: {
              method: data.paymentMethod,
              status: paidNow ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING,
              amount: total,
              ...(paidNow ? { confirmedAt: new Date(), confirmedBy: user.id } : {}),
            },
          },
        },
      });

      const sale = await tx.selfServiceSale.create({
        data: {
          mode: data.mode,
          weightGrams,
          pricePerKg: data.mode === SelfServiceMode.BY_WEIGHT ? pricePerKg : null,
          people,
          pricePerPerson: data.mode === SelfServiceMode.FIXED ? fixedPrice : null,
          total,
          paymentMethod: data.paymentMethod,
          paidNow,
          customerId: customer.id,
          operatorId: user.id,
          orderId: order.id,
        },
      });

      if (paidNow && registerId) {
        await tx.cashMovement.create({
          data: {
            cashRegisterId: registerId,
            type: CashMovementType.INCOME,
            amount: total,
            description: `Self-service ${data.mode === SelfServiceMode.BY_WEIGHT ? `${weightGrams} g` : `${people} pessoa(s)`} — pedido #${order.number}${cashChange > 0 ? ` — troco ${formatCurrency(cashChange)}` : ""}`,
            paymentMethod: data.paymentMethod,
            orderId: order.id,
            userId: user.id,
          },
        });
      }

      await tx.notification.create({
        data: {
          userId: null,
          type: "NEW_ORDER",
          title: `Venda self-service #${order.number}`,
          body: `${productName} — ${formatCurrency(total)}.`,
          link: "/admin/autoatendimento",
        },
      });

      return { order, sale };
    });

    await audit({
      userId: user.id,
      action: "CREATE",
      resource: "self-service-sale",
      entityId: result.sale.id,
      details: `${productName} — ${formatCurrency(total)} — ${data.paymentMethod}.`,
    });
    revalidatePath("/admin/autoatendimento");
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/caixa");
    return {
      ok: true,
      saleId: result.sale.id,
      orderId: result.order.id,
      orderNumber: result.order.number,
      total,
      change: cashChange,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível registrar a venda.",
    };
  }
}
