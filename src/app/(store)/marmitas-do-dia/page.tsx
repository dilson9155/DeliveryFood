import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";
import { getStoreContext } from "@/lib/store-status";
import { businessDate } from "@/lib/daily-menu";
import { MarmitasDoDia } from "@/components/store/marmitas-do-dia";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marmitas do dia" };

export default async function MarmitasDoDiaPage() {
  const [context, session, menu] = await Promise.all([
    getStoreContext(),
    auth(),
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

  // O cardápio é público. Login só é necessário para registrar o pedido.
  const userId = session?.user?.id;
  const isCustomer = Boolean(userId && session?.user?.userType === UserType.CUSTOMER);

  const [customer, savedAddresses] = isCustomer
    ? await Promise.all([
        prisma.user.findUnique({
          where: { id: userId! },
          select: {
            name: true,
            phone: true,
            userType: true,
            defaultObservation: true,
          },
        }),
        prisma.address.findMany({
          where: { userId: userId! },
          orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
        }),
      ])
    : [null, []];

  const canOrder = Boolean(customer && customer.userType === UserType.CUSTOMER);
  const available = Boolean(menu?.active);

  return (
    <MarmitasDoDia
      date={businessDate()}
      menu={available ? JSON.parse(JSON.stringify(menu)) : null}
      customer={
        canOrder
          ? {
              name: customer!.name,
              phone: customer!.phone,
              defaultObservation: customer!.defaultObservation,
            }
          : null
      }
      open={context.open}
      statusMessage={context.statusMessage}
      deliveryEnabled={context.settings.deliveryEnabled}
      deliveryFee={context.settings.deliveryFee}
      savedAddresses={JSON.parse(JSON.stringify(savedAddresses))}
    />
  );
}
