"use client";

import { useEffect, useMemo, useRef, useState, useTransition, useCallback } from "react";
import { CheckCircle2,
  Play,
  PackageCheck,
  XCircle,
  Banknote,
  HandPlatter,
  Receipt,
  ChevronDown,
  Info,
  RefreshCw,
  Loader2,
  Tag,
  Percent,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatTime } from "@/lib/format";
import { STATUS_TONE } from "@/lib/order-ui";
import { changeOrderStatusAction, applyDiscountAction, removeDiscountAction } from "@/app/actions/orders";
import { confirmPaymentAction } from "@/app/actions/cash";
import { useRouter } from "next/navigation";
import {
  OrderStatus,
  PaymentMethod,
  type Order,
  type OrderItem,
  type Payment,
} from "@prisma/client";

const COLUMNS: { status: OrderStatus; label: string; tone: string }[] = [
  { status: "NEW", label: "Novos", tone: "border-t-info" },
  { status: "CONFIRMED", label: "Confirmados", tone: "border-t-brand-500" },
  { status: "PREPARING", label: "Em preparação", tone: "border-t-warning" },
  { status: "READY", label: "Prontos", tone: "border-t-success" },
  { status: "PICKED_UP", label: "Retirados", tone: "border-t-primary" },
  { status: "FINISHED", label: "Finalizados", tone: "border-t-muted-foreground" },
];

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  CASH: "Dinheiro",
  CARD: "Cartão",
  PIX: "PIX",
};

