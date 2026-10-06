import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";
import { getStoreOrigin } from "@/lib/delivery";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/orders/[id]/poll">
) {
  const { id } = await ctx.params;

  const session = await auth();
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      customerId: true,
      status: true,
      paymentStatus: true,
      deliveryMode: true,
      deliveryFee: true,
      discount: true,
      discountReason: true,
      delivery: {
        select: {
          id: true,
          status: true,
          addressSnapshot: true,
          motoboy: { select: { name: true, phone: true, vehiclePlate: true, vehicleModel: true } },
          locations: {
            orderBy: { recordedAt: "asc" },
            take: 100,
            select: { lat: true, lng: true, recordedAt: true },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  }

  const isOwner =
    session?.user?.id === order.customerId &&
    session.user.userType === UserType.CUSTOMER;
  const isEmployee = session?.user?.userType === UserType.EMPLOYEE;

  if (!isOwner && !isEmployee) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  let origin: { lat: number; lng: number } | null = null;
  if (order.delivery) {
    try {
      origin = await getStoreOrigin();
    } catch {
      origin = null;
    }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      paymentStatus: order.paymentStatus,
      deliveryMode: order.deliveryMode,
      deliveryFee: order.deliveryFee,
      discount: order.discount,
      discountReason: order.discountReason,
    },
    delivery: order.delivery,
    origin,
  });
}