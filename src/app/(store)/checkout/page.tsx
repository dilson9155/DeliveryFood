import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreContext } from "@/lib/store-status";
import { CheckoutForm } from "@/components/store/checkout-form";
import { getDeliverySettings } from "@/lib/delivery";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Finalizar pedido" };

export default async function CheckoutPage() {
  const [context, session, deliverySettings] = await Promise.all([
    getStoreContext(),
    auth(),
    getDeliverySettings(),
  ]);

  if (!session?.user) {
    redirect("/login?callbackUrl=/checkout");
  }
  const user = session.user;

  const customer = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      phone: true,
      userType: true,
      defaultObservation: true,
    },
  });
  if (!customer || customer.userType !== "CUSTOMER") {
    redirect("/");
  }

  const savedAddresses = await prisma.address.findMany({
    where: { userId: user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return (
    <CheckoutForm
      customer={{
        name: customer.name,
        phone: customer.phone,
        defaultObservation: customer.defaultObservation,
      }}
      open={context.open}
      statusMessage={context.statusMessage}
      settings={{
        storeName: context.settings.storeName,
        address: context.settings.address,
        number: context.settings.number,
        complement: context.settings.complement,
        neighborhood: context.settings.neighborhood,
        city: context.settings.city,
        state: context.settings.state,
        phone: context.settings.phone,
        prepTimeMinutes: context.settings.prepTimeMinutes,
        deliveryEnabled: deliverySettings.deliveryEnabled,
        baseFee: deliverySettings.baseFee,
        feePerKm: deliverySettings.feePerKm,
        minFee: deliverySettings.minFee,
        maxFee: deliverySettings.maxFee,
        maxDistanceKm: deliverySettings.maxDistanceKm,
      }}
      hours={context.hours.map((h) => ({
        dayOfWeek: h.dayOfWeek,
        open: h.open,
        openTime: h.openTime,
        closeTime: h.closeTime,
      }))}
      savedAddresses={JSON.parse(JSON.stringify(savedAddresses))}
      deliveryEnabled={deliverySettings.deliveryEnabled}
    />
  );
}