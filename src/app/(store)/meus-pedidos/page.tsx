import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MyOrders } from "@/components/store/my-orders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus pedidos" };

export default async function MyOrdersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const orders = await prisma.order.findMany({
    where: { customerId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      createdAt: true,
      total: true,
      status: true,
      paymentStatus: true,
      paymentMethod: true,
      items: {
        select: {
          quantity: true,
          productId: true,
          productName: true,
          unitPrice: true,
        },
      },
    },
    take: 100,
  });

  return <MyOrders orders={JSON.parse(JSON.stringify(orders))} />;
}