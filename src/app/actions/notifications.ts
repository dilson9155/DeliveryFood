"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";

type SessionLike = {
  user?: { id: string; userType: UserType };
};

export type NotificationResult = { ok: true } | { ok: false; error: string };

async function currentUser(): Promise<{ id: string; userType: UserType } | null> {
  const session = (await auth()) as SessionLike | null;
  if (!session?.user?.id) return null;
  return { id: session.user.id, userType: session.user.userType };
}

export async function markNotificationReadAction(
  id: string
): Promise<NotificationResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) return { ok: false, error: "Notificação não encontrada." };

  if (notification.userId !== null) {
    if (notification.userId !== user.id) {
      return { ok: false, error: "Acesso negado." };
    }
  } else if (user.userType !== UserType.EMPLOYEE) {
    return { ok: false, error: "Acesso negado." };
  }

  await prisma.notification.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
  });

  revalidatePath("/admin/notificacoes");
  revalidatePath("/notificacoes");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<NotificationResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Não autenticado." };

  const where =
    user.userType === UserType.EMPLOYEE ? { userId: null } : { userId: user.id };

  await prisma.notification.updateMany({
    where: { ...where, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/admin/notificacoes");
  revalidatePath("/notificacoes");
  return { ok: true };
}