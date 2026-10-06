"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageOpen, ChevronRight, RotateCcw, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useCart } from "@/stores/cart";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PAYMENT_LABELS, STATUS_TONE, STATUS_LABELS, orderNumberLabel } from "@/lib/order-ui";
import { getOrderForReorderAction } from "@/app/actions/orders";

type OrderItem = {
  quantity: number;
  productId: string | null;
  productName: string;
  unitPrice: number;
};

type MyOrder = {
  id: string;
  number: number;
  createdAt: string;
  total: number;
  status: keyof typeof STATUS_LABELS;
  paymentStatus: string;
  paymentMethod: keyof typeof PAYMENT_LABELS;
  items: OrderItem[];
};

export function MyOrders({ orders }: { orders: MyOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="container-store py-8">
        <h1 className="mb-5 text-xl font-bold sm:text-2xl">Meus pedidos</h1>
        <EmptyState
          icon={<PackageOpen className="h-8 w-8" />}
          title="Você ainda não possui pedidos."
          description="Quando fizer seu primeiro pedido, ele aparecerá aqui."
          action={
            <Link href="/">
              <Button>Fazer um pedido</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-store py-8">
      <h1 className="mb-5 text-xl font-bold sm:text-2xl">Meus pedidos</h1>
      <div className="space-y-3">
        {orders.map((o) => (
          <OrderRow key={o.id} order={o} />
        ))}
      </div>
    </div>
  );
}

function OrderRow({ order: o }: { order: MyOrder }) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();
  const { addItem, clear } = useCart();

  const handleReorder = () => {
    startTransition(async () => {
      const res = await getOrderForReorderAction(o.id);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      if (res.items.length === 0) {
        show("error", "Nenhum item deste pedido está mais disponível.");
        return;
      }
      // Substitui o carrinho atual com os itens deste pedido
      clear();
      for (const item of res.items) {
        addItem({
          productId: item.productId,
          name: item.productName,
          unitPrice: item.unitPrice,
          imageUrl: item.imageUrl,
          quantity: item.quantity,
        });
      }
      const skipped = o.items.length - res.items.length;
      const msg =
        skipped > 0
          ? `Pedido #${o.number} reaberto (${skipped} item(ns) indisponíveis foram ignorados).`
          : `Pedido #${o.number} reaberto no carrinho.`;
      show("success", msg);
      router.push("/checkout");
    });
  };

  return (
    <Card className="flex items-center gap-4 p-4 transition-colors hover:border-brand-400">
      <Link href={`/pedido/${o.id}`} className="flex flex-1 items-center gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">
              Pedido {orderNumberLabel(o.number)}
            </span>
            <Badge tone={STATUS_TONE[o.status]}>
              {STATUS_LABELS[o.status]}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateTime(o.createdAt)} · {o.items.reduce((s, i) => s + i.quantity, 0)}{" "}
            item(ns) · {PAYMENT_LABELS[o.paymentMethod]}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-base font-bold text-brand-700">
            {formatCurrency(o.total)}
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </Link>
      <Button
        size="sm"
        variant="outline"
        onClick={handleReorder}
        disabled={isPending}
        className="shrink-0"
        title="Adicionar itens ao carrinho"
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
        <span className="hidden sm:inline">Pedir de novo</span>
      </Button>
    </Card>
  );
}