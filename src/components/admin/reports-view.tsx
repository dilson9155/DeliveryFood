"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Printer,
  TrendingUp as TrendUpIcon,
  BarChart3,
  Wallet,
  ShoppingCart,
  ArrowDownToLine,
  Receipt,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/empty";
import { Input, Select, Label } from "@/components/ui/form";
import {
  formatCurrency,
  formatDateTime,
} from "@/lib/format";
import { PAYMENT_LABELS, STATUS_LABELS, STATUS_TONE, orderNumberLabel } from "@/lib/order-ui";
import type { OrderStatus, PaymentMethod } from "@prisma/client";

type Tab = "sales" | "products" | "flow" | "payables" | "receivables" | "cashbook";

type ReportData = {
  orders: Array<{
    id: string;
    number: number;
    createdAt: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    paymentStatus: string;
    total: number;
    customerName: string;
    itemCount: number;
  }>;
  totals: {
    count: number;
    confirmedCount: number;
    confirmedRevenue: number;
    cancelledCount: number;
    avgTicket: number;
  };
  topProducts: { name: string; qty: number; revenue: number }[];
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  byDay: { day: string; count: number; revenue: number }[];
};

export function ReportsView() {
  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (status) params.set("status", status);
    if (method) params.set("method", method);
    fetch(`/api/admin/reports?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "sales", label: "Vendas", icon: <ShoppingCart className="h-3.5 w-3.5" /> },
    { id: "products", label: "Produtos", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { id: "flow", label: "Fluxo", icon: <TrendUpIcon className="h-3.5 w-3.5" /> },
    { id: "payables", label: "Contas a pagar", icon: <Receipt className="h-3.5 w-3.5" /> },
    { id: "receivables", label: "Contas a receber", icon: <ArrowDownToLine className="h-3.5 w-3.5" /> },
    { id: "cashbook", label: "Livro caixa", icon: <Wallet className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Análise completa: vendas, produtos, fluxo de caixa, contas a pagar e a receber.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div>
            <Label htmlFor="from">Data inicial</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">Data final</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="status">Status</Label>
            <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="method">Forma de pagamento</Label>
            <Select id="method" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">Todas</option>
              <option value="CASH">Dinheiro</option>
              <option value="CARD">Cartão</option>
              <option value="PIX">PIX</option>
            </Select>
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? "Gerando..." : <FileText className="h-4 w-4" />} Gerar
          </Button>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-brand-600 text-brand-700"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading && <Loading />}

      {data && !loading && tab === "sales" && <SalesTab data={data} />}
      {data && !loading && tab === "products" && <ProductsTab data={data} />}
      {data && !loading && tab === "flow" && <FlowTab data={data} />}
      {data && !loading && tab === "payables" && <ExternalTab url="/admin/financeiro/pagar" />}
      {data && !loading && tab === "receivables" && <ExternalTab url="/admin/financeiro/receber" />}
      {data && !loading && tab === "cashbook" && <ExternalTab url="/admin/financeiro/livro-caixa" />}
    </div>
  );
}

// =================== Abas ===================

function SalesTab({ data }: { data: ReportData }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total de pedidos</p>
            <p className="text-xl font-extrabold">{data.totals.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pedidos confirmados</p>
            <p className="text-xl font-extrabold">{data.totals.confirmedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Faturamento</p>
            <p className="text-xl font-extrabold text-success">
              {formatCurrency(data.totals.confirmedRevenue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ticket médio</p>
            <p className="text-xl font-extrabold text-brand-700">
              {formatCurrency(data.totals.avgTicket)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Pedidos do período</CardTitle>
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Pedido</th>
                  <th className="pb-2 font-medium">Data</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium">Itens</th>
                  <th className="pb-2 font-medium">Forma</th>
                  <th className="pb-2 text-center font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      Nenhum pedido no período.
                    </td>
                  </tr>
                ) : (
                  data.orders.map((o) => (
                    <tr key={o.id} className="border-t border-border">
                      <td className="py-2.5 font-bold text-brand-700">
                        {orderNumberLabel(o.number)}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {formatDateTime(o.createdAt)}
                      </td>
                      <td className="py-2.5">{o.customerName}</td>
                      <td className="py-2.5">{o.itemCount}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {PAYMENT_LABELS[o.paymentMethod]}
                      </td>
                      <td className="py-2.5 text-center">
                        <Badge tone={STATUS_TONE[o.status]}>
                          {STATUS_LABELS[o.status]}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right font-semibold">
                        {formatCurrency(o.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductsTab({ data }: { data: ReportData }) {
  const totalRevenue = data.topProducts.reduce((s, p) => s + p.revenue, 0);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Produtos mais vendidos</CardTitle>
          <TrendUpIcon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {data.topProducts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sem dados.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {data.topProducts.map((p, i) => {
                const pct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
                return (
                  <li key={p.name} className="space-y-1 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-xs font-bold text-brand-800">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <Badge>{p.qty} un.</Badge>
                      <span className="text-xs font-semibold">
                        {formatCurrency(p.revenue)}
                      </span>
                    </div>
                    <div className="ml-10 h-1.5 w-[calc(100%-2.5rem)] overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-brand-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Formas de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(data.byMethod).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Sem dados.
            </p>
          ) : (
            Object.entries(data.byMethod).map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between rounded-xl border border-border p-3 text-sm"
              >
                <span className="font-medium">
                  {PAYMENT_LABELS[k as PaymentMethod]}
                </span>
                <span className="font-bold">{formatCurrency(v)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FlowTab({ data }: { data: ReportData }) {
  const maxDayRevenue = Math.max(1, ...data.byDay.map((d) => d.revenue));
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Vendas por dia</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byDay.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">Sem dados.</p>
          ) : (
            <div className="space-y-2">
              {data.byDay.map((d) => {
                const pct = (d.revenue / maxDayRevenue) * 100;
                return (
                  <div key={d.day} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0 text-muted-foreground">
                      {d.day.slice(5).split("-").reverse().join("/")}
                    </span>
                    <div className="h-6 flex-1 overflow-hidden rounded-lg bg-muted">
                      <div
                        className="h-full bg-brand-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-bold">
                      {formatCurrency(d.revenue)}
                    </span>
                    <span className="w-12 text-right text-xs text-muted-foreground">
                      {d.count} ped
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos por status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {Object.entries(data.byStatus).map(([k, v]) => (
              <div
                key={k}
                className="rounded-xl border border-border p-3 text-sm"
              >
                <Badge tone={STATUS_TONE[k as OrderStatus]}>
                  {STATUS_LABELS[k as OrderStatus]}
                </Badge>
                <p className="mt-2 text-2xl font-extrabold">{v}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExternalTab({ url }: { url: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="mb-3 text-sm text-muted-foreground">
        Este relatório tem uma tela dedicada com mais detalhes, filtros
        específicos e ações (baixa, cancelamento, etc.).
      </p>
      <a
        href={url}
        className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Abrir relatório →
      </a>
    </Card>
  );
}