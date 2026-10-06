"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bike, User as UserIcon, Loader2, RefreshCw, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatTime } from "@/lib/format";
import { assignMotoboyToOrderAction } from "@/app/actions/admin";

type Status = "PENDING" | "ASSIGNED" | "OUT_FOR_DELIVERY" | "ARRIVED" | "DELIVERED" | "FAILED";

type Delivery = {
  id: string;
  orderId: string;
  status: Status;
  distanceKm: number | null;
  fee: number;
  createdAt: string;
  addressSnapshot: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  order: {
    id: string;
    number: number;
    total: number;
    deliveryFee: number;
    customer: { name: string; phone: string | null };
  };
  motoboy: { id: string; name: string } | null;
};

type Motoboy = { id: string; name: string };

const COLUMNS: { status: Status; label: string; tone: string }[] = [
  { status: "PENDING", label: "Aguardando", tone: "border-t-info" },
  { status: "ASSIGNED", label: "Atribuídos", tone: "border-t-brand-500" },
  { status: "OUT_FOR_DELIVERY", label: "Em rota", tone: "border-t-warning" },
  { status: "ARRIVED", label: "No endereço", tone: "border-t-success" },
];

export function DeliveryBoard({
  deliveries: initial,
  motoboys,
}: {
  deliveries: Delivery[];
  motoboys: Motoboy[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [deliveries, setDeliveries] = useState(initial);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(t);
  }, [router]);

  function assign(d: Delivery, motoboyId: string | null) {
    startTransition(async () => {
      const res = await assignMotoboyToOrderAction({ orderId: d.orderId, motoboyId });
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      setDeliveries((prev) =>
        prev.map((x) =>
          x.id === d.id
            ? {
                ...x,
                motoboy: motoboyId
                  ? motoboys.find((m) => m.id === motoboyId) ?? null
                  : null,
                status: motoboyId ? "ASSIGNED" : "PENDING",
              }
            : x
        )
      );
      show("success", motoboyId ? "Motoboy atribuído" : "Motoboy removido");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Bike className="h-6 w-6 text-brand-600" />
            Entregas
          </h1>
          <p className="text-sm text-muted-foreground">
            Atribua motoboys e acompanhe em tempo real (atualização a cada 8s).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => router.refresh()}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
          <Badge tone="info">
            {deliveries.filter((d) => d.status === "PENDING").length} pendente(s)
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = deliveries.filter((d) => d.status === col.status);
          return (
            <div
              key={col.status}
              className={`rounded-2xl border border-t-4 ${col.tone} bg-card`}
            >
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-bold">{col.label}</h2>
                <Badge>{items.length}</Badge>
              </div>
              <div className="max-h-[70vh] space-y-2.5 overflow-y-auto px-3 pb-3">
                {items.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    Nenhuma entrega
                  </p>
                )}
                {items.map((d) => (
                  <DeliveryCard
                    key={d.id}
                    delivery={d}
                    motoboys={motoboys}
                    onAssign={(id) => assign(d, id)}
                    isPending={isPending}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeliveryCard({
  delivery: d,
  motoboys,
  onAssign,
  isPending,
}: {
  delivery: Delivery;
  motoboys: Motoboy[];
  onAssign: (motoboyId: string | null) => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-center justify-between">
        <span className="font-extrabold text-brand-700">
          #{String(d.order.number).padStart(4, "0")}
        </span>
        <span className="text-xs text-muted-foreground">{formatTime(d.createdAt)}</span>
      </div>
      <p className="mt-1 truncate text-sm font-medium">{d.order.customer.name}</p>
      <p className="line-clamp-2 text-xs text-muted-foreground">
        {d.addressSnapshot.street}, {d.addressSnapshot.number}
        <br />
        {d.addressSnapshot.neighborhood} · {d.addressSnapshot.city}/{d.addressSnapshot.state}
      </p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-bold">{formatCurrency(d.order.total)}</span>
        {d.distanceKm != null && (
          <span className="text-xs text-muted-foreground">
            {d.distanceKm.toFixed(1)} km · {formatCurrency(d.fee)}
          </span>
        )}
      </div>
      {d.order.customer.phone && (
        <a
          href={`tel:${d.order.customer.phone}`}
          className="mt-1.5 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <Phone className="h-3 w-3" /> {d.order.customer.phone}
        </a>
      )}
      <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
        <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <select
          className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
          value={d.motoboy?.id ?? ""}
          onChange={(e) => onAssign(e.target.value || null)}
          disabled={isPending}
        >
          <option value="">— Sem motoboy —</option>
          {motoboys.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
    </div>
  );
}

// Re-export no fim (mantido por retrocompat, mas o import já está no topo)