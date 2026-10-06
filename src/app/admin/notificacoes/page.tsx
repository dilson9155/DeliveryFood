import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { UserType } from "@prisma/client";
import { NotificationsView } from "@/components/admin/notifications-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notificações" };

const PAGE_SIZE = 30;

export default async function NotificationsPage() {
  const session = (await auth()) as { user?: { id: string; userType: UserType } } | null;
  if (session?.user?.userType !== UserType.EMPLOYEE) redirect("/login");

  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: null },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.notification.count({ where: { userId: null } }),
  ]);

  return (
    <NotificationsView
      items={JSON.parse(JSON.stringify(items))}
      total={total}
      hasMore={total > items.length}
    />
  );
}