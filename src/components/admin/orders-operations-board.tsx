"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCheck,
  Clock3,
  MessageCircle,
  Printer,
  RefreshCw,
  RotateCcw,
  Truck,
  PackageCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  confirmOrderReceiptAdminAction,
  markOrderDeliveredAdminAction,
  registerReceiptPrintAction,
} from "@/app/actions/orders";
import { cn, formatCurrency, formatTime } from "@/lib/format";
import { STATUS_LABELS, STATUS_TONE, orderNumberLabel } from "@/lib/order-ui";
import { buildOrderCallMessage, buildWhatsAppLink } from "@/lib/whatsapp-link";
import type { OrderStatus } from "@prisma/client";

type QueueOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  total: number;
  paymentMethod: "CASH" | "CARD" | "PIX";
  paymentStatus: "PENDING" | "CONFIRMED" | "CANCELLED";
  deliveryMode: "PICKUP" | "DELIVERY";
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  createdAt: string;
  customer: { name: string; phone: string | null };
  items: { id: string; productName: string; quantity: number }[];
  payment: { status: "PENDING" | "CONFIRMED" | "CANCELLED" } | null;
  history: { createdAt: string; toStatus: OrderStatus }[];
  delivery: {
    status: string;
    motoboy: { name: string; phone: string | null } | null;
  } | null;
};

const DONE: OrderStatus[] = ["DELIVERED", "FINISHED"];
const WAIT_LABELS: Partial<Record<OrderStatus, string>> = {
  NEW: "Aguardando há",
  CONFIRMED: "Recebido há",
  PREPARING: "Em preparo há",
  READY: "Pronto há",
  OUT_FOR_DELIVERY: "A caminho há",
};

function isDone(order: QueueOrder) {
  return DONE.includes(order.status);
}

function startedAt(order: QueueOrder) {
  return order.history[0]?.createdAt ?? order.createdAt;
}

