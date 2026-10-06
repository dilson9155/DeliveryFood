import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { EmployeesPanel } from "@/components/admin/employees-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Colaboradores" };

export default async function EmployeesPage() {
  const session = await auth();
  const s = session as unknown as { user?: { id: string; role?: string | null } };
  const currentUser = s.user?.id;

  const employees = await prisma.user.findMany({
    where: { userType: UserType.EMPLOYEE },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      login: true,
      role: true,
      active: true,
      lastLogin: true,
      createdAt: true,
    },
  });

  return (
    <EmployeesPanel
      employees={JSON.parse(JSON.stringify(employees))}
      currentUserId={currentUser}
    />
  );
}