import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Printer, Truck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { orderNumberLabel, PAYMENT_LABELS, STATUS_LABELS } from "@/lib/order-ui";
import { DeliveryMode, OrderStatus, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fila de entregas" };

const ACTIVE_STATUSES: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.PICKED_UP,
  OrderStatus.DELIVERED,
];

export default async function DeliveryQueuePage() {
  const orders = await prisma.order.findMany({
    where: {
      deliveryMode: DeliveryMode.DELIVERY,
      status: { in: ACTIVE_STATUSES },
      createdAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { createdAt: Prisma.SortOrder.asc },
    include: {
      customer: { select: { name: true, phone: true } },
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
          options: {
            select: { groupName: true, optionName: true, quantity: true },
          },
        },
      },
      payment: { select: { status: true } },
    },
    take: 200,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Truck className="h-6 w-6 text-brand-600" /> Fila de entregas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pedidos com entrega dos últimos 7 dias, em ordem de chegada. O número do pedido é o
            código usado pelo entregador.
          </p>
        </div>
        <Link
          href="/admin/pedidos"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-muted"
        >
          Ver todos os pedidos <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Truck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-semibold">Nenhuma entrega na fila</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pedidos com entrega aparecerão aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {orders.map((order, index) => {
            const paid = order.payment?.status === "CONFIRMED";
            const name = order.recipientName || order.customer.name;
            const phone = order.recipientPhone || order.customer.phone;
            return (
              <div
                key={order.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {index + 1}º na fila · {formatDateTime(order.createdAt)}
                    </p>
                    <p className="mt-0.5 text-2xl font-extrabold text-brand-700">
                      {orderNumberLabel(order.number)}
                    </p>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium">
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>

                <div className="mt-4 rounded-xl bg-muted/50 p-3">
                  <p className="font-semibold">{name}</p>
                  {phone && <p className="text-sm text-muted-foreground">{phone}</p>}
                  {order.recipientAddress && (
                    <p className="mt-1 text-xs text-muted-foreground">{order.recipientAddress}</p>
                  )}
                </div>

                <ul className="mt-3 space-y-1 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span className="min-w-0">
                        {item.quantity}× {item.productName}
                        {item.options.length > 0 && (
                          <span className="block text-xs text-brand-700">
                            {item.options.map((o) => `${o.quantity}× ${o.optionName}`).join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0">{formatCurrency(item.subtotal)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span>{formatCurrency(order.subtotal)}</span>
                  </div>
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Taxa de entrega</span>
                      <span>{formatCurrency(order.deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(order.total)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{PAYMENT_LABELS[order.paymentMethod]}</span>
                    <span>{paid ? "Pago" : "A pagar"}</span>
                  </div>
                </div>

                <Link
                  href={`/recibo/${order.id}`}
                  target="_blank"
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  <Printer className="h-4 w-4" /> Imprimir recibo
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
