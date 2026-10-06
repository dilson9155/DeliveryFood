"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { BookOpen, ArrowDownCircle, ArrowUpCircle, Calendar, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format";

type Movement = {
  id: string;
  type: "OPENING" | "CLOSING" | "INCOME" | "EXPENSE" | "WITHDRAWAL" | "SUPPLY";
  amount: number;
  description: string | null;
  paymentMethod: "CASH" | "CARD" | "PIX" | null;
  createdAt: string;
  user: { name: string };
  order: { number: number; customer: { name: string } } | null;
};

const TYPE_LABEL: Record<Movement["type"], string> = {
  OPENING: "Abertura",
  CLOSING: "Fechamento",
  INCOME: "Entrada",
  EXPENSE: "Saída",
  WITHDRAWAL: "Retirada",
  SUPPLY: "Suprimento",
};

export function CashBookView({
  movements,
  fromDate,
  toDate,
}: {
  movements: Movement[];
  fromDate: string;
  toDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [localFrom, setLocalFrom] = useState(fromDate);
  const [localTo, setLocalTo] = useState(toDate);
  const [typeFilter, setTypeFilter] = useState<"ALL" | Movement["type"]>("ALL");

  function applyFilters() {
    const params = new URLSearchParams();
    params.set("from", localFrom);
    params.set("to", localTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Agrupar por dia
  const byDay = useMemo(() => {
    const map = new Map<string, Movement[]>();
    movements.forEach((m) => {
      const day = m.createdAt.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(m);
    });
    return Array.from(map.entries()).sort(([a], [b]) =>
      a < b ? 1 : a > b ? -1 : 0
    );
  }, [movements]);

  const totals = useMemo(() => {
    const totalIncome = movements
      .filter((m) => m.type === "INCOME" || m.type === "SUPPLY")
        .reduce((s, m) => s + m.amount, 0);
    const totalExpense = movements
      .filter((m) => m.type === "EXPENSE" || m.type === "WITHDRAWAL")
        .reduce((s, m) => s + m.amount, 0);
    return {
      income: totalIncome,
      expense: totalExpense,
      balance: totalIncome - totalExpense,
    };
  }, [movements]);

  const filteredMovements = useMemo(() => {
    if (typeFilter === "ALL") return movements;
    return movements.filter((m) => m.type === typeFilter);
  }, [movements, typeFilter]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <BookOpen className="h-6 w-6 text-brand-600" />
          Livro caixa
        </h1>
        <p className="text-sm text-muted-foreground">
          Todas as entradas e saídas de caixa no intervalo selecionado.
        </p>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              De
            </label>
            <input
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Até
            </label>
            <input
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <button
            onClick={applyFilters}
            className="flex h-9 items-center gap-1 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Filter className="h-3.5 w-3.5" />
            Filtrar
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <ArrowDownCircle className="h-4 w-4 text-success" />
            Entradas
          </div>
          <p className="mt-1 text-lg font-extrabold text-success">
            {formatCurrency(totals.income)}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <ArrowUpCircle className="h-4 w-4 text-danger" />
            Saídas
          </div>
          <p className="mt-1 text-lg font-extrabold text-danger">
            {formatCurrency(totals.expense)}
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Saldo do período
          </div>
          <p
            className={`mt-1 text-lg font-extrabold ${
              totals.balance >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {formatCurrency(totals.balance)}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Filtrar tipo:</span>
        {(["ALL", "INCOME", "EXPENSE", "WITHDRAWAL", "SUPPLY"] as const).map(
          (t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                typeFilter === t
                  ? "bg-brand-600 text-white"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {t === "ALL" ? "Todos" : TYPE_LABEL[t]}
            </button>
          )
        )}
      </div>

      {byDay.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum movimento no período.
        </Card>
      ) : (
        <div className="space-y-3">
          {byDay.map(([day, dayMovements]) => {
            const dayIncome = dayMovements
              .filter((m) => m.type === "INCOME" || m.type === "SUPPLY")
              .reduce((s, m) => s + m.amount, 0);
            const dayExpense = dayMovements
              .filter((m) => m.type === "EXPENSE" || m.type === "WITHDRAWAL")
              .reduce((s, m) => s + m.amount, 0);
            const dayBalance = dayIncome - dayExpense;
            const filteredDay = filteredMovements.filter((m) =>
              m.createdAt.startsWith(day)
            );
            if (filteredDay.length === 0) return null;
            return (
              <Card key={day} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                  <p className="text-sm font-bold">{formatDate(day + "T12:00:00")}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-success">+ {formatCurrency(dayIncome)}</span>
                    <span className="text-danger">− {formatCurrency(dayExpense)}</span>
                    <span
                      className={
                        dayBalance >= 0 ? "text-foreground" : "text-danger"
                      }
                    >
                      = <strong>{formatCurrency(dayBalance)}</strong>
                    </span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-muted-foreground">
                      <th className="py-2 pl-4 text-left font-medium">Hora</th>
                      <th className="py-2 text-left font-medium">Tipo</th>
                      <th className="py-2 text-left font-medium">Descrição</th>
                      <th className="py-2 text-left font-medium">Por</th>
                      <th className="py-2 pr-4 text-right font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDay.map((m) => (
                      <tr key={m.id} className="border-t border-border/60">
                        <td className="py-2 pl-4 text-muted-foreground">
                          {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              m.type === "INCOME" || m.type === "SUPPLY"
                                ? "bg-success/10 text-success"
                                : m.type === "EXPENSE" || m.type === "WITHDRAWAL"
                                  ? "bg-danger/10 text-danger"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {TYPE_LABEL[m.type]}
                          </span>
                        </td>
                        <td className="py-2">
                          {m.description ??
                            (m.order
                              ? `Pedido #${String(m.order.number).padStart(4, "0")} · ${m.order.customer.name}`
                              : "—")}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">
                          {m.user.name}
                        </td>
                        <td
                          className={`py-2 pr-4 text-right font-bold ${
                            m.type === "INCOME" || m.type === "SUPPLY"
                              ? "text-success"
                              : "text-danger"
                          }`}
                        >
                          {m.type === "INCOME" || m.type === "SUPPLY" ? "+" : "−"}
                          {formatCurrency(m.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}