"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { cashMovementSchema } from "@/lib/validations";
import { roundMoney } from "@/lib/format";
import {
  CashMovementType,
  CashRegisterStatus,
  OrderStatus,
  PaymentStatus,
  UserType,
  type PaymentMethod,
} from "@prisma/client";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

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

export async function openCashRegisterAction(
  openingAmount: number,
  notes?: string
): Promise<ActionResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "cash.register")) {
    return { ok: false, error: "Você não tem permissão para abrir o caixa." };
  }

  const amount = roundMoney(openingAmount);
  if (amount < 0) {
    return { ok: false, error: "Valor de abertura inválido." };
  }

  const openRegister = await prisma.cashRegister.findFirst({
    where: { status: CashRegisterStatus.OPEN },
  });
  if (openRegister) {
    return { ok: false, error: "Já existe um caixa aberto." };
  }

  const register = await prisma.cashRegister.create({
    data: {
      openingAmount: amount,
      notes: notes?.trim() || null,
      openedBy: user.id,
      status: CashRegisterStatus.OPEN,
    },
  });

  await prisma.cashMovement.create({
    data: {
      cashRegisterId: register.id,
      type: CashMovementType.OPENING,
      amount,
      description: "Abertura de caixa",
      userId: user.id,
    },
  });

  await audit({
    userId: user.id,
    action: "CREATE",
    resource: "cashRegister",
    entityId: register.id,
    details: `Caixa aberto — abertura ${amount}`,
  });

  revalidatePath("/admin/caixa");
  return { ok: true, id: register.id };
}

type MovementInput = {
  type: "INCOME" | "EXPENSE" | "WITHDRAWAL" | "SUPPLY";
  amount: number;
  description?: string | null;
  paymentMethod?: PaymentMethod | null;
  cashRegisterId?: string;
};

export async function addCashMovementAction(input: MovementInput): Promise<ActionResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "cash.movements")) {
    return { ok: false, error: "Você não tem permissão para movimentar o caixa." };
  }

  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Dados da movimentação inválidos." };
  }

  const register = input.cashRegisterId
    ? await prisma.cashRegister.findUnique({ where: { id: input.cashRegisterId } })
    : await prisma.cashRegister.findFirst({ where: { status: CashRegisterStatus.OPEN } });

  if (!register || register.status !== CashRegisterStatus.OPEN) {
    return { ok: false, error: "Não há caixa aberto. Abra o caixa primeiro." };
  }

  const movement = await prisma.cashMovement.create({
    data: {
      cashRegisterId: register.id,
      type: parsed.data.type,
      amount: roundMoney(parsed.data.amount),
      description: parsed.data.description?.trim() || null,
      paymentMethod: parsed.data.paymentMethod ?? null,
      userId: user.id,
    },
  });

  await audit({
    userId: user.id,
    action: "CREATE",
    resource: "cashMovement",
    entityId: movement.id,
    details: `${parsed.data.type} ${parsed.data.amount}`,
  });

  revalidatePath("/admin/caixa");
  return { ok: true, id: movement.id };
}

export async function closeCashRegisterAction(
  cashRegisterId: string,
  closingCounted: number,
  notes?: string
): Promise<ActionResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "cash.register")) {
    return { ok: false, error: "Você não tem permissão para fechar o caixa." };
  }

  const register = await prisma.cashRegister.findFirst({
    where: { id: cashRegisterId, status: CashRegisterStatus.OPEN },
    include: { movements: true },
  });
  if (!register) {
    return { ok: false, error: "Caixa não encontrado ou já fechado." };
  }
  if (!Number.isFinite(closingCounted) || closingCounted < 0) {
    return { ok: false, error: "Valor contado inválido." };
  }

  const incomes = register.movements
    .filter((m) => m.type === CashMovementType.INCOME)
    .reduce((s, m) => s + m.amount, 0);
  const expenses = register.movements
    .filter((m) => m.type === CashMovementType.EXPENSE || m.type === CashMovementType.WITHDRAWAL)
    .reduce((s, m) => s + m.amount, 0);
  const supplies = register.movements
    .filter((m) => m.type === CashMovementType.SUPPLY)
    .reduce((s, m) => s + m.amount, 0);

  const expectedAmount = roundMoney(register.openingAmount + incomes + supplies - expenses);
  const closingAmount = roundMoney(closingCounted);
  const difference = roundMoney(closingAmount - expectedAmount);

  await prisma.cashMovement.create({
    data: {
      cashRegisterId: register.id,
      type: CashMovementType.CLOSING,
      amount: closingAmount,
      description: notes?.trim() || "Fechamento de caixa",
      userId: user.id,
    },
  });

  await prisma.cashRegister.update({
    where: { id: register.id },
    data: {
      status: CashRegisterStatus.CLOSED,
      closedAt: new Date(),
      closedBy: user.id,
      closingAmount,
      expectedAmount,
      difference,
      notes: notes?.trim() || register.notes,
    },
  });

  await audit({
    userId: user.id,
    action: "CASH_CLOSE",
    resource: "cashRegister",
    entityId: register.id,
    details: `Caixa fechado — total ${closingAmount}, diferença ${difference}`,
  });

  revalidatePath("/admin/caixa");
  return { ok: true, id: register.id };
}

export async function confirmPaymentAction(orderId: string): Promise<ActionResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "payments.confirm")) {
    return { ok: false, error: "Você não tem permissão para confirmar pagamentos." };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true },
  });
  if (!order || !order.payment) {
    return { ok: false, error: "Pedido não encontrado." };
  }

  if (order.payment.status === PaymentStatus.CONFIRMED) {
    return { ok: false, error: "Pagamento já confirmado." };
  }
  if (order.payment.status === PaymentStatus.CANCELLED) {
    return { ok: false, error: "Pagamento cancelado." };
  }
  if (
    order.status === OrderStatus.NEW ||
    order.status === OrderStatus.CONFIRMED ||
    order.status === OrderStatus.PREPARING
  ) {
    return {
      ok: false,
      error: "Pagamento pode ser confirmado somente após o pedido ficar pronto ou ser retirado.",
    };
  }

  const register = await prisma.cashRegister.findFirst({
    where: { status: CashRegisterStatus.OPEN },
  });
  if (!register) {
    return { ok: false, error: "Não há caixa aberto. Abra o caixa para registrar o pagamento." };
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: order.payment.id },
      data: {
        status: PaymentStatus.CONFIRMED,
        confirmedAt: new Date(),
        confirmedBy: user.id,
      },
    }),
    prisma.cashMovement.create({
      data: {
        cashRegisterId: register.id,
        type: CashMovementType.INCOME,
        amount: order.total,
        description: `Pagamento pedido #${order.number}`,
        paymentMethod: order.paymentMethod,
        orderId: order.id,
        userId: user.id,
      },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: PaymentStatus.CONFIRMED },
    }),
  ]);

  await prisma.notification.create({
    data: {
      userId: order.customerId,
      type: "PAYMENT",
      title: `Pedido #${order.number} pago`,
      body: "Pagamento confirmado no estabelecimento. Obrigado!",
      link: `/pedido/${order.id}`,
    },
  });

  await audit({
    userId: user.id,
    action: "PAYMENT",
    resource: "order",
    entityId: order.id,
    details: `Pagamento confirmado pedido #${order.number}`,
  });

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/caixa");
  revalidatePath(`/pedido/${order.id}`);
  return { ok: true, id: order.id };
}