"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bike,
  MapPin,
  Package,
  CheckCircle2,
  XCircle,
  Phone,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { TrackingMap } from "@/components/delivery/TrackingMap";
import {
  pickupDeliveryAction,
  markDeliveredAction,
  recordLocationAction,
} from "@/app/actions/delivery";
import { formatCurrency } from "@/lib/format";
import { playBell, unlockAudio } from "@/lib/sound";
import type { LatLng } from "@/lib/geo";

type DeliveryStatus = "PENDING" | "ASSIGNED" | "OUT_FOR_DELIVERY" | "ARRIVED" | "DELIVERED" | "FAILED";

export type MotoboyDelivery = {
  id: string;          // delivery id
  orderId: string;
  number: number;
  customerName: string;
  customerPhone: string | null;
  total: number;
  deliveryFee: number;
  status: DeliveryStatus;
  address: {
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    lat: number;
    lng: number;
  };
  route?: LatLng[] | null;   // rota por ruas (OSRM) para desenhar no mapa
  origin?: LatLng | null;
  lastLocations?: LatLng[];
  itemsCount: number;
};

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Aguardando",
  ASSIGNED: "Atribuído",
  OUT_FOR_DELIVERY: "A caminho",
  ARRIVED: "No endereço",
  DELIVERED: "Entregue",
  FAILED: "Falhou",
};

