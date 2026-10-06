"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { geocodeAddress, type AddressInput } from "@/lib/geo";
import {
  DeliveryMode,
  DeliveryStatus,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  type Delivery,
} from "@prisma/client";
import { z } from "zod";

const addressSchema = z.object({
  label: z.string().max(40).optional().nullable(),
  recipientName: z.string().max(120).optional().nullable(),
  street: z.string().min(2, "Informe a rua").max(200),
  number: z.string().min(1, "Informe o número").max(20),
  complement: z.string().max(80).optional().nullable(),
  neighborhood: z.string().min(2, "Informe o bairro").max(80),
  city: z.string().min(2, "Informe a cidade").max(80),
  state: z.string().min(2, "Informe o estado (UF)").max(2),
  zipCode: z.string().min(8, "Informe o CEP").max(10),
});

export type AddressActionResult =
  | { ok: true; addressId: string }
  | { ok: false; error: string };

export async function saveAddressAction(
  data: z.infer<typeof addressSchema> & { makeDefault?: boolean }
): Promise<AddressActionResult> {
  const session = await auth();
  if (!session?.user || session.user.userType !== "CUSTOMER") {
    return { ok: false, error: "Acesso restrito a clientes." };
  }

  const parsed = addressSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  // Geocoding para lat/lng
  const geo = await geocodeAddress(parsed.data);
  if (!geo) {
    return {
      ok: false,
      error:
        "Não conseguimos localizar esse endereço. Confira os dados (CEP, rua, número, cidade).",
    };
  }

  const makeDefault = !!data.makeDefault;
  if (makeDefault) {
    await prisma.address.updateMany({
      where: { userId: session.user.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const created = await prisma.address.create({
    data: {
      userId: session.user.id,
      label: parsed.data.label?.trim() || null,
      recipientName: parsed.data.recipientName?.trim() || null,
      street: parsed.data.street.trim(),
      number: parsed.data.number.trim(),
      complement: parsed.data.complement?.trim() || null,
      neighborhood: parsed.data.neighborhood.trim(),
      city: parsed.data.city.trim(),
      state: parsed.data.state.trim().toUpperCase(),
      zipCode: parsed.data.zipCode.replace(/\D/g, ""),
      lat: geo.lat,
      lng: geo.lng,
      isDefault: makeDefault || (await prisma.address.count({ where: { userId: session.user.id } })) === 0,
    },
  });

  return { ok: true, addressId: created.id };
}

export async function deleteAddressAction(addressId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.userType !== "CUSTOMER") {
    return { ok: false, error: "Acesso restrito a clientes." };
  }
  const addr = await prisma.address.findFirst({
    where: { id: addressId, userId: session.user.id },
  });
  if (!addr) return { ok: false, error: "Endereço não encontrado." };
  await prisma.address.delete({ where: { id: addressId } });
  return { ok: true };
}

export async function setDefaultAddressAction(addressId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.userType !== "CUSTOMER") {
    return { ok: false, error: "Acesso restrito a clientes." };
  }
  const addr = await prisma.address.findFirst({
    where: { id: addressId, userId: session.user.id },
  });
  if (!addr) return { ok: false, error: "Endereço não encontrado." };
  await prisma.$transaction([
    prisma.address.updateMany({
      where: { userId: session.user.id, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    }),
  ]);
  return { ok: true };
}

// === Cotações ===
const quoteSchema = z.object({
  street: z.string().min(2),
  number: z.string().min(1),
  complement: z.string().optional().nullable(),
  neighborhood: z.string().min(2),
  city: z.string().min(2),
  state: z.string().min(2).max(2),
  zipCode: z.string().min(8).max(10),
});

export type QuoteResult =
  | {
      ok: true;
      distanceKm: number;
      fee: number;
      etaMinutes: number;
      lat: number;
      lng: number;
    }
  | { ok: false; error: string };

export async function quoteDeliveryAction(
  data: z.infer<typeof quoteSchema>
): Promise<QuoteResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Faça login para cotar a entrega." };
  }
  const parsed = quoteSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const { quoteDelivery } = await import("@/lib/delivery");
  const result = await quoteDelivery(parsed.data);
  if (!result.ok) return result;
  return {
    ok: true,
    distanceKm: result.distanceKm,
    fee: result.fee,
    etaMinutes: result.etaMinutes,
    lat: result.dest.lat,
    lng: result.dest.lng,
  };
}

// === Pedido com entrega ===
export type CreateOrderDeliveryInput = {
  mode: DeliveryMode;
  address?: AddressInput;
  deliveryFee?: number;
  addressId?: string;
  lat?: number;
  lng?: number;
};

export type CreateOrderWithDeliveryInput = {
  items: { productId: string; quantity: number }[];
  paymentMethod: PaymentMethod;
  observation?: string | null;
  delivery?: CreateOrderDeliveryInput;
};

// Re-export do createOrderAction com suporte a delivery:
// Para evitar duplicação, vamos estender o input via augmentação no orders.ts.
// Aqui mantemos apenas helpers de delivery.

// === Atualizações de status da entrega (motoboy) ===

export type DeliveryActionResult =
  | { ok: true; delivery: Delivery }
  | { ok: false; error: string };

export async function assignMotoboyAction(
  orderId: string,
  motoboyId: string | null
): Promise<DeliveryActionResult> {
  const session = await auth();
  if (!session?.user || !can(
    { id: session.user.id, userType: session.user.userType, role: session.user.role, name: session.user.name, email: session.user.email },
    "delivery.assign"
  )) {
    return { ok: false, error: "Sem permissão." };
  }
  const delivery = await prisma.delivery.findUnique({ where: { orderId } });
  if (!delivery) return { ok: false, error: "Entrega não encontrada." };

  const updated = await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      motoboyId,
      status: motoboyId ? DeliveryStatus.ASSIGNED : DeliveryStatus.PENDING,
      assignedAt: motoboyId ? new Date() : null,
    },
  });
  revalidatePath("/admin/delivery");
  revalidatePath(`/pedido/${orderId}`);
  return { ok: true, delivery: updated };
}

