"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Banknote,
  Hourglass,
  ChefHat,
  PackageCheck,
  Users,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loading } from "@/components/ui/empty";
import { formatCurrency, formatTime } from "@/lib/format";
import { PAYMENT_LABELS, STATUS_LABELS, STATUS_TONE, orderNumberLabel } from "@/lib/order-ui";
import type { DashboardStats } from "@/lib/dashboard-stats";

type RecentOrder = {
  id: string;
  number: number;
  status: keyof typeof STATUS_LABELS;
  total: number;
  paymentMethod: keyof typeof PAYMENT_LABELS;
  createdAt: string;
  customerName: string;
};

export function DashboardView() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch("/api/admin/dashboard/stats", { cache: "no-store" });
      if (res.ok && active) {
        const data = await res.json();
        setStats(data);
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!stats) return <Loading />;

  const cards = [
    { label: "Pedidos hoje", value: String(stats.ordersToday), icon: <ShoppingBag className="h-5 w-5" />, tone: "bg-brand-600" },
    { label: "Vendas hoje (confirmadas)", value: formatCurrency(stats.salesToday), icon: <Banknote className="h-5 w-5" />, tone: "bg-success" },
    { label: "Pedidos pendentes", value: String(stats.pending), icon: <Hourglass className="h-5 w-5" />, tone: "bg-warning" },
    { label: "Em preparação", value: String(stats.preparing), icon: <ChefHat className="h-5 w-5" />, tone: "bg-info" },
    { label: "Prontos para retirada", value: String(stats.ready), icon: <PackageCheck className="h-5 w-5" />, tone: "bg-danger" },
    { label: "Total de clientes", value: String(stats.customers), icon: <Users className="h-5 w-5" />, tone: "bg-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Atualização automática a cada 15s.
          </p>
        </div>
        <Link
          href="/admin/pedidos"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <ShoppingBag className="h-4 w-4" />
          Gerenciar pedidos
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 p-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {c.label}
              </CardTitle>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${c.tone}`}>
                {c.icon}
              </span>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-lg font-extrabold leading-none">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Pedidos recentes</CardTitle>
            <Link href="/admin/pedidos" className="text-xs text-brand-600 hover:underline">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum pedido ainda.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(stats.recentOrders as RecentOrder[]).map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/admin/pedidos?order=${o.id}`}
                      className="flex items-center gap-3 py-2.5 hover:bg-muted/50"
                    >
                      <span className="text-sm font-bold text-brand-700">
                        {orderNumberLabel(o.number)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {o.customerName}
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {PAYMENT_LABELS[o.paymentMethod]}
                      </span>
                      <Badge tone={STATUS_TONE[o.status]}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                      <span className="text-sm font-semibold">
                        {formatCurrency(o.total)}
                      </span>
                      <span className="hidden text-xs text-muted-foreground md:block">
                        {formatTime(o.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Mais vendidos (7 dias)</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats.topProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sem vendas nos últimos 7 dias.
              </p>
            ) : (
              <ul className="space-y-3">
                {stats.topProducts.map((p, idx) => (
                  <li key={p.name} className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-800">
                      {idx + 1}
                    </span>
                    <span className="flex-1 truncate text-sm">{p.name}</span>
                    <Badge>{p.quantity} un.</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}