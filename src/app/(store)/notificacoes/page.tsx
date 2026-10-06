import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationsView } from "@/components/store/notifications-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notificações" };

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const items = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <NotificationsView items={JSON.parse(JSON.stringify(items))} />;
}