"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChefHat,
  Clock,
  MapPin,
  PackageCheck,
  Phone,
  Receipt,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintButtons } from "@/components/ui/print-buttons";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  PAYMENT_LABELS,
  PAYMENT_STATUS_LABELS,
  STATUS_LABELS,
  orderNumberLabel,
} from "@/lib/order-ui";
import { PixPayment } from "@/components/store/pix-payment";
import { describeOptions } from "@/lib/product-options";

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
    options?: { groupName: string; optionName: string; quantity: number; unitPrice: number }[];
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
  status: string;
  addressSnapshot: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
  };
  motoboy: { name: string; phone: string | null } | null;
};

type TrackOrder = Omit<OrderData, "status" | "paymentStatus"> & {
  status: keyof typeof STATUS_LABELS;
  paymentStatus: keyof typeof PAYMENT_STATUS_LABELS;
};

type PaymentIntentData = {
  id: string;
  provider: "MANUAL" | "ASAAS" | "PAGBANK";
  status: string;
  qrCodeBase64: string | null;
  qrCodeText: string | null;
  pixExpiresAt: string | null;
  paidAt: string | null;
} | null;

/** Uma única mensagem para o cliente, sem etapas intermediárias. */
function statusMessage(
  status: keyof typeof STATUS_LABELS,
  isDeliveryOrder: boolean,
  motoboyName: string | null
) {
  switch (status) {
    case "NEW":
    case "CONFIRMED":
    case "PREPARING":
      return {
        Icon: ChefHat,
        title: "Pedido recebido e em preparo",
        text: isDeliveryOrder
          ? "Recebemos seu pedido e estamos preparando para entrega."
          : "Recebemos seu pedido e estamos preparando para retirada.",
      };
    case "READY":
      return {
        Icon: PackageCheck,
        title: isDeliveryOrder ? "Pedido pronto para entrega" : "Pedido pronto para retirada",
        text: isDeliveryOrder
          ? "Seu pedido já está pronto e será levado até você."
          : "Seu pedido já está pronto. Pode retirar no estabelecimento.",
      };
    case "OUT_FOR_DELIVERY":
      return {
        Icon: Truck,
        title: "Seu pedido está a caminho",
        text: motoboyName
          ? `${motoboyName} está levando seu pedido até você.`
          : "O entregador está levando seu pedido até você.",
      };
    case "PICKED_UP":
    case "DELIVERED":
    case "FINISHED":
      return {
        Icon: CheckCircle2,
        title: isDeliveryOrder ? "Pedido entregue" : "Pedido retirado",
        text: "Obrigado por pedir! Bom apetite.",
      };
    default:
      return {
        Icon: PackageCheck,
        title: STATUS_LABELS[status],
        text: "Acompanhe as atualizações do seu pedido.",
      };
  }
}

export function OrderTrack({
  order: initial,
  delivery: initialDelivery,
  paymentIntent: initialIntent,
  staticPixConfigured,
  settings,
  isCustomer,
}: {
  order: TrackOrder;
  delivery: DeliveryData | null;
  paymentIntent: PaymentIntentData;
  staticPixConfigured: boolean;
  settings: {
    storeName: string;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    whatsapp: string | null;
    prepTimeMinutes: number | null;
  };
  isCustomer: boolean;
}) {
  const [order, setOrder] = useState(initial);
  const [delivery, setDelivery] = useState(initialDelivery);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${initial.id}/poll`);
        if (res.ok) {
          const data = await res.json();
          setOrder((prev) => ({ ...prev, ...data.order }));
          if (data.delivery) setDelivery(data.delivery);
        }
      } catch {
        // ignora erros de polling
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [initial.id]);

  const isDeliveryOrder = delivery?.mode === "DELIVERY";
  const cancelled = order.status === "CANCELLED";
  const { Icon, title, text } = statusMessage(
    order.status,
    isDeliveryOrder,
    delivery?.motoboy?.name ?? null
  );

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

      <Card className="mb-6 p-0">
        {cancelled ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-danger" />
            <h2 className="mt-4 text-xl font-extrabold text-danger">Pedido cancelado</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Este pedido foi cancelado. Se você não solicitou o cancelamento, entre em contato com o estabelecimento.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Icon className="h-10 w-10" strokeWidth={1.8} />
            </div>
            <h2 className="mt-5 text-xl font-extrabold sm:text-2xl">{title}</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{text}</p>
          </div>
        )}
      </Card>

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
            provider={initialIntent?.provider ?? null}
            staticPixConfigured={staticPixConfigured}
            whatsapp={settings.whatsapp}
          />
        </div>
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
                    {i.options && i.options.length > 0 && (
                      <span className="mt-0.5 block text-xs leading-snug text-brand-700">
                        {describeOptions(i.options)}
                      </span>
                    )}
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
                ? "O pagamento é feito na hora da entrega (ou antes pelo app)." + (delivery?.motoboy?.phone ? ` Motoboy: ${delivery.motoboy.phone}` : "")
                : "O pagamento é feito somente na retirada. Leve seu celular com o número do pedido."}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
