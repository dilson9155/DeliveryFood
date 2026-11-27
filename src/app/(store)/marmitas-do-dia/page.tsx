import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreContext } from "@/lib/store-status";
import { businessDate } from "@/lib/daily-menu";
import { MarmitasDoDia } from "@/components/store/marmitas-do-dia";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marmitas do dia" };

export default async function MarmitasDoDiaPage() {
  const [context, session] = await Promise.all([getStoreContext(), auth()]);

  if (!session?.user) {
    redirect("/login?callbackUrl=/marmitas-do-dia");
  }

  const [customer, savedAddresses, menu] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        phone: true,
        userType: true,
        defaultObservation: true,
      },
    }),
    prisma.address.findMany({
      where: { userId: session.user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    prisma.dailyMenu.findUnique({
      where: { date: businessDate() },
      include: {
        meals: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          include: { prices: true },
        },
        sizes: {
          where: { active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
        },
      },
    }),
  ]);

  if (!customer || customer.userType !== "CUSTOMER") {
    redirect("/");
  }

  const available = Boolean(menu?.active);

  return (
    <MarmitasDoDia
      date={businessDate()}
      menu={available ? JSON.parse(JSON.stringify(menu)) : null}
      customer={{
        name: customer.name,
        phone: customer.phone,
        defaultObservation: customer.defaultObservation,
      }}
      open={context.open}
      statusMessage={context.statusMessage}
      deliveryEnabled={context.settings.deliveryEnabled}
      deliveryFee={context.settings.deliveryFee}
      savedAddresses={JSON.parse(JSON.stringify(savedAddresses))}
    />
  );
}
