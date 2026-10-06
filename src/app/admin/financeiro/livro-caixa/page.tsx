import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { CashBookView } from "@/components/admin/finance/cash-book-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Livro caixa" };

type SearchParams = { from?: string; to?: string };

function dayBounds(dateStr?: string): Date {
  if (dateStr) {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  return new Date();
}

export default async function CashBookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "finance.view"
  )) {
    redirect("/admin/dashboard");
  }

  const params = await searchParams;
  const fromDate = dayBounds(params.from);
  const toDate = dayBounds(params.to);
  // garantir to inclusivo
  toDate.setHours(23, 59, 59, 999);
  if (toDate < fromDate) toDate.setTime(fromDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const movements = await prisma.cashMovement.findMany({
    where: {
      createdAt: { gte: fromDate, lte: toDate },
    },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true } },
      order: { select: { number: true, customer: { select: { name: true } } } },
    },
  });

  return (
    <CashBookView
      movements={JSON.parse(JSON.stringify(movements))}
      fromDate={fromDate.toISOString().slice(0, 10)}
      toDate={toDate.toISOString().slice(0, 10)}
    />
  );
}