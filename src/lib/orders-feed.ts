import { prisma } from "@/lib/prisma";
import { DeliveryMode, OrderStatus, Prisma } from "@prisma/client";

/**
 * Fila simplificada de entregas: apenas pedidos com entrega feitos hoje.
 * Retirada, self-service e cancelados ficam de fora.
 */
export async function getOperationsOrders() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return prisma.order.findMany({
    where: {
      createdAt: { gte: startOfToday },
      deliveryMode: DeliveryMode.DELIVERY,
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
        orderBy: { createdAt: Prisma.SortOrder.desc },
        take: 8,
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
