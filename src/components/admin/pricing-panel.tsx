"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  Percent,
  RefreshCw,
  RotateCcw,
  Save,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty";
import { cn, formatCurrency, formatDate, formatDateTime, roundMoney } from "@/lib/format";
import { calculatePricing, formatMarkup, formatPct, type CostFields } from "@/lib/pricing-calc";
import {
  applyPricingAction,
  reapplyPricingAction,
  savePricingCostAction,
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

type CostRecord = {
  id: string;
  productId: string;
  code: string | null;
  unit: string;
  supplier: string | null;
  purchaseCost: number | null;
  freight: number | null;
  otherCosts: number | null;
  additionalCostPct: number | null;
  desiredMarginPct: number | null;
  taxPct: number | null;
  commissionPct: number | null;
  cardFeePct: number | null;
  marketplaceFeePct: number | null;
  maxDiscountPct: number | null;
  fixedCost: number | null;
  notes: string | null;
  updatedAt: string;
};

/** Ficha de custos em edição (strings, como digitadas no formulário). */
type CostState = {
  code: string;
  unit: string;
  supplier: string;
  notes: string;
  purchaseCost: string;
  freight: string;
  otherCosts: string;
  additionalCostPct: string;
  desiredMarginPct: string;
  taxPct: string;
  commissionPct: string;
  cardFeePct: string;
  marketplaceFeePct: string;
  maxDiscountPct: string;
  fixedCost: string;
  updatedAt: string | null;
};

type Props = {
  products: PricingProduct[];
  runs: PricingRun[];
  costs: CostRecord[];
};

const UNIT_OPTIONS = ["UN", "KG", "G", "L", "ML", "CX", "PCT", "BDJ", "DZ", "MT", "PAR", "KIT"];

function toEdit(n: number) {
  return n.toFixed(2).replace(".", ",");
}

/** Número para o formulário: inteiro sem casas, decimal com vírgula */
function toField(n: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : toEdit(n);
}

/** Aceita "29,90", "29.90", "1.299,90" → number (vazio/negativo → null) */
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

function defaultCostState(): CostState {
  return {
    code: "",
    unit: "UN",
    supplier: "",
    notes: "",
    purchaseCost: "",
    freight: "",
    otherCosts: "",
    additionalCostPct: "",
    desiredMarginPct: "30",
    taxPct: "0",
    commissionPct: "0",
    cardFeePct: "0",
    marketplaceFeePct: "0",
    maxDiscountPct: "10",
    fixedCost: "",
    updatedAt: null,
  };
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="mb-1 text-xs">{label}</Label>
      {children}
      {hint ? <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ResultCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "brand" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-2",
        tone === "brand" && "border-brand-200 bg-brand-50",
        tone === "danger" && "border-danger/30 bg-danger/5"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-sm font-bold",
          tone === "brand" && "text-lg text-brand-700",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function PricingPanel({ products, runs, costs }: Props) {
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

  // Ficha de custos por produto
  const [costsState, setCostsState] = useState<Record<string, CostState>>(() => {
    const map: Record<string, CostState> = {};
    for (const p of products) map[p.id] = defaultCostState();
    for (const c of costs) {
      if (!map[c.productId]) continue;
      map[c.productId] = {
        code: c.code ?? "",
        unit: c.unit || "UN",
        supplier: c.supplier ?? "",
        notes: c.notes ?? "",
        purchaseCost: toField(c.purchaseCost),
        freight: toField(c.freight),
        otherCosts: toField(c.otherCosts),
        additionalCostPct: toField(c.additionalCostPct),
        desiredMarginPct: toField(c.desiredMarginPct),
        taxPct: toField(c.taxPct),
        commissionPct: toField(c.commissionPct),
        cardFeePct: toField(c.cardFeePct),
        marketplaceFeePct: toField(c.marketplaceFeePct),
        maxDiscountPct: toField(c.maxDiscountPct),
        fixedCost: toField(c.fixedCost),
        updatedAt: c.updatedAt,
      };
    }
    return map;
  });
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [savingCostId, setSavingCostId] = useState<string | null>(null);
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});

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

  const calcFor = (p: PricingProduct) => {
    const c = costsState[p.id] ?? defaultCostState();
    const fields: CostFields = {
      purchaseCost: parsePrice(c.purchaseCost),
      freight: parsePrice(c.freight),
      otherCosts: parsePrice(c.otherCosts),
      additionalCostPct: parsePrice(c.additionalCostPct),
      desiredMarginPct: parsePrice(c.desiredMarginPct),
      taxPct: parsePrice(c.taxPct),
      commissionPct: parsePrice(c.commissionPct),
      cardFeePct: parsePrice(c.cardFeePct),
      marketplaceFeePct: parsePrice(c.marketplaceFeePct),
      maxDiscountPct: parsePrice(c.maxDiscountPct),
      fixedCost: parsePrice(c.fixedCost),
    };
    return calculatePricing(fields, p.price);
  };

  const setCost = (productId: string, field: keyof CostState, value: string) => {
    setCostsState((prev) => ({ ...prev, [productId]: { ...prev[productId], [field]: value } }));
    setDirtyIds((prev) => ({ ...prev, [productId]: true }));
  };

  // Salva a ficha de custos (auto-save ao sair do campo ou botão explícito)
  const saveCost = (productId: string) => {
    const c = costsState[productId];
    if (!c) return;
    const payload = {
      productId,
      code: c.code || null,
      unit: c.unit || "UN",
      supplier: c.supplier || null,
      purchaseCost: parsePrice(c.purchaseCost),
      freight: parsePrice(c.freight),
      otherCosts: parsePrice(c.otherCosts),
      additionalCostPct: parsePrice(c.additionalCostPct),
      desiredMarginPct: parsePrice(c.desiredMarginPct),
      taxPct: parsePrice(c.taxPct),
      commissionPct: parsePrice(c.commissionPct),
      cardFeePct: parsePrice(c.cardFeePct),
      marketplaceFeePct: parsePrice(c.marketplaceFeePct),
      maxDiscountPct: parsePrice(c.maxDiscountPct),
      fixedCost: parsePrice(c.fixedCost),
      notes: c.notes || null,
    };
    setSavingCostId(productId);
    startTransition(async () => {
      try {
        const res = await savePricingCostAction(payload);
        if (!res.ok) {
          show("error", res.error);
          return;
        }
        setCostsState((prev) => ({
          ...prev,
          [productId]: { ...prev[productId], updatedAt: res.updatedAt },
        }));
        setDirtyIds((prev) => ({ ...prev, [productId]: false }));
      } finally {
        setSavingCostId(null);
      }
    });
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

  // Usa o preço sugerido pelo cálculo como novo preço de venda
  const applySuggested = (p: PricingProduct) => {
    const calc = calcFor(p);
    if (calc.suggestedPrice === null || calc.suggestedPrice <= 0) {
      show("error", calc.invalid ? "Ajuste os %: soma da margem + taxas ≥ 100%." : "Informe os custos para calcular o preço sugerido.");
      return;
    }
    setPrice(p.id, toEdit(calc.suggestedPrice));
    show("success", `Preço sugerido (${formatCurrency(calc.suggestedPrice)}) carregado como novo preço.`);
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
            Custos de insumos, cálculo de preço e publicação no estoque — com histórico para reutilizar.
          </p>
        </div>
        <Button onClick={submit} disabled={isPending || changes.length === 0}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
          Subir para o estoque ({changes.length})
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Ajuste rápido */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-4 w-4 text-brand-600" /> Ajuste rápido
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Aplica um percentual e/ou valor fixo à coluna “Novo preço” de todos os produtos. Percentual negativo = desconto.
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
                  className="h-9"
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
                  className="h-9"
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
                className="h-9"
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
                className="h-9"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de precificação (custos + resultados + preço de venda) */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-brand-600" /> Tabela de precificação
            <Badge tone={changes.length > 0 ? "brand" : "muted"}>
              {changes.length > 0 ? `${changes.length} alterado(s)` : "Sem alterações"}
            </Badge>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            Custo real = (compra + frete + outros) × (1 + adicional%) · Preço sugerido = custo ÷ [1 − (margem + taxas)] ·
            clique no produto para abrir a ficha de insumos.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Código</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Produto/Serviço</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Categoria</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Un.</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Fornecedor</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Custo real</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Preço mínimo</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Preço sugerido</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Venda atual</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Novo preço</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Markup</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Lucro unit.</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Margem real %</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Ponto de equil.</th>
                  <th className="whitespace-nowrap py-2 pr-3 font-medium">Atualizado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const c = costsState[p.id] ?? defaultCostState();
                  const calc = calcFor(p);
                  const diff = changeById.get(p.id);
                  const open = expandedProduct === p.id;
                  const cell = "whitespace-nowrap py-2 pr-3";
                  return (
                    <Fragment key={p.id}>
                      <tr className={cn("border-b border-border/60", open && "bg-muted/40")}>
                        <td className={cn(cell, "font-mono text-xs text-muted-foreground")}>{c.code || "—"}</td>
                        <td className={cell}>
                          <button
                            type="button"
                            onClick={() => setExpandedProduct(open ? null : p.id)}
                            className="flex items-center gap-1 font-medium hover:text-brand-700"
                          >
                            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            {p.name}
                          </button>
                        </td>
                        <td className={cn(cell, "text-muted-foreground")}>{p.category?.name ?? "—"}</td>
                        <td className={cell}>{c.unit || "UN"}</td>
                        <td className={cell}>
                          <span className="block max-w-[130px] truncate" title={c.supplier ?? ""}>
                            {c.supplier || "—"}
                          </span>
                        </td>
                        <td className={cell}>{calc.hasCost ? formatCurrency(calc.realCost) : "—"}</td>
                        <td className={cell}>
                          {calc.minPrice !== null && calc.hasCost ? formatCurrency(calc.minPrice) : "—"}
                        </td>
                        <td className={cn(cell, "font-semibold text-brand-700")}>
                          {calc.suggestedPrice !== null ? formatCurrency(calc.suggestedPrice) : "—"}
                        </td>
                        <td className={cell}>{formatCurrency(p.price)}</td>
                        <td className={cell}>
                          <div className="flex items-center gap-2">
                            <Input
                              value={prices[p.id] ?? toEdit(p.price)}
                              onChange={(e) => setPrice(p.id, e.target.value)}
                              inputMode="decimal"
                              className="h-9 w-28"
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
                        <td className={cell}>{formatMarkup(calc.markup)}</td>
                        <td className={cell}>
                          {calc.currentProfit !== null && calc.hasCost ? formatCurrency(calc.currentProfit) : "—"}
                        </td>
                        <td className={cell}>
                          {calc.hasCost ? formatPct(calc.currentMarginPct) : "—"}
                        </td>
                        <td className={cell}>
                          {calc.breakEvenQty !== null ? `${calc.breakEvenQty} un.` : "—"}
                        </td>
                        <td className={cn(cell, "text-xs text-muted-foreground")}>
                          {c.updatedAt ? formatDate(c.updatedAt) : "—"}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            aria-label={open ? "Fechar ficha" : "Abrir ficha de custos"}
                            onClick={() => setExpandedProduct(open ? null : p.id)}
                            className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                          >
                            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                      </tr>

                      {open && (
                        <tr className="border-b border-border/60 bg-muted/40">
                          <td colSpan={16} className="px-3 pb-4 pt-1">
                            <div className="grid gap-4 lg:grid-cols-3">
                              {/* Identificação */}
                              <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                                <p className="text-xs font-bold text-muted-foreground">Identificação</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <Field label="Código">
                                    <Input
                                      value={c.code}
                                      onChange={(e) => setCost(p.id, "code", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      placeholder="Ex.: 001"
                                      maxLength={40}
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Unidade">
                                    <select
                                      value={c.unit}
                                      onChange={(e) => setCost(p.id, "unit", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      className="flex h-9 w-full rounded-xl border border-border bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                                    >
                                      {UNIT_OPTIONS.map((u) => (
                                        <option key={u} value={u}>
                                          {u}
                                        </option>
                                      ))}
                                    </select>
                                  </Field>
                                </div>
                                <Field label="Fornecedor">
                                  <Input
                                    value={c.supplier}
                                    onChange={(e) => setCost(p.id, "supplier", e.target.value)}
                                    onBlur={() => saveCost(p.id)}
                                    placeholder="De onde é comprado"
                                    maxLength={120}
                                    className="h-9"
                                  />
                                </Field>
                                <Field label="Observações">
                                  <Textarea
                                    value={c.notes}
                                    onChange={(e) => setCost(p.id, "notes", e.target.value)}
                                    onBlur={() => saveCost(p.id)}
                                    placeholder="Informações adicionais sobre este produto..."
                                    maxLength={500}
                                    className="min-h-[70px]"
                                  />
                                </Field>
                              </div>

                              {/* Custos (insumo) */}
                              <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                                <p className="text-xs font-bold text-muted-foreground">Custos (insumo)</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <Field label="Custo de compra (R$)">
                                    <Input
                                      value={c.purchaseCost}
                                      onChange={(e) => setCost(p.id, "purchaseCost", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      placeholder="0,00"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Frete (R$)">
                                    <Input
                                      value={c.freight}
                                      onChange={(e) => setCost(p.id, "freight", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      placeholder="0,00"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Outros custos (R$)">
                                    <Input
                                      value={c.otherCosts}
                                      onChange={(e) => setCost(p.id, "otherCosts", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      placeholder="0,00"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Custo adicional %">
                                    <Input
                                      value={c.additionalCostPct}
                                      onChange={(e) => setCost(p.id, "additionalCostPct", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      placeholder="Ex.: 5"
                                      className="h-9"
                                    />
                                  </Field>
                                </div>
                                <p className="text-[11px] leading-tight text-muted-foreground">
                                  Custo adicional % = perdas, impostos de compra etc. aplicados sobre (compra + frete +
                                  outros).
                                </p>
                              </div>

                              {/* Margem & taxas */}
                              <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                                <p className="text-xs font-bold text-muted-foreground">Margem &amp; taxas (%)</p>
                                <div className="grid grid-cols-2 gap-3">
                                  <Field label="Margem desejada %">
                                    <Input
                                      value={c.desiredMarginPct}
                                      onChange={(e) => setCost(p.id, "desiredMarginPct", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Impostos %">
                                    <Input
                                      value={c.taxPct}
                                      onChange={(e) => setCost(p.id, "taxPct", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Comissão %">
                                    <Input
                                      value={c.commissionPct}
                                      onChange={(e) => setCost(p.id, "commissionPct", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Taxa cartão %">
                                    <Input
                                      value={c.cardFeePct}
                                      onChange={(e) => setCost(p.id, "cardFeePct", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Taxa marketplace %">
                                    <Input
                                      value={c.marketplaceFeePct}
                                      onChange={(e) => setCost(p.id, "marketplaceFeePct", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      className="h-9"
                                    />
                                  </Field>
                                  <Field label="Desconto máximo %">
                                    <Input
                                      value={c.maxDiscountPct}
                                      onChange={(e) => setCost(p.id, "maxDiscountPct", e.target.value)}
                                      onBlur={() => saveCost(p.id)}
                                      inputMode="decimal"
                                      className="h-9"
                                    />
                                  </Field>
                                </div>
                                <Field
                                  label="Custo fixo a recuperar (R$)"
                                  hint="Alimenta o ponto de equilíbrio (ex.: rateio mensal do aluguel)."
                                >
                                  <Input
                                    value={c.fixedCost}
                                    onChange={(e) => setCost(p.id, "fixedCost", e.target.value)}
                                    onBlur={() => saveCost(p.id)}
                                    inputMode="decimal"
                                    placeholder="0,00"
                                    className="h-9"
                                  />
                                </Field>
                              </div>
                            </div>

                            {/* Resultados */}
                            <div className="mt-3">
                              {calc.invalid && (
                                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-danger">
                                  <AlertTriangle className="h-3.5 w-3.5" /> A soma da margem + taxas atingiu 100% — o
                                  preço sugerido não pode ser calculado. Ajuste os percentuais.
                                </p>
                              )}
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                                <ResultCard
                                  label="Custo real"
                                  value={calc.hasCost ? formatCurrency(calc.realCost) : "—"}
                                  sub={calc.hasCost ? "por unidade" : "informe os custos"}
                                />
                                <ResultCard
                                  label="Preço sugerido"
                                  tone="brand"
                                  value={calc.suggestedPrice !== null ? formatCurrency(calc.suggestedPrice) : "—"}
                                  sub={
                                    calc.suggestedProfit !== null
                                      ? `lucro ${formatCurrency(calc.suggestedProfit)} (${formatPct(calc.suggestedMarginPct)})`
                                      : "margem + taxas ≥ 100%"
                                  }
                                />
                                <ResultCard
                                  label="Preço mínimo"
                                  value={calc.minPrice !== null && calc.hasCost ? formatCurrency(calc.minPrice) : "—"}
                                  sub="limite de negociação"
                                />
                                <ResultCard label="Markup" value={formatMarkup(calc.markup)} sub="sugerido ÷ custo" />
                                <ResultCard
                                  label="Preço de venda atual"
                                  value={formatCurrency(p.price)}
                                  sub="praticado no estoque"
                                />
                                <ResultCard
                                  label="Lucro unitário"
                                  value={
                                    calc.currentProfit !== null && calc.hasCost
                                      ? formatCurrency(calc.currentProfit)
                                      : "—"
                                  }
                                  sub="no preço atual"
                                />
                                <ResultCard
                                  label="Margem real %"
                                  value={calc.hasCost ? formatPct(calc.currentMarginPct) : "—"}
                                  sub="no preço atual"
                                />
                                <ResultCard
                                  label="Ponto de equilíbrio"
                                  value={calc.breakEvenQty !== null ? `${calc.breakEvenQty} un.` : "—"}
                                  sub="custo fixo ÷ margem contrib."
                                />
                              </div>
                            </div>

                            {/* Rodapé da ficha */}
                            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                              <p className="text-xs text-muted-foreground">
                                Data da atualização:{" "}
                                {c.updatedAt ? formatDateTime(c.updatedAt) : "ainda não salva"}
                                {savingCostId === p.id ? (
                                  <span className="ml-2 inline-flex items-center gap-1 text-brand-700">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                                  </span>
                                ) : dirtyIds[p.id] ? (
                                  <span className="ml-2 font-medium text-warning">Alterações não salvas</span>
                                ) : c.updatedAt ? (
                                  <span className="ml-2 inline-flex items-center gap-1 text-success">
                                    <Check className="h-3 w-3" /> Salvo
                                  </span>
                                ) : null}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => applySuggested(p)}
                                  disabled={calc.suggestedPrice === null}
                                  className="gap-1.5"
                                >
                                  <Check className="h-3.5 w-3.5" /> Usar preço sugerido
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveCost(p.id)}
                                  disabled={savingCostId === p.id}
                                  className="gap-1.5"
                                >
                                  {savingCostId === p.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Save className="h-3.5 w-3.5" />
                                  )}
                                  Salvar custos
                                </Button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
                        {open ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
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