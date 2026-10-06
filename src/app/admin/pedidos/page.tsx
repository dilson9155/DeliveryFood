import type { Metadata } from "next";
import { OrdersBoard } from "@/components/admin/orders-board";
import { prisma } from "@/lib/prisma";
import { OrderStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pedidos" };

export default async function OrdersPage() {
  const orders = await prisma.order.findMany({
    orderBy: [
      { status: Prisma.SortOrder.desc },
      { createdAt: Prisma.SortOrder.asc },
    ],
    include: {
      customer: { select: { name: true, phone: true } },
      items: { select: { id: true, productName: true, quantity: true, unitPrice: true, subtotal: true } },
      payment: true,
    },
    take: 300,
  });

  return (
    <OrdersBoard
      orders={JSON.parse(JSON.stringify(orders))}
      statuses={Object.values(OrderStatus)}
    />
  );
}