// Próximo status e label do botão inline (sem abrir modal)
type AdvanceVariant = "default" | "success" | "secondary" | "outline";
const NEXT_STATUS: Partial<Record<OrderStatus, { to: OrderStatus; label: string; icon: React.ReactNode; variant?: AdvanceVariant }>> = {
  NEW:       { to: "CONFIRMED", label: "Confirmar",          icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  CONFIRMED: { to: "PREPARING", label: "Preparar",           icon: <Play className="h-3.5 w-3.5" />, variant: "default" },
  PREPARING: { to: "READY",     label: "Pronto",             icon: <PackageCheck className="h-3.5 w-3.5" />, variant: "success" },
  READY:     { to: "PICKED_UP", label: "Retirado",           icon: <HandPlatter className="h-3.5 w-3.5" />, variant: "secondary" },
  PICKED_UP: { to: "FINISHED",  label: "Finalizar",          icon: <CheckCircle2 className="h-3.5 w-3.5" />, variant: "outline" },
};

type AdminOrder = Order & {
  customer: { name: string; phone: string | null };
  items: OrderItem[];
  payment: Payment | null;
  discountReason: string | null;
};

function orderLabel(n: number) {
  return `#${String(n).padStart(4, "0")}`;
}

export function OrdersBoard({
  orders: initial,
  statuses,
}: {
  orders: AdminOrder[];
  statuses: OrderStatus[];
}) {
  const router = useRouter();
  const { show } = useToast();
  const [orders, setOrders] = useState(initial);
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [discountOrder, setDiscountOrder] = useState<AdminOrder | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prevNewIds = useRef<string[]>([]);

  useEffect(() => {
    audioRef.current = new Audio(
      "data:audio/wav;base64,UklGRhQCAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQCAAD//////////wAAAP8AAAD/AAAAAAAAAAAAAP8AAAAAAAAAAAAAAAAAAAD/AAD/AAAAAAAAAP8AAAAAAAAA"
    );
  }, []);

  // Detecta qualquer novo pedido (delta real, não apenas transição 0→N)
  // para garantir que o som toque mesmo quando já há outros pendentes.
  useEffect(() => {
    const currentNew = orders
      .filter((o) => o.status === "NEW")
      .map((o) => o.id)
      .sort();
    const prev = prevNewIds.current;
    const newOnes = currentNew.filter((id) => !prev.includes(id));
    if (newOnes.length > 0 && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
    prevNewIds.current = currentNew;
  }, [orders]);

  // Função de refresh reutilizável (polling + manual)
  const refresh = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsRefreshing(true);
    try {
      const res = await fetch("/api/admin/orders/recent", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders);
      }
    } finally {
      if (showSpinner) setIsRefreshing(false);
    }
  }, []);

  // Polling mais agressivo: 3s (era 8s) — ganho de reatividade de ~2.6x
  useEffect(() => {
    const timer = setInterval(() => refresh(false), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const changeStatus = useMemo(
    () => (order: AdminOrder, to: OrderStatus) => {
      startTransition(async () => {
        const res = await changeOrderStatusAction(order.id, to);
        if (res.ok) {
          show("success", `Pedido ${orderLabel(order.number)} atualizado`);
          router.refresh();
          const next = orders.map((o) => (o.id === order.id ? { ...o, status: to } : o));
          setOrders(next);
          setSelected((sel) => (sel && sel.id === order.id ? { ...sel, status: to } : sel));
        } else {
          show("error", res.error);
        }
      });
    },
    [orders, show, router]
  );

  const confirmPayment = useMemo(
    () => (order: AdminOrder) => {
      startTransition(async () => {
        const res = await confirmPaymentAction(order.id);
        if (res.ok) {
          show("success", `Pagamento do pedido ${orderLabel(order.number)} confirmado`);
          router.refresh();
          await refresh(true);
        } else {
          show("error", res.error);
        }
      });
    },
    [show, router, refresh]
  );

  const applyDiscount = useMemo(
    () => (order: AdminOrder, amount: number, reason: string) => {
      startTransition(async () => {
        const res = await applyDiscountAction(order.id, amount, reason);
        if (res.ok) {
          show(
            "success",
            `Desconto de R$ ${res.discount.toFixed(2)} aplicado ao pedido ${orderLabel(order.number)}.`
          );
          setDiscountOrder(null);
          await refresh(true);
          router.refresh();
        } else {
          show("error", res.error);
        }
      });
    },
    [show, router, refresh]
  );

  const removeDiscount = useMemo(
    () => (order: AdminOrder) => {
      startTransition(async () => {
        const res = await removeDiscountAction(order.id);
        if (res.ok) {
          show("success", "Desconto removido.");
          setDiscountOrder(null);
          await refresh(true);
          router.refresh();
        } else {
          show("error", res.error);
        }
      });
    },
    [show, router, refresh]
  );

  const activeColumns = COLUMNS.filter((c) => statuses.includes(c.status));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Atualização automática a cada 3s. Clique em um pedido para ver detalhes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refresh(true)}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Atualizar
          </Button>
          <Badge tone="info">{orders.filter((o) => o.status === "NEW").length} novo(s)</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {activeColumns.map((col) => {
          const items = orders.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className={`rounded-2xl border border-t-4 ${col.tone} bg-card`}>
              <div className="flex items-center justify-between px-4 py-3">
                <h2 className="text-sm font-bold">{col.label}</h2>
                <Badge>{items.length}</Badge>
              </div>
              <div className="max-h-[70vh] space-y-2.5 overflow-y-auto px-3 pb-3">
                {items.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    Sem pedidos
                  </p>
                )}
                {items.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onOpen={() => setSelected(o)}
                    onAdvance={() => {
                      const next = NEXT_STATUS[o.status];
                      if (next) changeStatus(o, next.to);
                    }}
                    onConfirmPayment={() => confirmPayment(o)}
                    onDiscount={() => setDiscountOrder(o)}
                    isPending={isPending}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <OrderDetail
          order={selected}
          onClose={() => setSelected(null)}
          onChangeStatus={(to) => changeStatus(selected, to)}
          onConfirmPayment={() => confirmPayment(selected)}
          isPending={isPending}
          orders={orders}
          setSelected={setSelected}
        />
      )}

      {discountOrder && (
        <DiscountModal
          order={discountOrder}
          onClose={() => setDiscountOrder(null)}
          onApply={(amount, reason) => applyDiscount(discountOrder, amount, reason)}
          onRemove={() => removeDiscount(discountOrder)}
          isPending={isPending}
        />
      )}
    </div>
  );
}

function OrderCard({
  order,
  onOpen,
  onAdvance,
  onConfirmPayment,
  onDiscount,
  isPending,
}: {
  order: AdminOrder;
  onOpen: () => void;
  onAdvance: () => void;
  onConfirmPayment: () => void;
  onDiscount: () => void;
  isPending: boolean;
}) {
  const advance = NEXT_STATUS[order.status];
  const paymentPending = (order.payment?.status ?? "PENDING") === "PENDING";
  const hasDiscount = order.discount > 0;

  return (
    <div className="rounded-xl border border-border bg-background p-3 transition-colors hover:border-brand-400">
      <button
        onClick={onOpen}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold text-brand-700">{orderLabel(order.number)}</span>
          <span className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</span>
        </div>
        <p className="mt-1 truncate text-sm font-medium">{order.customer.name}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {order.items.map((i) => `${i.quantity}×${i.productName}`).join(", ")}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-bold">{formatCurrency(order.total)}</span>
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {hasDiscount && (
              <Badge tone="success" title={order.discountReason ?? "Desconto"}>
                <Percent className="h-2.5 w-2.5" />
                {formatCurrency(order.discount)}
              </Badge>
            )}
            <Badge tone={STATUS_TONE[order.status]}>
              {order.payment ? PAYMENT_LABEL[order.payment.method] : ""}
            </Badge>
          </span>
        </div>
      </button>
      {(advance || paymentPending || !hasDiscount) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {advance && (
            <Button
              size="sm"
              variant={advance.variant ?? "default"}
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onAdvance();
              }}
              className="h-8 px-2.5 text-xs"
            >
              {advance.icon}
              {advance.label}
            </Button>
          )}
          {paymentPending && (
            <Button
              size="sm"
              variant="success"
              disabled={isPending}
              onClick={(e) => {
                e.stopPropagation();
                onConfirmPayment();
              }}
              className="h-8 px-2.5 text-xs"
            >
              <Banknote className="h-3.5 w-3.5" />
              Pago
            </Button>
          )}
          <Button
            size="sm"
            variant={hasDiscount ? "outline" : "ghost"}
            disabled={isPending}
            onClick={(e) => {
              e.stopPropagation();
              onDiscount();
            }}
            className="h-8 px-2.5 text-xs"
            title={hasDiscount ? "Editar desconto" : "Aplicar desconto"}
          >
            <Tag className="h-3.5 w-3.5" />
            {hasDiscount ? "Desconto" : "Desconto"}
          </Button>
        </div>
      )}
    </div>
  );
}

