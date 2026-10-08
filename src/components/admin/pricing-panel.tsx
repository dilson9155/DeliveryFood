"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Package,
  Percent,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty";
import { formatCurrency, formatDateTime, roundMoney } from "@/lib/format";
import {
  applyPricingAction,
  reapplyPricingAction,
} from "@/app/actions/pricing";

type PricingProduct = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  category: { name: string } | null;
};

type RunItem = {
  id: string;
  productId: string;
  productName: string;
  oldPrice: number;
  newPrice: number;
};

type PricingRun = {
  id: string;
  label: string;
  note: string | null;
  totalItems: number;
  createdAt: string;
  createdBy: { name: string } | null;
  items: RunItem[];
};

type Props = {
  products: PricingProduct[];
  runs: PricingRun[];
};

function toEdit(n: number) {
  return n.toFixed(2).replace(".", ",");
}

/** Aceita "29,90", "29.90", "1.299,90" → number */
function parsePrice(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  let n: number;
  if (s.includes(",")) {
    n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  } else {
    n = parseFloat(s);
  }
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(n);
}

export function PricingPanel({ products, runs }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [isPending, startTransition] = useTransition();

  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of products) init[p.id] = toEdit(p.price);
    return init;
  });
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [adjustPct, setAdjustPct] = useState("");
  const [adjustMoney, setAdjustMoney] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [reapplyingId, setReapplyingId] = useState<string | null>(null);

  const changes = useMemo(() => {
    const out: { productId: string; productName: string; oldPrice: number; newPrice: number }[] = [];
    for (const p of products) {
      const v = parsePrice(prices[p.id] ?? toEdit(p.price));
      const current = roundMoney(p.price);
      if (v !== null && v !== current) {
        out.push({ productId: p.id, productName: p.name, oldPrice: current, newPrice: v });
      }
    }
    return out;
  }, [products, prices]);

  const changeById = useMemo(() => {
    const map = new Map<string, { oldPrice: number; newPrice: number }>();
    for (const c of changes) map.set(c.productId, { oldPrice: c.oldPrice, newPrice: c.newPrice });
    return map;
  }, [changes]);

  const setPrice = (id: string, value: string) => {
    setPrices((prev) => ({ ...prev, [id]: value }));
  };

  // Ajuste rápido: % (pode ser negativo p/ desconto) +/ou valor fixo em R$
  const quickAdjust = () => {
    const pct = adjustPct.trim() ? parseFloat(adjustPct.replace(",", ".")) : NaN;
    const money = adjustMoney.trim() ? parseFloat(adjustMoney.replace(",", ".")) : NaN;
    if (Number.isNaN(pct) && Number.isNaN(money)) {
      show("error", "Informe um percentual ou um valor em reais.");
      return;
    }
    if (!Number.isNaN(pct) && (pct < -100 || pct > 1000)) {
      show("error", "Percentual fora do intervalo (-100% a 1000%).");
      return;
    }
    setPrices((prev) => {
      const next: Record<string, string> = {};
      for (const p of products) {
        let v = roundMoney(p.price);
        if (!Number.isNaN(pct)) v = v * (1 + pct / 100);
        if (!Number.isNaN(money)) v = v + money;
        v = Math.max(0.01, roundMoney(v));
        next[p.id] = toEdit(v);
      }
      return { ...prev, ...next };
    });
  };

  const resetPrices = () => {
    setPrices((prev) => {
      const next: Record<string, string> = {};
      for (const p of products) next[p.id] = toEdit(p.price);
      return { ...prev, ...next };
    });
    show("success", "Preços restaurados para os valores atuais do catálogo.");
  };

  // Carrega uma rodada do histórico no editor (para editar/reusar depois)
  const loadRun = (run: PricingRun) => {
    setPrices((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const item of run.items) next[item.productId] = toEdit(item.newPrice);
      return next;
    });
    setLabel(run.label);
    setNote("");
    show("success", `Tabela "${run.label}" carregada no editor.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = () => {
    if (changes.length === 0) {
      show("error", "Nenhum preço foi alterado em relação ao catálogo atual.");
      return;
    }
    if (label.trim().length < 2) {
      show("error", "Dê um nome para esta tabela de preços.");
      return;
    }
    startTransition(async () => {
      const res = await applyPricingAction({
        label: label.trim(),
        note: note.trim() || null,
        prices: changes.map((c) => ({ productId: c.productId, price: c.newPrice })),
      });
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", `${res.appliedItems} preço(s) atualizado(s) no estoque e registrado(s) no histórico.`);
      router.refresh();
    });
  };

  const reapply = (run: PricingRun) => {
    setReapplyingId(run.id);
    startTransition(async () => {
      const res = await reapplyPricingAction(run.id);
      setReapplyingId(null);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", `Tabela reaplicada: ${res.appliedItems} preço(s) atualizado(s).`);
      router.refresh();
    });
  };

  const totalOld = changes.reduce((acc, c) => acc + c.oldPrice, 0);
  const totalNew = changes.reduce((acc, c) => acc + c.newPrice, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Precificação</h1>
          <p className="text-sm text-muted-foreground">
            Monte a tabela de preços e publique no estoque dos produtos com um clique. Tudo fica no histórico para reutilizar.
          </p>
        </div>
        <Button onClick={submit} disabled={isPending || changes.length === 0}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          Subir para o estoque ({changes.length})
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Ajuste rápido */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-brand-600" /> Ajuste rápido
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Aplica um percentual e/ou valor fixo a <strong>todos</strong> os produtos abaixo. Percentual negativo = desconto.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32">
                <Label htmlFor="adjustPct">Reajuste (%)</Label>
                <Input
                  id="adjustPct"
                  value={adjustPct}
                  onChange={(e) => setAdjustPct(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex.: 10 ou -10"
                />
              </div>
              <div className="w-32">
                <Label htmlFor="adjustMoney">Valor (R$)</Label>
                <Input
                  id="adjustMoney"
                  value={adjustMoney}
                  onChange={(e) => setAdjustMoney(e.target.value)}
                  inputMode="decimal"
                  placeholder="Ex.: 2,50"
                />
              </div>
              <Button variant="outline" onClick={quickAdjust} className="gap-1.5">
                <Banknote className="h-4 w-4" /> Aplicar
              </Button>
              <Button variant="ghost" onClick={resetPrices} className="gap-1.5">
                <RotateCcw className="h-4 w-4" /> Restaurar atuais
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Publicar no estoque */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-brand-600" /> Publicar no estoque
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Serão enviados ao catálogo {changes.length} produto(s) (soma de{" "}
              {formatCurrency(totalOld)} → {formatCurrency(totalNew)}).
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="runLabel">Nome da tabela *</Label>
              <Input
                id="runLabel"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Reajuste 10% — Out/2026"
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="runNote">Observação (opcional)</Label>
              <Input
                id="runNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Motivo, fornecedor, data de vigência..."
                maxLength={300}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Editor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-brand-600" /> Tabela de preços
          </CardTitle>
          <Badge tone={changes.length > 0 ? "brand" : "muted"}>
            {changes.length > 0 ? `${changes.length} alterado(s)` : "Sem alterações"}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Produto</th>
                  <th className="py-2 pr-3 font-medium">Categoria</th>
                  <th className="py-2 pr-3 font-medium">Preço atual</th>
                  <th className="py-2 font-medium">Novo preço (R$)</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const diff = changeById.get(p.id);
                  return (
                    <tr key={p.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-3 font-medium">{p.name}</td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{p.category?.name ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        <span className={diff ? "text-muted-foreground line-through" : ""}>
                          {formatCurrency(p.price)}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <Input
                            value={prices[p.id] ?? toEdit(p.price)}
                            onChange={(e) => setPrice(p.id, e.target.value)}
                            inputMode="decimal"
                            className="w-32"
                            aria-label={`Novo preço de ${p.name}`}
                          />
                          {diff && (
                            <Badge tone={diff.newPrice > diff.oldPrice ? "danger" : "success"}>
                              {diff.newPrice > diff.oldPrice ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {formatCurrency(diff.newPrice)}
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-brand-600" /> Histórico de precificação
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Reutilize uma tabela antiga: clique em “Carregar” para editar ou “Aplicar de novo” para publicá-la imediatamente.
          </p>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <EmptyState
              icon={<History className="h-8 w-8" />}
              title="Nenhuma rodada registrada"
              description="Quando você subir uma tabela de preços, ela ficará registrada aqui."
            />
          ) : (
            <div className="space-y-3">
              {runs.map((run) => {
                const open = expandedRun === run.id;
                return (
                  <div key={run.id} className="rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setExpandedRun(open ? null : run.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{run.label}</span>
                          <Badge tone="default">{run.totalItems} produto(s)</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(run.createdAt)}
                          {run.createdBy?.name ? ` · ${run.createdBy.name}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadRun(run);
                          }}
                        >
                          Carregar
                        </Button>
                        <Button
                          size="sm"
                          disabled={reapplyingId === run.id || isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            reapply(run);
                          }}
                        >
                          {reapplyingId === run.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Aplicar de novo
                        </Button>
                        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {open && (
                      <div className="border-t border-border px-4 py-3">
                        {run.note && <p className="mb-2 text-sm text-muted-foreground">Observação: {run.note}</p>}
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                                <th className="py-1.5 pr-3 font-medium">Produto</th>
                                <th className="py-1.5 pr-3 font-medium">Antes</th>
                                <th className="py-1.5 font-medium">Depois</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.items.map((item) => (
                                <tr key={item.id} className="border-b border-border/50 last:border-0">
                                  <td className="py-1.5 pr-3">{item.productName}</td>
                                  <td className="py-1.5 pr-3 text-muted-foreground">{formatCurrency(item.oldPrice)}</td>
                                  <td className="py-1.5 font-medium">{formatCurrency(item.newPrice)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}