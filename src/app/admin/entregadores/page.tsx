import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { MotoboysManager } from "@/components/admin/motoboys-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entregadores" };

export default async function MotoboysPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "employees.manage"
  )) {
    redirect("/admin/dashboard");
  }

  const motoboys = await prisma.user.findMany({
    where: { role: "MOTOBOY" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      login: true,
      active: true,
      vehiclePlate: true,
      vehicleModel: true,
      createdAt: true,
      _count: { select: { deliveries: true } },
    },
  });

  return (
    <MotoboysManager motoboys={JSON.parse(JSON.stringify(motoboys))} />
  );
}