import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";
import { CustomersPanel } from "@/components/admin/customers-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage() {
  const customers = await prisma.user.findMany({
    where: { userType: UserType.CUSTOMER },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      active: true,
      createdAt: true,
      _count: { select: { orders: true } },
    },
    take: 500,
  });

  return <CustomersPanel customers={JSON.parse(JSON.stringify(customers))} />;
}