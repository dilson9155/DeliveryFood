import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type SessionUser } from "@/lib/permissions";
import { OrderStatus, PaymentMethod, PaymentStatus, UserType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  const s = session as unknown as {
    user?: { id: string; userType: UserType; role?: string | null; name?: string | null; email?: string | null };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  const user = {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role as SessionUser["role"],
    name: s.user.name,
    email: s.user.email,
  } satisfies SessionUser;
  if (!can(user, "reports.view")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from") ?? "";
  const toParam = searchParams.get("to") ?? "";
  const status = searchParams.get("status") ?? "";
  const method = searchParams.get("method") ?? "";

  const to = toParam ? new Date(toParam + "T23:59:59") : new Date();
  const from = fromParam ? new Date(fromParam + "T00:00:00") : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  const where: Record<string, unknown> = {
    createdAt: { gte: from, lte: to },
  };
  if (status && (Object.values(OrderStatus) as string[]).includes(status)) {
    where.status = status;
  }
  if (method && (Object.values(PaymentMethod) as string[]).includes(method)) {
    where.paymentMethod = method;
  }

  const [orders, confirmedAgg, cancelledCount] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        items: true,
        payment: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.aggregate({
      where: { ...where, paymentStatus: PaymentStatus.CONFIRMED },
      _sum: { total: true },
      _count: true,
    }),
    prisma.order.count({ where: { ...where, status: OrderStatus.CANCELLED } }),
  ]);

  const itemAgg = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const cur = itemAgg.get(it.productName) ?? { name: it.productName, qty: 0, revenue: 0 };
      cur.qty += it.quantity;
      cur.revenue += it.subtotal * (o.paymentStatus === PaymentStatus.CONFIRMED ? 1 : 0);
      itemAgg.set(it.productName, cur);
    }
  }
  const topProducts = [...itemAgg.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

  const byMethod: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byDay = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    byMethod[o.paymentMethod] = (byMethod[o.paymentMethod] ?? 0) + (o.paymentStatus === PaymentStatus.CONFIRMED ? o.total : 0);
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    const day = o.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { count: 0, revenue: 0 };
    cur.count++;
    if (o.paymentStatus === PaymentStatus.CONFIRMED) cur.revenue += o.total;
    byDay.set(day, cur);
  }

  const avgTicket = (confirmedAgg._count ?? 0) > 0
    ? (confirmedAgg._sum.total ?? 0) / confirmedAgg._count
    : 0;

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      createdAt: o.createdAt,
      status: o.status,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      total: o.total,
      customerName: o.customer.name,
      itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    })),
    totals: {
      count: orders.length,
      confirmedCount: confirmedAgg._count,
      confirmedRevenue: confirmedAgg._sum.total ?? 0,
      cancelledCount,
      avgTicket,
    },
    topProducts,
    byMethod,
    byStatus,
    byDay: Array.from(byDay.entries())
      .map(([day, v]) => ({ day, count: v.count, revenue: v.revenue }))
      .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
  });
}