function DiscountModal({
  order,
  onClose,
  onApply,
  onRemove,
  isPending,
}: {
  order: AdminOrder;
  onClose: () => void;
  onApply: (amount: number, reason: string) => void;
  onRemove: () => void;
  isPending: boolean;
}) {
  const maxDiscount = Math.max(0, order.subtotal + order.deliveryFee);
  const [amount, setAmount] = useState<string>(
    order.discount > 0 ? order.discount.toFixed(2).replace(".", ",") : ""
  );
  const [reason, setReason] = useState<string>(order.discountReason ?? "");
  const [touched, setTouched] = useState(false);

  // Sugestões rápidas
  const presets = [
    { label: "5%", value: maxDiscount * 0.05 },
    { label: "10%", value: maxDiscount * 0.10 },
    { label: "15%", value: maxDiscount * 0.15 },
  ];

  const amountNum = parseFloat(amount.replace(",", "."));
  const valid =
    Number.isFinite(amountNum) && amountNum > 0 && amountNum <= maxDiscount;
  const isOver = Number.isFinite(amountNum) && amountNum > maxDiscount;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Tag className="h-4 w-4 text-success" />
            Desconto não fiscal
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-xl bg-muted p-3">
            <p className="text-xs text-muted-foreground">Pedido</p>
            <p className="text-sm font-bold">
              {orderLabel(order.number)} · {order.customer.name}
            </p>
            <div className="mt-2 space-y-0.5 text-xs">
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
              {order.discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Desconto atual</span>
                  <span>−{formatCurrency(order.discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5 font-bold">
                <span>Total atual</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Valor do desconto (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="0,00"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAmount(p.value.toFixed(2).replace(".", ","))}
                  className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmount(maxDiscount.toFixed(2).replace(".", ","))}
                className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
              >
                100%
              </button>
            </div>
            {touched && isOver && (
              <p className="mt-1 text-xs text-danger">
                O desconto máximo permitido é R$ {maxDiscount.toFixed(2)}.
              </p>
            )}
            {!touched && (
              <p className="mt-1 text-xs text-muted-foreground">
                Desconto máximo: R$ {maxDiscount.toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Motivo do desconto <span className="text-danger">*</span>
            </label>
            <select
              value={["Cortesia", "Promoção", "Avaria no preparo", "Erro do sistema", "Atendimento recorrente", "Outro"].includes(reason) ? reason : "Outro"}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="Cortesia">Cortesia</option>
              <option value="Promoção">Promoção</option>
              <option value="Avaria no preparo">Avaria no preparo</option>
              <option value="Atendimento recorrente">Cliente recorrente</option>
              <option value="Erro do sistema">Erro do sistema</option>
              <option value="Outro">Outro</option>
            </select>
            {![
              "Cortesia",
              "Promoção",
              "Avaria no preparo",
              "Atendimento recorrente",
              "Erro do sistema",
            ].includes(reason) && (
              <input
                type="text"
                value={reason === "Outro" ? "" : reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo..."
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            )}
          </div>

          <div className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
            <strong>Não fiscal.</strong> Este desconto é registrado no pedido e
            audit log, mas não aparece em nota fiscal.
          </div>

          <div className="flex flex-wrap gap-2">
            {order.discount > 0 && (
              <Button
                variant="outline"
                onClick={onRemove}
                disabled={isPending}
                className="flex-1"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Remover desconto
              </Button>
            )}
            <Button
              variant="success"
              onClick={() => onApply(amountNum, reason.trim() || "Cortesia")}
              disabled={isPending || !valid || !reason.trim()}
              className="flex-1"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {order.discount > 0 ? "Atualizar" : "Aplicar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderDetail({
  order,
  onClose,
  onChangeStatus,
  onConfirmPayment,
  isPending,
  orders,
  setSelected,
}: {
  order: AdminOrder;
  onClose: () => void;
  onChangeStatus: (to: OrderStatus) => void;
  onConfirmPayment: () => void;
  isPending: boolean;
  orders: AdminOrder[];
  setSelected: (o: AdminOrder | null) => void;
}) {
  const canConfirm =
    order.status === "READY" || order.status === "PICKED_UP" || order.status === "FINISHED" ||
    (order.payment?.status ?? "PENDING") === "PENDING";
  const paymentConfirmed = order.payment?.status === "CONFIRMED";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <h2 className="text-base font-bold">
            Pedido {orderLabel(order.number)}
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
          >
            <ChevronDown className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Info className="h-4 w-4" /> Realizado em {formatTime(order.createdAt)}
            </p>
            <div className="mt-2 rounded-xl bg-muted p-3">
              <p className="text-sm font-semibold">{order.customer.name}</p>
              <p className="text-sm text-muted-foreground">{order.customer.phone ?? "-"}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Itens
              </span>
            </div>
            {order.items.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-1 text-sm">
                <span className="flex-1">{i.quantity}× {i.productName}</span>
                <span className="text-muted-foreground">{formatCurrency(i.unitPrice)}</span>
                <span className="w-20 text-right font-medium">{formatCurrency(i.subtotal)}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-extrabold text-brand-700">{formatCurrency(order.total)}</span>
            </div>
          </div>

          {order.observation && (
            <div className="rounded-xl border border-border p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Observação
              </p>
              <p className="text-sm">{order.observation}</p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl bg-muted p-3">
            <div>
              <p className="text-xs text-muted-foreground">Pagamento</p>
              <p className="text-sm font-semibold">{PAYMENT_LABEL[order.payment?.method ?? "PIX"]}</p>
            </div>
            <Badge tone={paymentConfirmed ? "success" : "warning"}>
              {paymentConfirmed ? "Confirmado" : "Pendente"}
            </Badge>
          </div>

          {canConfirm && !paymentConfirmed && (
            <Button
              onClick={onConfirmPayment}
              disabled={isPending}
              className="w-full"
              variant="success"
            >
              <Banknote className="h-4 w-4" />
              Confirmar recebimento do pagamento
            </Button>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ações de status
            </p>
            <div className="flex flex-wrap gap-2">
              {order.status === "NEW" && (
                <Button size="sm" disabled={isPending} onClick={() => onChangeStatus("CONFIRMED")}>
                  <CheckCircle2 className="h-4 w-4" /> Confirmar
                </Button>
              )}
              {order.status === "CONFIRMED" && (
                <Button size="sm" disabled={isPending} onClick={() => onChangeStatus("PREPARING")}>
                  <Play className="h-4 w-4" /> Iniciar preparação
                </Button>
              )}
              {order.status === "PREPARING" && (
                <Button size="sm" variant="success" disabled={isPending} onClick={() => onChangeStatus("READY")}>
                  <PackageCheck className="h-4 w-4" /> Marcar como pronto
                </Button>
              )}
              {order.status === "READY" && (
                <Button size="sm" variant="secondary" disabled={isPending} onClick={() => onChangeStatus("PICKED_UP")}>
                  <HandPlatter className="h-4 w-4" /> Marcar como retirado
                </Button>
              )}
              {order.status === "PICKED_UP" && (
                <Button size="sm" variant="outline" disabled={isPending} onClick={() => onChangeStatus("FINISHED")}>
                  <CheckCircle2 className="h-4 w-4" /> Finalizar
                </Button>
              )}
              {(order.status === "NEW" || order.status === "CONFIRMED" || order.status === "PREPARING") && (
                <Button size="sm" variant="danger" disabled={isPending} onClick={() => onChangeStatus("CANCELLED")}>
                  <XCircle className="h-4 w-4" /> Cancelar
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelected(o)}
                  className={`rounded-lg border px-2 py-1 text-xs ${
                    o.id === order.id ? "border-brand-600 bg-brand-50" : "border-border"
                  }`}
                >
                  {orderLabel(o.number)}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => window.open(`/recibo/${order.id}`, "_blank")}
            >
              <Receipt className="h-4 w-4" /> Ver recibo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}