export function MotoboyPanel({
  motoboyId,
  deliveries: initial,
  origin,
}: {
  motoboyId: string;
  deliveries: MotoboyDelivery[];
  origin: LatLng | null;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [deliveries, setDeliveries] = useState(initial);
  const [selected, setSelected] = useState<MotoboyDelivery | null>(
    initial[0] ?? null
  );
  const [myPos, setMyPos] = useState<LatLng | null>(null);
  const [isPending, startTransition] = useTransition();
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const [tracking, setTracking] = useState(false);
  const seenIds = useRef<Set<string>>(new Set(initial.map((d) => d.id)));

  // Inicia watchPosition quando uma entrega OUT_FOR_DELIVERY é selecionada
  useEffect(() => {
    const isActive =
      selected?.status === "OUT_FOR_DELIVERY" || selected?.status === "ASSIGNED";

    if (!isActive || typeof navigator === "undefined" || !navigator.geolocation) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
        setTracking(false);
      }
      return;
    }

    setTracking(true);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyPos(next);
        // Envia para o servidor a cada 10s
        const now = Date.now();
        if (
          selected &&
          now - lastSentRef.current >= 10_000 &&
          selected.status === "OUT_FOR_DELIVERY"
        ) {
          lastSentRef.current = now;
          void recordLocationAction(
            selected.id,
            next.lat,
            next.lng,
            pos.coords.accuracy ?? undefined,
            pos.coords.speed ?? undefined,
            pos.coords.heading ?? undefined
          );
        }
      },
      (err) => {
        // eslint-disable-next-line no-console
        console.warn("[geo]", err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10_000 }
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      watchIdRef.current = null;
      setTracking(false);
    };
  }, [selected]);

  // Refresh automático da lista a cada 15s
  const refresh = useCallback(() => router.refresh(), [router]);
  useEffect(() => {
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    // Alerta ao receber novas entregas atribuídas
    let hasNew = false;
    for (const d of deliveries) {
      if (d.status === "ASSIGNED" && !seenIds.current.has(d.id)) {
        hasNew = true;
        seenIds.current.add(d.id);
      }
    }
    if (hasNew) {
      try { unlockAudio(); playBell(0.9); } catch {}
    }
    // Atualiza conjunto
    for (const d of deliveries) seenIds.current.add(d.id);
  }, [deliveries]);

  function startRoute(d: MotoboyDelivery) {
    startTransition(async () => {
      const res = await pickupDeliveryAction(d.orderId);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      setDeliveries((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, status: "OUT_FOR_DELIVERY" } : x))
      );
      setSelected({ ...d, status: "OUT_FOR_DELIVERY" });
      show("success", "Rota iniciada — sua posição está sendo compartilhada.");
      refresh();
    });
  }

  function markDelivered(d: MotoboyDelivery) {
    startTransition(async () => {
      const res = await markDeliveredAction(d.orderId);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      setDeliveries((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, status: "DELIVERED" } : x))
      );
      const prox = deliveries.find((x) => x.id !== d.id && x.status !== "DELIVERED");
      setSelected(prox ?? null);
      show("success", "Entrega concluída!");
      refresh();
    });
  }

  function markFailed(d: MotoboyDelivery, reason: string) {
    const r = reason.trim();
    if (!r) {
      show("error", "Informe o motivo.");
      return;
    }
    startTransition(async () => {
      const res = await markDeliveredAction(d.orderId, r);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      setDeliveries((prev) =>
        prev.map((x) => (x.id === d.id ? { ...x, status: "FAILED" } : x))
      );
      show("info", "Entrega marcada como falha.");
      refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Bike className="h-6 w-6 text-brand-600" />
            Painel do Motoboy
          </h1>
          <p className="text-sm text-muted-foreground">
            Atualização automática · {deliveries.filter((d) => d.status !== "DELIVERED" && d.status !== "FAILED").length} ativa(s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tracking && (
            <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold uppercase text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Compartilhando
            </span>
          )}
          <Button size="sm" variant="outline" onClick={() => { unlockAudio(); playBell(0.9); }}>
            Testar som
          </Button>
          <Button size="sm" variant="outline" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        {/* Lista de pedidos */}
        <div className="space-y-2">
          {deliveries.length === 0 && (
            <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Nenhuma entrega atribuída no momento.
            </div>
          )}
          {deliveries.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                selected?.id === d.id
                  ? "border-brand-600 bg-brand-50"
                  : "border-border bg-card"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-brand-700">
                  #{String(d.number).padStart(4, "0")}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  d.status === "DELIVERED" || d.status === "FAILED"
                    ? "bg-muted text-muted-foreground"
                    : "bg-brand-100 text-brand-700"
                }`}>
                  {STATUS_LABELS[d.status]}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-medium">{d.customerName}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {d.address.street}, {d.address.number} · {d.address.neighborhood}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.itemsCount} item(ns) · {formatCurrency(d.total)}
              </p>
            </button>
          ))}
        </div>

        {/* Detalhe + mapa */}
        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pedido</p>
                  <p className="text-lg font-bold">
                    #{String(selected.number).padStart(4, "0")}
                  </p>
                </div>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Cliente</p>
                  <p className="text-sm font-medium">{selected.customerName}</p>
                  {selected.customerPhone && (
                    <a
                      href={`tel:${selected.customerPhone}`}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                    >
                      <Phone className="h-3 w-3" />
                      {selected.customerPhone}
                    </a>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Endereço</p>
                  <p className="text-sm font-medium">
                    {selected.address.street}, {selected.address.number}
                  </p>
                  {selected.address.complement && (
                    <p className="text-xs text-muted-foreground">
                      {selected.address.complement}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {selected.address.neighborhood} · {selected.address.city}/{selected.address.state}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-semibold">Total do pedido</span>
                <span className="text-lg font-extrabold text-brand-700">
                  {formatCurrency(selected.total)}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {selected.status === "ASSIGNED" && (
                  <Button
                    className="w-full"
                    onClick={() => startRoute(selected)}
                    disabled={isPending}
                  >
                    <Bike className="h-4 w-4" />
                    Iniciar rota
                  </Button>
                )}
                {selected.status === "OUT_FOR_DELIVERY" && (
                  <>
                    <Button
                      variant="success"
                      className="flex-1"
                      onClick={() => markDelivered(selected)}
                      disabled={isPending}
                    >
                      {isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Confirmar entrega
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => {
                        const reason = window.prompt("Motivo da falha?");
                        if (reason !== null) markFailed(selected, reason);
                      }}
                      disabled={isPending}
                    >
                      <XCircle className="h-4 w-4" />
                      Não consegui entregar
                    </Button>
                  </>
                )}
                {selected.customerPhone && (
                  <a
                    href={`https://wa.me/55${selected.customerPhone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                  >
                    WhatsApp
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.address.lat},${selected.address.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                >
                  <MapPin className="h-4 w-4" />
                  Abrir no Maps
                </a>
              </div>
            </div>

            <TrackingMap
              origin={origin}
              destination={{
                lat: selected.address.lat,
                lng: selected.address.lng,
              }}
              current={myPos}
              routePoints={selected.lastLocations ?? []}
              roadRoute={selected.route ?? null}
              height={440}
              zoom={17}
              follow
            />

            {selected.status === "OUT_FOR_DELIVERY" && !tracking && (
              <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
                Permita acesso à localização para iniciar o tracking.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-10 w-10 text-muted-foreground/60" />
            Selecione uma entrega à esquerda para ver detalhes.
          </div>
        )}
      </div>
    </div>
  );
}