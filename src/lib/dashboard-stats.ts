import { prisma } from "@/lib/prisma";
import { OrderStatus, PaymentStatus, UserType } from "@prisma/client";

export async function getDashboardStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setHours(23, 59, 59, 999);

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const [ordersTodayCount, salesToday, pendingCount, preparingCount, readyCount, customers, recentOrders, topProducts] =
    await Promise.all([
      prisma.order.count({
        where: {
          createdAt: { gte: startOfToday, lte: endOfToday },
          status: { not: OrderStatus.CANCELLED },
        },
      }),
      prisma.order.aggregate({
        where: {
          createdAt: { gte: startOfToday, lte: endOfToday },
          paymentStatus: PaymentStatus.CONFIRMED,
        },
        _sum: { total: true },
      }),
      prisma.order.count({ where: { status: OrderStatus.NEW } }),
      prisma.order.count({ where: { status: OrderStatus.PREPARING } }),
      prisma.order.count({ where: { status: OrderStatus.READY } }),
      prisma.user.count({ where: { userType: UserType.CUSTOMER, active: true } }),
      prisma.order.findMany({
        where: { status: { not: OrderStatus.CANCELLED } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: {
          customer: { select: { name: true } },
        },
      }),
      prisma.orderItem.groupBy({
        by: ["productId", "productName"],
        where: { order: { createdAt: { gte: startOfWeek } } },
        _sum: { quantity: true },
        _count: true,
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
    ]);

  return {
    ordersToday: ordersTodayCount,
    salesToday: salesToday._sum.total ?? 0,
    pending: pendingCount,
    preparing: preparingCount,
    ready: readyCount,
    customers,
    recentOrders: JSON.parse(
      JSON.stringify(
        recentOrders.map((o) => ({
          id: o.id,
          number: o.number,
          status: o.status,
          total: o.total,
          paymentMethod: o.paymentMethod,
          createdAt: o.createdAt,
          customerName: o.customer.name,
        }))
      )
    ),
    topProducts: topProducts.map((p) => ({
      name: p.productName,
      quantity: p._sum.quantity ?? 0,
    })),
  };
}

export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;