export async function pickupDeliveryAction(orderId: string): Promise<DeliveryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Não autenticado." };
  const delivery = await prisma.delivery.findUnique({ where: { orderId } });
  if (!delivery) return { ok: false, error: "Entrega não encontrada." };
  if (delivery.motoboyId !== session.user.id) {
    return { ok: false, error: "Esta entrega não é sua." };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryStatus.OUT_FOR_DELIVERY,
        pickedUpAt: new Date(),
      },
    });
    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.OUT_FOR_DELIVERY },
    });
    await tx.orderHistory.create({
      data: {
        orderId,
        fromStatus: OrderStatus.READY,
        toStatus: OrderStatus.OUT_FOR_DELIVERY,
        userId: session.user.id,
      },
    });
    return d;
  });

  await prisma.notification.create({
    data: {
      userId: null,
      type: "ORDER_STATUS",
      title: `Pedido saiu para entrega`,
      body: `O motoboy retirou o pedido e está a caminho.`,
      link: `/pedido/${orderId}`,
    },
  });

  revalidatePath("/admin/delivery");
  revalidatePath(`/pedido/${orderId}`);
  revalidatePath("/entregador");
  return { ok: true, delivery: updated };
}

export async function markDeliveredAction(
  orderId: string,
  failureReason?: string
): Promise<DeliveryActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Não autenticado." };
  const delivery = await prisma.delivery.findUnique({ where: { orderId } });
  if (!delivery) return { ok: false, error: "Entrega não encontrada." };
  if (delivery.motoboyId !== session.user.id) {
    return { ok: false, error: "Esta entrega não é sua." };
  }

  const isFailure = !!failureReason;
  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.delivery.update({
      where: { id: delivery.id },
      data: {
        status: isFailure ? DeliveryStatus.FAILED : DeliveryStatus.DELIVERED,
        deliveredAt: isFailure ? null : new Date(),
        failedReason: failureReason ?? null,
      },
    });
    if (!isFailure) {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DELIVERED },
      });
      await tx.orderHistory.create({
        data: {
          orderId,
          fromStatus: OrderStatus.OUT_FOR_DELIVERY,
          toStatus: OrderStatus.DELIVERED,
          userId: session.user.id,
        },
      });
    } else {
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      await tx.orderHistory.create({
        data: {
          orderId,
          fromStatus: OrderStatus.OUT_FOR_DELIVERY,
          toStatus: OrderStatus.CANCELLED,
          userId: session.user.id,
        },
      });
    }
    return d;
  });

  await audit({
    userId: session.user.id,
    action: "STATUS_CHANGE",
    resource: "delivery",
    entityId: delivery.id,
    details: isFailure
      ? `Falha na entrega: ${failureReason}`
      : "Entrega concluída",
  });

  revalidatePath("/admin/delivery");
  revalidatePath(`/pedido/${orderId}`);
  revalidatePath("/entregador");
  return { ok: true, delivery: updated };
}

// === Localização em tempo real ===
export async function recordLocationAction(
  deliveryId: string,
  lat: number,
  lng: number,
  accuracy?: number,
  speed?: number,
  heading?: number
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Não autenticado." };
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return { ok: false, error: "Entrega não encontrada." };
  if (delivery.motoboyId !== session.user.id) {
    return { ok: false, error: "Esta entrega não é sua." };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: "Coordenadas inválidas." };
  }
  await prisma.deliveryLocation.create({
    data: {
      deliveryId,
      lat,
      lng,
      accuracy: accuracy ?? null,
      speed: speed ?? null,
      heading: heading ?? null,
    },
  });
  // Mantém só as últimas 200 localizações por entrega
  const total = await prisma.deliveryLocation.count({ where: { deliveryId } });
  if (total > 200) {
    const old = await prisma.deliveryLocation.findMany({
      where: { deliveryId },
      orderBy: { recordedAt: "asc" },
      take: total - 200,
      select: { id: true },
    });
    if (old.length > 0) {
      await prisma.deliveryLocation.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
    }
  }
  return { ok: true };
}