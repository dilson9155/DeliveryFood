"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCheck,
  Clock3,
  MessageCircle,
  Printer,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { Receipt } from "@/components/store/receipt";
import {
  markOrderDeliveredAdminAction,
  registerReceiptPrintAction,
} from "@/app/actions/orders";
import { cn, formatTime } from "@/lib/format";
import {
  PAYMENT_LABELS,
  STATUS_LABELS,
  STATUS_TONE,
  orderNumberLabel,
} from "@/lib/order-ui";
import { buildOrderCallMessage, buildWhatsAppLink } from "@/lib/whatsapp-link";
import type { OrderStatus } from "@prisma/client";

type OperationOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  discountReason: string | null;
  paymentMethod: "CASH" | "CARD" | "PIX";
  paymentStatus: "PENDING" | "CONFIRMED" | "CANCELLED";
  deliveryMode: "PICKUP" | "DELIVERY";
  recipientName: string | null;
  recipientPhone: string | null;
  recipientAddress: string | null;
  observation: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { name: string; phone: string | null };
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    options?: {
      groupName: string;
      optionName: string;
      quantity: number;
      unitPrice: number;
    }[];
  }[];
  payment: {
    id: string;
    method: "CASH" | "CARD" | "PIX";
    status: "PENDING" | "CONFIRMED" | "CANCELLED";
    confirmedAt: string | null;
  } | null;
  history: { createdAt: string; toStatus: OrderStatus }[];
  delivery: {
    id: string;
    status: string;
    motoboy: { name: string; phone: string | null } | null;
  } | null;
};

type ReceiptSettings = {
  storeName: string;
  logoUrl: string | null;
  cnpj: string | null;
  phone: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  receiptMessage: string | null;
  receiptFooter: string | null;
  printTemplateId: string | null;
};

type Filter = "active" | "pickup" | "delivery" | "late" | "done";

const DONE_STATUSES: OrderStatus[] = ["DELIVERED", "FINISHED"];

function isDone(order: OperationOrder): boolean {
  return DONE_STATUSES.includes(order.status);
}

function readySince(order: OperationOrder): string | null {
  return order.history[0]?.createdAt ?? null;
}

function waitingStart(order: OperationOrder): string {
  return readySince(order) ?? order.createdAt;
}

