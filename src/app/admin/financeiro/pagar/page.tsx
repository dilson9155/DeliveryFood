import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { PayablesManager } from "@/components/admin/finance/payables-manager";
import type {
  BillCategory,
  InstallmentFrequency,
  InstallmentStatus,
  PayableMethod,
} from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contas a pagar" };

export default async function PayablesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "finance.view"
  )) {
    redirect("/admin/dashboard");
  }

  const payables = await prisma.payable.findMany({
    orderBy: { issueDate: "desc" },
    take: 200,
    include: {
      installments: {
        orderBy: { dueDate: "asc" },
      },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <PayablesManager
      payables={JSON.parse(JSON.stringify(payables))}
      canManage={can(
        { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
        "finance.manage"
      )}
    />
  );
}