function formatElapsed(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}h ${pad(minutes)}m ${pad(secs)}s` : `${minutes}m ${pad(secs)}s`;
}

function ElapsedTimer({
  order,
  limitMinutes,
}: {
  order: QueueOrder;
  limitMinutes: number;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isDone(order) || now === null) {
    return <span className="text-[11px] font-bold text-success">Entregue</span>;
  }

  const seconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt(order)).getTime()) / 1000)
  );
  const late = seconds > limitMinutes * 60;
  const critical = seconds > limitMinutes * 90;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-bold",
        critical ? "text-danger" : late ? "text-warning" : "text-muted-foreground"
      )}
    >
      {critical ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : (
        <Clock3 className="h-3.5 w-3.5" />
      )}
      {WAIT_LABELS[order.status] ?? "Espera"} {formatElapsed(seconds)}
    </span>
  );
}

export function OrdersOperationsBoard({
  orders: initialOrders,
  storeName,
  prepTimeMinutes,
  canConfirm,
  canDeliver,
}: {
  orders: QueueOrder[];
  storeName: string;
  prepTimeMinutes: number;
  canConfirm: boolean;
  canDeliver: boolean;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [orders, setOrders] = useState<QueueOrder[]>(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/orders/operations", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { orders?: QueueOrder[] };
      if (data.orders) setOrders(data.orders);
    } catch {
      // Polling é best-effort: mantém o último estado conhecido.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const active = orders.filter((order) => !isDone(order));
  const done = orders.filter(isDone);

  function runAction(
    order: QueueOrder,
    action: () => Promise<{ ok: boolean; error?: string; number?: number }>,
    success: (number: number) => string
  ) {
    setBusyId(order.id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if (!result.ok) {
        show("error", result.error ?? "Não foi possível concluir a ação.");
        return;
      }
      show("success", success(result.number ?? order.number));
      await refresh();
    });
  }

  function handleConfirm(order: QueueOrder) {
    runAction(
      order,
      () => confirmOrderReceiptAdminAction(order.id),
      (number) => `Pedido ${orderNumberLabel(number)} recebido. Cliente avisado!`
    );
  }

  function handleDeliver(order: QueueOrder) {
    runAction(
      order,
      () => markOrderDeliveredAdminAction(order.id),
      (number) => `Pedido ${orderNumberLabel(number)} marcado como entregue.`
    );
  }

  function handlePrint(order: QueueOrder, reprint: boolean) {
    const url = `/recibo/${order.id}?autoPrint=1${reprint ? "&reprint=1" : ""}`;
    const printWindow = window.open(url, "_blank", "noopener,noreferrer");
    runAction(
      order,
      () => registerReceiptPrintAction(order.id, reprint),
      () => (reprint ? "Comprovante reimpresso." : "Comprovante enviado para impressão.")
    );
    if (!printWindow) show("error", "Permita popups para imprimir o comprovante.");
  }

  function whatsappLink(order: QueueOrder) {
    return buildWhatsAppLink(
      order.recipientPhone || order.customer.phone,
      buildOrderCallMessage({
        orderNumber: order.number,
        customerName: order.recipientName || order.customer.name,
        deliveryMode: "DELIVERY",
        storeName,
        status: order.status,
      })
    );
  }

  function card(order: QueueOrder) {
    const link = whatsappLink(order);
    const busy = busyId === order.id;
    const awaiting = order.status === "NEW" || order.status === "CONFIRMED";

    return (
      <article
        key={order.id}
        className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lg font-extrabold">{orderNumberLabel(order.number)}</p>
              <Badge tone={STATUS_TONE[order.status]} className="text-[10px]">
                {order.status !== "NEW" && WAIT_LABELS[order.status]
                  ? "Recebido"
                  : STATUS_LABELS[order.status]}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {formatTime(order.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-sm font-bold">
              {order.recipientName || order.customer.name}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {order.recipientPhone || order.customer.phone || "Sem telefone"}
            </p>
          </div>
          <div className="text-right">
            <ElapsedTimer order={order} limitMinutes={prepTimeMinutes} />
            <p className="mt-1 text-[11px] font-semibold text-brand-700">
              {formatCurrency(order.total)}
            </p>
          </div>
        </div>

        <p className="mt-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs">
          {order.recipientAddress ?? "Sem endereço informado"}
        </p>
        <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground">
          {order.items.map((item) => `${item.quantity}x ${item.productName}`).join(" · ")}
        </p>
        {order.delivery?.motoboy && (
          <p className="mt-1 text-[11px] font-semibold text-info">
            Entregador: {order.delivery.motoboy.name}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {awaiting ? (
            <Button
              size="sm"
              disabled={!canConfirm || busy}
              onClick={() => handleConfirm(order)}
            >
              <PackageCheck className="h-4 w-4" />
              Recebi o pedido
            </Button>
          ) : (
            <Button
              size="sm"
              variant="success"
              disabled={!canDeliver || busy}
              onClick={() => handleDeliver(order)}
            >
              <CheckCheck className="h-4 w-4" />
              Marcar entregue
            </Button>
          )}
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title="Imprimir comprovante"
            aria-label="Imprimir comprovante"
            disabled={busy}
            onClick={() => handlePrint(order, false)}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            title="Reimprimir comprovante"
            aria-label="Reimprimir comprovante"
            disabled={busy}
            onClick={() => handlePrint(order, true)}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              title="Chamar cliente no WhatsApp"
              aria-label="Chamar cliente no WhatsApp"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-success/20 bg-success/10 text-success hover:bg-success/20"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          ) : (
            <span
              title="Sem telefone"
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground/40"
            >
              <MessageCircle className="h-4 w-4" />
            </span>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="container-app max-w-4xl py-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Fila de entregas</h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Pedidos com entrega de hoje, em ordem de chegada.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>
          <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      {active.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card px-4 py-16 text-center">
          <Truck className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold">Nenhuma entrega pendente</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Novos pedidos com entrega aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {active.map(card)}
        </div>
      )}

      {done.length > 0 && (
        <details className="mt-6 rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-bold text-muted-foreground">
            Entregues hoje ({done.length})
          </summary>
          <div className="mt-3 divide-y divide-border">
            {done.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
              >
                <span className="font-bold">{orderNumberLabel(order.number)}</span>
                <span className="text-muted-foreground">
                  {order.recipientName || order.customer.name} · {formatTime(order.createdAt)}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Reimprimir comprovante"
                    aria-label="Reimprimir comprovante"
                    disabled={busyId === order.id}
                    onClick={() => handlePrint(order, true)}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
