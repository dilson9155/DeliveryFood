import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";
import { CustomersPanel } from "@/components/admin/customers-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage() {
  const customers = await prisma.user.findMany({
    // Clientes excluídos são anonimizados com um login marker; não devem
    // aparecer na lista nem ser selecionados em PDV/PDV-like.
    where: { userType: UserType.CUSTOMER, login: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      active: true,
      createdAt: true,
      avatarUrl: true,
      _count: {
        select: {
          orders: true,
          addresses: true,
          receivables: true,
        },
      },
    },
    take: 500,
  });

  return <CustomersPanel customers={JSON.parse(JSON.stringify(customers))} />;
}