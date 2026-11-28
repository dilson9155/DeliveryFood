import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { AdminMenuGrid } from "@/components/admin/admin-menu-grid";
import type { SessionUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu geral" };

export default async function MenuGeralPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user: SessionUser = {
    id: session.user.id,
    userType: UserType.EMPLOYEE,
    role: session.user.role ?? null,
    name: session.user.name,
    email: session.user.email,
  };

  return <AdminMenuGrid user={user} />;
}
