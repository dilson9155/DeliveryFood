import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const s = session as unknown as {
    user?: { id: string; userType: UserType; name?: string | null };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: s.user.id },
    select: { name: true, role: true, active: true },
  });
  if (!user || !user.active) {
    redirect("/login");
  }

  const settings = await prisma.settings.findUnique({
    where: { id: "default" },
    select: { storeName: true, logoUrl: true },
  });

  return (
    <AdminShell
      user={{
        id: s.user.id,
        name: user.name,
        role: user.role,
      }}
      settings={settings ? { storeName: settings.storeName, logoUrl: settings.logoUrl } : undefined}
    >
      {children}
    </AdminShell>
  );
}