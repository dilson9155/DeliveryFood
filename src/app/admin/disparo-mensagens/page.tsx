import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { UserType } from "@prisma/client";
import { can } from "@/lib/permissions";
import { MessagesPanel } from "@/components/admin/messages-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Disparo de Mensagens" };

export default async function MessagesPage() {
  const session = (await auth()) as { user?: { id: string; userType: UserType; role: unknown } } | null;
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE || !can(session.user as unknown as Parameters<typeof can>[0], "messages.manage")) {
    redirect("/login");
  }

  const [customers, campaigns] = await Promise.all([
    prisma.user.findMany({
      where: { userType: UserType.CUSTOMER, active: true, phone: { not: null } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
      },
      take: 800,
    }),
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        createdBy: { select: { name: true } },
        _count: { select: { recipients: true } },
      },
    }),
  ]);

  return <MessagesPanel customers={JSON.parse(JSON.stringify(customers))} campaigns={JSON.parse(JSON.stringify(campaigns))} />;
}
