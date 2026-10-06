import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { CashPanel } from "@/components/admin/cash-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Caixa" };

export default async function CashPage() {
  const [openRegister, closedRegisters] = await Promise.all([
    prisma.cashRegister.findFirst({
      where: { status: "OPEN" },
      include: {
        openedByUser: { select: { name: true } },
        movements: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { name: true } } },
        },
      },
    }),
    prisma.cashRegister.findMany({
      where: { status: "CLOSED" },
      orderBy: { openedAt: "desc" },
      take: 20,
      include: {
        openedByUser: { select: { name: true } },
        closedByUser: { select: { name: true } },
      },
    }),
  ]);

  return (
    <CashPanel
      openRegister={JSON.parse(JSON.stringify(openRegister))}
      closedRegisters={JSON.parse(JSON.stringify(closedRegisters))}
    />
  );
}