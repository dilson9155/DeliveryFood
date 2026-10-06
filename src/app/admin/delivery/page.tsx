import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { DeliveryBoard } from "@/components/admin/delivery-board";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entregas" };

export default async function DeliveryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "delivery.view"
  )) {
    redirect("/admin/dashboard");
  }

  const [deliveries, motoboys] = await Promise.all([
    prisma.delivery.findMany({
      where: {
        status: { in: ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY", "ARRIVED"] },
      },
      orderBy: { createdAt: "asc" },
      include: {
        order: {
          select: {
            id: true,
            number: true,
            total: true,
            deliveryFee: true,
            customer: { select: { name: true, phone: true } },
          },
        },
        motoboy: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "MOTOBOY", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <DeliveryBoard
      deliveries={JSON.parse(JSON.stringify(deliveries))}
      motoboys={JSON.parse(JSON.stringify(motoboys))}
    />
  );
}