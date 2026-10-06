import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { ReceivablesManager } from "@/components/admin/finance/receivables-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contas a receber" };

export default async function ReceivablesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "finance.view"
  )) {
    redirect("/admin/dashboard");
  }

  const [receivables, customers] = await Promise.all([
    prisma.receivable.findMany({
      orderBy: { issueDate: "desc" },
      take: 200,
      include: {
        installments: { orderBy: { dueDate: "asc" } },
        customer: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { userType: "CUSTOMER", active: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
  ]);

  return (
    <ReceivablesManager
      receivables={JSON.parse(JSON.stringify(receivables))}
      customers={JSON.parse(JSON.stringify(customers))}
      canManage={can(
        { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
        "finance.manage"
      )}
    />
  );
}