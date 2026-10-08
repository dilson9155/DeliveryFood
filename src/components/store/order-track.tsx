"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  MapPin,
  Clock,
  Receipt,
  Phone,
  Bike,
  Truck,
  Navigation,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintButtons } from "@/components/ui/print-buttons";
import {
  formatCurrency,
  formatDateTime,
  formatTime,
} from "@/lib/format";
import {
  PAYMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  STATUS_STEPS,
  STATUS_STEPS_DELIVERY,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_STEPS,
  orderNumberLabel,
} from "@/lib/order-ui";
import { TrackingMap } from "@/components/delivery/TrackingMap";
import { PixPayment } from "@/components/store/pix-payment";
import type { LatLng } from "@/lib/geo";

type OrderData = {
  id: string;
  number: number;
  status: string;
  deliveryMode: "PICKUP" | "DELIVERY";
  deliveryFee: number;
  discount: number;
  discountReason: string | null;
  total: number;
  paymentMethod: string;
  paymentStatus: string;
  observation: string | null;
  createdAt: string;
  customer: { name: string; phone: string | null };
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  history: { id: string; fromStatus: string | null; toStatus: string; createdAt: string }[];
  payment: {
    id: string;
    status: string;
    confirmedAt: string | null;
  } | null;
};

type DeliveryData = {
  id: string;
  mode: "PICKUP" | "DELIVERY";
  status: "PENDING" | "ASSIGNED" | "OUT_FOR_DELIVERY" | "ARRIVED" | "DELIVERED" | "FAILED";
  addressSnapshot: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    lat?: number;
    lng?: number;
  };
  motoboy: { name: string; phone: string | null; vehiclePlate: string | null; vehicleModel: string | null } | null;
  locations: { lat: number; lng: number; recordedAt: string }[];
};

type TrackOrder = Omit<OrderData, "status" | "paymentStatus"> & {
  status: keyof typeof STATUS_LABELS;
  paymentStatus: keyof typeof PAYMENT_STATUS_LABELS;
};

type PaymentIntentData = {
  id: string;
  status: string;
  qrCodeBase64: string | null;
  qrCodeText: string | null;
  pixExpiresAt: string | null;
  paidAt: string | null;
} | null;

