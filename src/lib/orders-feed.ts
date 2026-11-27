import { prisma } from "@/lib/prisma";
import { OrderStatus, Prisma } from "@prisma/client";

/**
 * Pedidos do dia para a fila operacional.
 * Exclui self-service (que já tem painel próprio) e cancelados.
 */
export async function getOperationsOrders() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return prisma.order.findMany({
    where: {
      createdAt: { gte: startOfToday },
      status: { not: OrderStatus.CANCELLED },
      selfServiceSale: null,
    },
    orderBy: { createdAt: Prisma.SortOrder.asc },
    include: {
      customer: { select: { name: true, phone: true } },
      items: {
        orderBy: { id: Prisma.SortOrder.asc },
        include: {
          options: {
            orderBy: { id: Prisma.SortOrder.asc },
            select: { groupName: true, optionName: true, quantity: true, unitPrice: true },
          },
        },
      },
      payment: true,
      history: {
        where: { toStatus: OrderStatus.READY },
        orderBy: { createdAt: Prisma.SortOrder.desc },
        take: 1,
        select: { createdAt: true, toStatus: true },
      },
      delivery: {
        select: {
          id: true,
          status: true,
          motoboy: { select: { name: true, phone: true } },
        },
      },
    },
    take: 300,
  });
}
