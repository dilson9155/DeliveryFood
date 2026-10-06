import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStoreContext } from "@/lib/store-status";
import { UserType } from "@prisma/client";
import { OrderTrack } from "@/components/store/order-track";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `Pedido ${id.slice(0, 8)}` };
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const context = await getStoreContext();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      items: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
        },
      },
      history: { orderBy: { createdAt: "desc" } },
      payment: true,
      paymentIntent: true,
      delivery: {
        include: {
          motoboy: { select: { name: true, phone: true, vehiclePlate: true, vehicleModel: true } },
          locations: {
            orderBy: { recordedAt: "asc" },
            take: 100,
          },
        },
      },
    },
  });

  if (!order) notFound();

  const isOwner =
    session?.user?.id === order.customerId && session.user.userType === UserType.CUSTOMER;
  const isEmployee =
    session?.user?.userType === UserType.EMPLOYEE;

  if (!isOwner && !isEmployee) {
    redirect("/login?callbackUrl=" + encodeURIComponent(`/pedido/${id}`));
  }

  return (
    <OrderTrack
      order={JSON.parse(
        JSON.stringify({
          ...order,
          customerId: order.customerId,
          payment: order.payment,
        })
      )}
      paymentIntent={order.paymentIntent
        ? JSON.parse(JSON.stringify(order.paymentIntent))
        : null}
      delivery={order.delivery
        ? JSON.parse(JSON.stringify({
            ...order.delivery,
            addressSnapshot: order.delivery.addressSnapshot,
          }))
        : null}
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
      }}
      isCustomer={isOwner}
    />
  );
}