function elapsedSeconds(order: OperationOrder): number {
  const start = new Date(waitingStart(order)).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

function isLate(order: OperationOrder, limitMinutes: number): boolean {
  return elapsedSeconds(order) > limitMinutes * 60;
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}h ${pad(minutes)}m ${pad(secs)}s`
    : `${minutes}m ${pad(secs)}s`;
}

function ElapsedTimer({
  order,
  limitMinutes,
}: {
  order: OperationOrder;
  limitMinutes: number;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isDone(order)) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-success">
        <CheckCheck className="h-3.5 w-3.5" />
        Concluído
      </span>
    );
  }
  if (now === null) {
    return <span className="text-[11px] font-bold text-muted-foreground">--:--</span>;
  }

  const start = new Date(waitingStart(order)).getTime();
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  const overLimit = seconds > limitMinutes * 60;
  const critical = seconds > limitMinutes * 90;
  const tone = critical
    ? "text-danger"
    : overLimit
      ? "text-warning"
      : "text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-bold", tone)}>
      {critical ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : (
        <Clock3 className="h-3.5 w-3.5" />
      )}
      {readySince(order) ? "Pronto há" : "Espera"} {formatElapsed(seconds)}
    </span>
  );
}

export function OrdersOperationsBoard({
  orders: initialOrders,
  settings,
  storeName,
  prepTimeMinutes,
  canDeliver,
}: {
  orders: OperationOrder[];
  settings: ReceiptSettings;
  storeName: string;
  prepTimeMinutes: number;
  canDeliver: boolean;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [orders, setOrders] = useState<OperationOrder[]>(initialOrders);
  const [filter, setFilter] = useState<Filter>("active");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    () =>
      initialOrders.find((order) => !isDone(order))?.id ??
      initialOrders[0]?.id ??
      null
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/orders/operations", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { orders?: OperationOrder[] };
      if (data.orders) setOrders(data.orders);
    } catch {
      // Polling é best-effort: mantém o último estado conhecido.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (selectedId && orders.some((order) => order.id === selectedId)) return;
    setSelectedId(
      orders.find((order) => !isDone(order))?.id ?? orders[0]?.id ?? null
    );
  }, [orders, selectedId]);

  const activeOrders = useMemo(
    () => orders.filter((order) => !isDone(order)),
    [orders]
  );
  const lateCount = useMemo(
    () => activeOrders.filter((order) => isLate(order, prepTimeMinutes)).length,
    [activeOrders, prepTimeMinutes]
  );
  const readyCount = useMemo(
    () =>
      activeOrders.filter((order) =>
        ["READY", "OUT_FOR_DELIVERY"].includes(order.status)
      ).length,
    [activeOrders]
  );

  const visibleOrders = useMemo(() => {
    let list = orders;
    if (filter === "active") list = activeOrders;
    if (filter === "pickup")
      list = activeOrders.filter((order) => order.deliveryMode === "PICKUP");
    if (filter === "delivery")
      list = activeOrders.filter((order) => order.deliveryMode === "DELIVERY");
    if (filter === "late")
      list = activeOrders.filter((order) => isLate(order, prepTimeMinutes));
    if (filter === "done") list = orders.filter(isDone);

    return [...list].sort((a, b) => {
      if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;
      if (isDone(a) && isDone(b)) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return elapsedSeconds(b) - elapsedSeconds(a);
    });
  }, [orders, activeOrders, filter, prepTimeMinutes]);

  const selected = useMemo(
    () => orders.find((order) => order.id === selectedId) ?? null,
    [orders, selectedId]
  );

  function handleDeliver(order: OperationOrder) {
    if (!canDeliver || isDone(order)) return;
    setBusyId(order.id);
    startTransition(async () => {
      const result = await markOrderDeliveredAdminAction(order.id);
      setBusyId(null);
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show(
        "success",
        result.alreadyDone
          ? `Pedido ${orderNumberLabel(order.number)} já estava concluído.`
          : `Pedido ${orderNumberLabel(order.number)} marcado como entregue.`
      );
      await refresh();
    });
  }

  function handlePrint(order: OperationOrder, reprint: boolean) {
    setSelectedId(order.id);
    const url = `/recibo/${order.id}?autoPrint=1${reprint ? "&reprint=1" : ""}`;
    // Abre na mesma paleta do clique para evitar bloqueio de popup.
    const printWindow = window.open(url, "_blank", "noopener,noreferrer");
    setBusyId(order.id);
    startTransition(async () => {
      const result = await registerReceiptPrintAction(order.id, reprint);
      setBusyId(null);
      if (!result.ok) {
        printWindow?.close();
        show("error", result.error);
        return;
      }
      show(
        "success",
        reprint
          ? `Comprovante do pedido ${orderNumberLabel(order.number)} reimpresso.`
          : `Comprovante do pedido ${orderNumberLabel(order.number)} enviado para impressão.`
      );
    });
  }

  function filters(): { value: Filter; label: string; count: number }[] {
    return [
      { value: "active", label: "Ativos", count: activeOrders.length },
      {
        value: "pickup",
        label: "Retirada",
        count: activeOrders.filter((order) => order.deliveryMode === "PICKUP").length,
      },
      {
        value: "delivery",
        label: "Entrega",
        count: activeOrders.filter((order) => order.deliveryMode === "DELIVERY").length,
      },
      { value: "late", label: "Atrasados", count: lateCount },
      { value: "done", label: "Concluídos", count: orders.length - activeOrders.length },
    ];
  }

  return (
    <div className="container-app py-5 sm:py-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Fila de pedidos
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Imprima, acompanhe o tempo e conclua a entrega sem sair desta tela.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
            Atualizar
          </Button>
          <Link
            href="/admin/pedidos"
            className="inline-flex h-8 items-center rounded-xl border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Visão completa
          </Link>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Ativos
          </p>
          <p className="mt-1 text-2xl font-extrabold">{activeOrders.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Prontos
          </p>
          <p className="mt-1 text-2xl font-extrabold text-success">{readyCount}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Atrasados
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-extrabold",
              lateCount > 0 ? "text-warning" : "text-foreground"
            )}
          >
            {lateCount}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Tempo limite
          </p>
          <p className="mt-1 text-2xl font-extrabold">{prepTimeMinutes} min</p>
        </div>
      </div>

      <div className="no-print mt-4 flex flex-wrap gap-1.5">
        {filters().map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              filter === item.value
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            )}
          >
            {item.label}
            <span className="rounded-full bg-black/10 px-1.5 text-[10px]">
              {item.count}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.85fr)]">
        <section className="space-y-2.5">
          {visibleOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center">
              <ShoppingBag className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Nenhum pedido nesta fila</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Atualização automática a cada 5 segundos.
              </p>
            </div>
          ) : (
            visibleOrders.map((order) => {
              const customerName = order.recipientName || order.customer.name;
              const phone = order.recipientPhone || order.customer.phone;
              const callMessage = buildOrderCallMessage({
                orderNumber: order.number,
                customerName,
                deliveryMode: order.deliveryMode,
                storeName,
                status: order.status,
              });
              const whatsappLink = buildWhatsAppLink(phone, callMessage);
              const done = isDone(order);
              const busy = busyId === order.id;

              return (
                <article
                  key={order.id}
                  className={cn(
                    "rounded-2xl border bg-card p-3 shadow-sm transition-all",
                    selectedId === order.id
                      ? "border-brand-500 ring-2 ring-brand-500/15"
                      : "border-border hover:border-brand-300"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(order.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-extrabold">
                            {orderNumberLabel(order.number)}
                          </p>
                          <Badge tone={STATUS_TONE[order.status]} className="text-[9px]">
                            {STATUS_LABELS[order.status]}
                          </Badge>
                          <Badge tone="muted" className="text-[9px]">
                            {order.deliveryMode === "DELIVERY" ? (
                              <span className="inline-flex items-center gap-1">
                                <Truck className="h-3 w-3" />
                                Entrega
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                <ShoppingBag className="h-3 w-3" />
                                Retirada
                              </span>
                            )}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatTime(order.createdAt)} · {PAYMENT_LABELS[order.paymentMethod]} ·{" "}
                          {order.paymentStatus === "CONFIRMED" ? "Pago" : "A pagar"}
                        </p>
                      </div>
                      <ElapsedTimer order={order} limitMinutes={prepTimeMinutes} />
                    </div>

                    <p className="mt-2 text-sm font-bold">{customerName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {order.recipientAddress ?? "Sem endereço informado"}
                    </p>

                    <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
                      {order.items
                        .map((item) => `${item.quantity}x ${item.productName}`)
                        .join(" · ")}
                    </p>

                    {order.delivery?.motoboy && (
                      <p className="mt-1 text-[11px] font-semibold text-info">
                        Motoboy: {order.delivery.motoboy.name}
                      </p>
                    )}
                  </button>

                  <div className="no-print mt-3 grid grid-cols-4 gap-1.5 border-t border-border pt-2.5">
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
                    {whatsappLink ? (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Chamar cliente no WhatsApp"
                        aria-label="Chamar cliente no WhatsApp"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-success/20 bg-success/10 text-success transition-colors hover:bg-success/20"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    ) : (
                      <span
                        title="Telefone do cliente não informado"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground/40"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </span>
                    )}
                    <Button
                      size="icon"
                      variant={done ? "success" : "default"}
                      className="h-8 w-8"
                      title={done ? "Pedido já concluído" : "Marcar como entregue"}
                      aria-label={done ? "Pedido já concluído" : "Marcar como entregue"}
                      disabled={!canDeliver || done || busy}
                      onClick={() => handleDeliver(order)}
                    >
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  </div>
                </article>
              );
            })
          )}
        </section>

        <aside className="no-print">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:sticky xl:top-4">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <div>
                <p className="text-sm font-bold">Comprovante</p>
                <p className="text-[10px] text-muted-foreground">
                  {selected
                    ? `Prévia do pedido ${orderNumberLabel(selected.number)}`
                    : "Selecione um pedido na fila"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected || busyId === selected.id}
                  onClick={() => selected && handlePrint(selected, false)}
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected || busyId === selected.id}
                  onClick={() => selected && handlePrint(selected, true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reimprimir
                </Button>
              </div>
            </div>
            <div className="max-h-[calc(100vh-9rem)] overflow-auto bg-white">
              {selected ? (
                <Receipt order={selected} settings={settings} />
              ) : (
                <div className="px-4 py-16 text-center text-xs text-muted-foreground">
                  Selecione um pedido para ver o comprovante.
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
