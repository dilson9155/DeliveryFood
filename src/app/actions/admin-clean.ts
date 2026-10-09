"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType } from "@prisma/client";

type AuthFailure = { ok: false; error: string };

async function requireAdmin(): Promise<SessionUser | AuthFailure> {
  const session = (await auth()) as { user?: { id: string; userType: UserType; role: SessionUser["role"]; name?: string | null; email?: string | null } } | null;
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE || !session.user.role) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const user: SessionUser = {
    id: session.user.id,
    userType: UserType.EMPLOYEE,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };
  if (!can(user, "settings.manage")) {
    return { ok: false, error: "Você não tem permissão para realizar essa ação." };
  }
  return user;
}

function isUser(v: SessionUser | AuthFailure): v is SessionUser {
  return !("ok" in v);
}

type CleanSummary = {
  forceAll: boolean;
  keepLast: number;
  ordersDeleted: number;
  deliveryLocations: number;
  deliveries: number;
  paymentIntents: number;
  paymentEvents: number;
  payments: number;
  cashMovements: number;
  orderHistory: number;
  orderItems: number;
  receivables: number;
  campaigns: number;
  campaignRecipients: number;
  notifications: number;
};

export async function cleanTestDataAction(input: {
  forceAll?: boolean;
  keepLastOrders?: number;
  confirm: string;
}): Promise<{ ok: true; summary: CleanSummary } | { ok: false; error: string }> {
  const user = await requireAdmin();
  if (!isUser(user)) return user;

  if (input.confirm !== "LIMPAR") {
    return { ok: false, error: "Confirmação inválida. Digite LIMPAR." };
  }

  const keepLast = Math.max(1, Math.min(200, input.keepLastOrders ?? 20));
  const forceAll = input.forceAll === true;

  let ordersToDelete: Array<{ id: string }> = [];
  if (forceAll) {
    ordersToDelete = await prisma.order.findMany({ select: { id: true } });
  } else {
    const keep = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: keepLast,
      select: { id: true },
    });
    const keepIds = keep.map((k) => k.id);
    ordersToDelete = await prisma.order.findMany({
      where: { id: { notIn: keepIds } },
      select: { id: true },
    });
  }

  const ids = ordersToDelete.map((o) => o.id);

  const whereOrders = ids.length > 0 ? { id: { in: ids } } : { id: { in: [] } };
  const whereOrderId = ids.length > 0 ? { orderId: { in: ids } } : { orderId: { in: [] } };
  const whereIntentOrder = ids.length > 0 ? { intent: { orderId: { in: ids } } } : { intent: { orderId: { in: [] } } };
  const whereDeliveryOrder = ids.length > 0 ? { delivery: { orderId: { in: ids } } } : { delivery: { orderId: { in: [] } } };

  const [delDeliveryLoc, delDelivery, delIntent, delEvents, delPayment, delCash, delHist, delItems, delReceiv, delOrders] = await prisma.$transaction([
    prisma.deliveryLocation.deleteMany({ where: whereDeliveryOrder }),
    prisma.delivery.deleteMany({ where: whereOrderId }),
    prisma.paymentIntent.deleteMany({ where: whereOrderId }),
    prisma.paymentEvent.deleteMany({ where: whereIntentOrder }),
    prisma.payment.deleteMany({ where: whereOrderId }),
    prisma.cashMovement.deleteMany({ where: whereOrderId }),
    prisma.orderHistory.deleteMany({ where: whereOrderId }),
    prisma.orderItem.deleteMany({ where: whereOrderId }),
    prisma.receivable.deleteMany({ where: whereOrderId }),
    prisma.order.deleteMany({ where: whereOrders }),
  ]);

  const [delRecs, delCamps] = await prisma.$transaction([
    prisma.campaignRecipient.deleteMany({}),
    prisma.campaign.deleteMany({}),
  ]);

  const delNot = await prisma.notification.deleteMany({});

  const summary: CleanSummary = {
    forceAll,
    keepLast,
    ordersDeleted: delOrders.count,
    deliveryLocations: delDeliveryLoc.count,
    deliveries: delDelivery.count,
    paymentIntents: delIntent.count,
    paymentEvents: delEvents.count,
    payments: delPayment.count,
    cashMovements: delCash.count,
    orderHistory: delHist.count,
    orderItems: delItems.count,
    receivables: delReceiv.count,
    campaigns: delCamps.count,
    campaignRecipients: delRecs.count,
    notifications: delNot.count,
  };

  revalidatePath("/admin/configuracoes");
  return { ok: true, summary };
}
