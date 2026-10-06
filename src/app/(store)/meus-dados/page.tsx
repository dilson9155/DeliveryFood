import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";
import { MyDataForm } from "@/components/store/my-data-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus dados" };

export default async function MyDataPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [user, addresses] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, phone: true, email: true, userType: true, defaultObservation: true, taxId: true },
    }),
    prisma.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  if (!user || user.userType !== UserType.CUSTOMER) redirect("/");

  return (
    <MyDataForm
      name={user.name}
      phone={user.phone ?? ""}
      email={user.email ?? ""}
      taxId={user.taxId ?? ""}
      defaultObservation={user.defaultObservation ?? ""}
      addresses={JSON.parse(JSON.stringify(addresses))}
    />
  );
}