export function OrderTrack({
  order: initial,
  delivery: initialDelivery,
  paymentIntent: initialIntent,
  settings,
  isCustomer,
}: {
  order: TrackOrder;
  delivery: DeliveryData | null;
  paymentIntent: PaymentIntentData;
  settings: {
    storeName: string;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    prepTimeMinutes: number | null;
  };
  isCustomer: boolean;
}) {
  const [order, setOrder] = useState(initial);
  const [delivery, setDelivery] = useState(initialDelivery);
  const [origin, setOrigin] = useState<LatLng | null>(null);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${initial.id}/poll`);
        if (res.ok) {
          const data = await res.json();
          setOrder((prev) => ({ ...prev, ...data.order }));
          if (data.delivery) setDelivery(data.delivery);
          if (data.origin) setOrigin(data.origin);
        }
      } catch {
        // ignora erros de polling
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [initial.id]);

  const isDeliveryOrder = delivery?.mode === "DELIVERY";
  const cancelled = order.status === "CANCELLED";
  const steps = isDeliveryOrder ? STATUS_STEPS_DELIVERY : STATUS_STEPS;
  const currentIndex = steps.indexOf(order.status as (typeof steps)[number]);
  const showMap = isDeliveryOrder && !!delivery;

  return (
    <div className="container-store py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold sm:text-2xl">
            Pedido {orderNumberLabel(order.number)}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Realizado em {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <Link href={`/recibo/${order.id}`}>
            <Button variant="outline">
              <Receipt className="h-4 w-4" />
              Ver recibo
            </Button>
          </Link>
          <PrintButtons documentTitle={`Pedido-${orderNumberLabel(order.number)}`} />
        </div>
      </div>

      {cancelled ? (
        <Card className="mb-6 border-danger/20 bg-danger/5 p-6">
          <h2 className="text-lg font-bold text-danger">Pedido cancelado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Este pedido foi cancelado. Se você não solicitou o cancelamento, entre em contato com o estabelecimento.
          </p>
        </Card>
      ) : (
        <Card className="mb-6 p-6">
          <div className="mb-4 flex items-center gap-3">
            <Badge tone={STATUS_TONE[order.status]}>
              {STATUS_LABELS[order.status]}
            </Badge>
            {order.paymentStatus === "PENDING" && (
              <Badge tone="warning">
                {isDeliveryOrder ? "Pagamento na entrega" : "Pagamento pendente (efetuado na retirada)"}
              </Badge>
            )}
            {order.paymentStatus === "CONFIRMED" && (
              <Badge tone="success">Pagamento confirmado</Badge>
            )}
            {isDeliveryOrder && delivery && (
              <Badge tone="info" className="flex items-center gap-1">
                <Truck className="h-3 w-3" /> Entrega
              </Badge>
            )}
          </div>

          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {steps.map((step, idx) => {
              const done = idx < currentIndex;
              const active = idx === currentIndex;
              return (
                <li key={step} className="flex items-start gap-2 sm:flex-col sm:items-center sm:text-center">
                  {done ? (
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
                  ) : active ? (
                    <Circle className="h-6 w-6 shrink-0 text-brand-600 fill-brand-100" />
                  ) : (
                    <Circle className="h-6 w-6 shrink-0 text-border" />
                  )}
                  <span
                    className={`text-xs font-medium ${
                      done || active ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {STATUS_LABELS[step]}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Pagamento PIX (mostrar quando pendente + PIX + cliente é dono do pedido) */}
      {order.paymentMethod === "PIX" && order.paymentStatus === "PENDING" && (
        <div className="mb-6">
          <PixPayment
            orderId={order.id}
            amount={order.total}
            initialQrBase64={initialIntent?.qrCodeBase64 ?? null}
            initialQrText={initialIntent?.qrCodeText ?? null}
            initialPixExpiresAt={initialIntent?.pixExpiresAt ?? null}
            initialStatus={
              initialIntent?.status === "PAID"
                ? "PAID"
                : initialIntent?.status === "EXPIRED"
                    ? "EXPIRED"
                    : initialIntent
                      ? "PENDING"
                      : null
            }
          />
        </div>
      )}

      {showMap && (
        <Card className="mb-6 overflow-hidden p-0">
          <div className="border-b border-border bg-muted/50 p-4">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Navigation className="h-4 w-4 text-brand-600" />
              Acompanhe seu pedido em tempo real
            </h2>
            {delivery.motoboy ? (
              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <Bike className="h-3.5 w-3.5" />
                Motoboy: <strong>{delivery.motoboy.name}</strong>
                {delivery.motoboy.vehiclePlate && (
                  <span>· {delivery.motoboy.vehiclePlate}</span>
                )}
                {delivery.motoboy.vehicleModel && (
                  <span>· {delivery.motoboy.vehicleModel}</span>
                )}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Aguardando um motoboy ser atribuído
              </p>
            )}
          </div>
          <TrackingMap
            origin={origin}
            destination={
              delivery.addressSnapshot.lat && delivery.addressSnapshot.lng
                ? { lat: delivery.addressSnapshot.lat, lng: delivery.addressSnapshot.lng }
                : null
            }
            current={
              delivery.locations.length > 0
                ? {
                    lat: delivery.locations[delivery.locations.length - 1].lat,
                    lng: delivery.locations[delivery.locations.length - 1].lng,
                  }
                : null
            }
            routePoints={delivery.locations.map((l) => ({ lat: l.lat, lng: l.lng }))}
            height={360}
          />
          <div className="border-t border-border bg-background p-4">
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {DELIVERY_STATUS_STEPS.map((step) => {
                const currentIdx = DELIVERY_STATUS_STEPS.indexOf(delivery!.status);
                const stepIdx = DELIVERY_STATUS_STEPS.indexOf(step);
                const done = stepIdx <= currentIdx;
                return (
                  <li key={step} className="flex items-center gap-1.5 text-[11px]">
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 text-border" />
                    )}
                    <span className={done ? "font-medium" : "text-muted-foreground"}>
                      {DELIVERY_STATUS_LABELS[step]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">Itens do pedido</h2>
            <ul className="space-y-2.5">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium">{i.quantity}× {i.productName}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {formatCurrency(i.unitPrice)} cada
                    </span>
                  </span>
                  <span className="font-semibold">{formatCurrency(i.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 space-y-1 border-t border-border pt-3 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(order.total - order.deliveryFee + order.discount)}</span>
              </div>
              {order.deliveryFee > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Taxa de entrega</span>
                  <span>{formatCurrency(order.deliveryFee)}</span>
                </div>
              )}
              {order.discount > 0 && (
                <div className="flex items-center justify-between text-success">
                  <span>Desconto{order.discountReason ? ` (${order.discountReason})` : ""}</span>
                  <span>−{formatCurrency(order.discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2">
                <span className="font-medium">Total</span>
                <span className="text-xl font-extrabold text-brand-700">
                  {formatCurrency(order.total)}
                </span>
              </div>
            </div>
          </Card>

          {order.observation && (
            <Card className="p-5">
              <h2 className="mb-1 text-sm font-bold">Observação</h2>
              <p className="text-sm text-muted-foreground">{order.observation}</p>
            </Card>
          )}

          {isDeliveryOrder && delivery && (
            <Card className="p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
                <MapPin className="h-4 w-4 text-brand-600" />
                Endereço de entrega
              </h2>
              <p className="text-sm font-semibold">
                {delivery.addressSnapshot.street}, {delivery.addressSnapshot.number}
              </p>
              {delivery.addressSnapshot.complement && (
                <p className="text-sm text-muted-foreground">
                  {delivery.addressSnapshot.complement}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {delivery.addressSnapshot.neighborhood} · {delivery.addressSnapshot.city}/{delivery.addressSnapshot.state}
              </p>
            </Card>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">Acompanhamento</h2>
            {order.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro.</p>
            ) : (
              <ul className="space-y-2.5">
                {[...order.history].reverse().map((h) => (
                  <li key={h.id} className="flex items-center gap-3 text-sm">
                    <span className="flex h-2 w-2 shrink-0 rounded-full bg-brand-600" />
                    <span className="font-medium">{STATUS_LABELS[h.toStatus as keyof typeof STATUS_LABELS]}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatTime(h.createdAt)} — {h.fromStatus ? STATUS_LABELS[h.fromStatus as keyof typeof STATUS_LABELS] : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
              <MapPin className="h-4 w-4 text-brand-600" />
              {isDeliveryOrder ? "Loja" : "Retirada no estabelecimento"}
            </h2>
            <p className="text-sm font-semibold">{settings.storeName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {settings.address}
              {settings.number ? `, ${settings.number}` : ""}
              {settings.complement ? ` - ${settings.complement}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {settings.neighborhood}
              {settings.city ? `, ${settings.city}` : ""}
              {settings.state ? ` - ${settings.state}` : ""}
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" /> {settings.phone ?? "Não informado"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5" /> Preparo estimado: {settings.prepTimeMinutes ?? 30} min
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold">Pagamento</h2>
            <div className="space-y-1.5 text-sm">
              <p className="flex justify-between">
                <span className="text-muted-foreground">Forma</span>
                <span className="font-medium">
                  {PAYMENT_LABELS[order.paymentMethod as keyof typeof PAYMENT_LABELS]}
                </span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge tone={order.paymentStatus === "CONFIRMED" ? "success" : "warning"}>
                  {PAYMENT_STATUS_LABELS[order.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS]}
                </Badge>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">{formatCurrency(order.total)}</span>
              </p>
            </div>
          </Card>

          {isCustomer && (
            <p className="text-xs text-muted-foreground no-print">
              {isDeliveryOrder
                ? "O pagamento é feito na hora da entrega (ou antes pelo app)." + (delivery.motoboy?.phone ? ` Motoboy: ${delivery.motoboy.phone}` : "")
                : "O pagamento é feito somente na retirada. Leve seu celular com o número do pedido."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}