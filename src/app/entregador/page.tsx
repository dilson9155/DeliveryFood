import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliveryStatus } from "@prisma/client";
import { MotoboyPanel, type MotoboyDelivery } from "@/components/delivery/MotoboyPanel";
import { getStoreOrigin } from "@/lib/delivery";
import { logoutAction } from "@/app/actions/auth";
import Link from "next/link";
import { LogOut, Bike } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel do Motoboy" };

export default async function MotoboyPage() {
  const session = await auth();
  if (!session?.user) return null;

  const [deliveries, origin] = await Promise.all([
    prisma.delivery.findMany({
      where: {
        motoboyId: session.user.id,
        status: { in: [
          DeliveryStatus.ASSIGNED,
          DeliveryStatus.OUT_FOR_DELIVERY,
          DeliveryStatus.ARRIVED,
        ] as DeliveryStatus[] },
      },
      orderBy: { assignedAt: "asc" },
      include: {
        order: {
          select: {
            id: true,
            number: true,
            total: true,
            deliveryFee: true,
            customer: { select: { name: true, phone: true } },
            items: { select: { quantity: true } },
          },
        },
        locations: {
          orderBy: { recordedAt: "asc" },
          take: 50,
          select: { lat: true, lng: true },
        },
      },
    }),
    getStoreOrigin(),
  ]);

  const motoboyDeliveries: MotoboyDelivery[] = deliveries.map((d) => {
    const snap = d.addressSnapshot as {
      street: string;
      number: string;
      complement: string | null;
      neighborhood: string;
      city: string;
      state: string;
      lat?: number;
      lng?: number;
    };
    // Busca o último ponto do motoboy para exibir no mapa
    const lastLoc = d.locations.length > 0 ? d.locations[d.locations.length - 1] : null;
    return {
      id: d.id,
      orderId: d.order.id,
      number: d.order.number,
      customerName: d.order.customer.name,
      customerPhone: d.order.customer.phone,
      total: d.order.total,
      deliveryFee: d.order.deliveryFee,
      status: d.status as MotoboyDelivery["status"],
      address: {
        street: snap.street,
        number: snap.number,
        complement: snap.complement ?? null,
        neighborhood: snap.neighborhood,
        city: snap.city,
        state: snap.state,
        lat: snap.lat ?? lastLoc?.lat ?? 0,
        lng: snap.lng ?? lastLoc?.lng ?? 0,
      },
      origin,
      lastLocations: d.locations.map((l) => ({ lat: l.lat, lng: l.lng })),
      itemsCount: d.order.items.reduce((s, i) => s + i.quantity, 0),
    };
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="container-store flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Bike className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold">Delícias das Estações</p>
              <p className="text-[11px] text-muted-foreground">Painel do Motoboy</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.user.name}
            </span>
            <form action={async () => { await logoutAction(); }}>
              <button className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm hover:bg-muted">
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container-store py-5">
        <MotoboyPanel
          motoboyId={session.user.id}
          deliveries={motoboyDeliveries}
          origin={origin}
        />
      </main>
    </div>
  );
}