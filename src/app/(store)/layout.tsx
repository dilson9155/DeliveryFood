import { getStoreContext } from "@/lib/store-status";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StoreShell } from "@/components/store/store-shell";

export const dynamic = "force-dynamic";

export default async function StoreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [context, session] = await Promise.all([getStoreContext(), auth()]);

  const unreadNotifications = session?.user
    ? await prisma.notification.count({
        where: { userId: session.user.id, readAt: null },
      })
    : 0;

  return (
    <StoreShell
      settings={JSON.parse(JSON.stringify(context.settings))}
      hours={JSON.parse(JSON.stringify(context.hours))}
      open={context.open}
      statusMessage={context.statusMessage}
      unreadNotifications={unreadNotifications}
      user={
        session?.user
          ? {
              id: session.user.id,
              name: session.user.name ?? "",
              userType: session.user.userType,
              role: session.user.role,
            }
          : null
      }
    >
      {children}
    </StoreShell>
  );
}