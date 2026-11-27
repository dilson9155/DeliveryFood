import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType } from "@prisma/client";
import { SelfServicePanel } from "@/components/admin/self-service-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Self-service" };

export default async function SelfServicePage() {
  const [session, settings, customers, sales, openRegister] = await Promise.all([
    auth(),
    prisma.settings.findUnique({
      where: { id: "default" },
      select: { selfServicePricePerKg: true, selfServiceFixedPrice: true },
    }),
    prisma.user.findMany({
      where: { userType: UserType.CUSTOMER, active: true },
      orderBy: { name: "asc" },
      take: 1000,
      select: { id: true, name: true, phone: true },
    }),
    prisma.selfServiceSale.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        customer: { select: { name: true } },
        operator: { select: { name: true } },
        order: { select: { id: true, number: true, paymentStatus: true } },
      },
    }),
    prisma.cashRegister.findFirst({ where: { status: "OPEN" }, select: { id: true } }),
  ]);

  const s = session as unknown as {
    user?: { id: string; userType: UserType; role: SessionUser["role"] };
  };
  const employee: SessionUser | null = s?.user
    ? { id: s.user.id, userType: s.user.userType, role: s.user.role }
    : null;

  return (
    <SelfServicePanel
      prices={{
        pricePerKg: settings?.selfServicePricePerKg ?? 0,
        fixedPrice: settings?.selfServiceFixedPrice ?? 0,
      }}
      customers={JSON.parse(JSON.stringify(customers))}
      sales={JSON.parse(JSON.stringify(sales))}
      canConfirmPayments={can(employee, "payments.confirm")}
      canManageSettings={can(employee, "settings.manage")}
      cashRegisterOpen={Boolean(openRegister)}
    />
  );
}
