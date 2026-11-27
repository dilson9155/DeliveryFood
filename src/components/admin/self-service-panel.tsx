"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  History,
  Loader2,
  QrCode,
  Scale,
  Save,
  Settings2,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  createSelfServiceSaleAction,
  saveSelfServiceSettingsAction,
} from "@/app/actions/self-service";
import { cn, formatCurrency, formatDateTime, roundMoney } from "@/lib/format";
import type { PaymentMethod } from "@prisma/client";

type Customer = { id: string; name: string; phone: string | null };
type Sale = {
  id: string;
  number: number;
  mode: "BY_WEIGHT" | "FIXED";
  weightGrams: number | null;
  pricePerKg: number | null;
  people: number | null;
  pricePerPerson: number | null;
  total: number;
  paymentMethod: PaymentMethod;
  paidNow: boolean;
  createdAt: string;
  customer: { name: string } | null;
  operator: { name: string };
  order: { id: string; number: number; paymentStatus: string } | null;
};

type Mode = "BY_WEIGHT" | "FIXED";

const PAYMENTS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "PIX", label: "PIX", icon: <QrCode className="h-4 w-4" /> },
  { value: "CASH", label: "Dinheiro", icon: <Banknote className="h-4 w-4" /> },
  { value: "CARD", label: "Cartão", icon: <CreditCard className="h-4 w-4" /> },
];

function parseMoney(value: string): number {
  const cleaned = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  return Number(cleaned) || 0;
}

export function SelfServicePanel({
  prices,
  customers,
  sales,
  canConfirmPayments,
  canManageSettings,
  cashRegisterOpen,
}: {
  prices: { pricePerKg: number; fixedPrice: number };
  customers: Customer[];
  sales: Sale[];
  canConfirmPayments: boolean;
  canManageSettings: boolean;
  cashRegisterOpen: boolean;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("BY_WEIGHT");
  const [weight, setWeight] = useState("650");
  const [people, setPeople] = useState("1");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [paidNow, setPaidNow] = useState(canConfirmPayments);
  const [amountReceived, setAmountReceived] = useState("");
  const [observation, setObservation] = useState("");
  const [pricePerKg, setPricePerKg] = useState(String(prices.pricePerKg).replace(".", ","));
  const [fixedPrice, setFixedPrice] = useState(String(prices.fixedPrice).replace(".", ","));
  const [lastSale, setLastSale] = useState<{
    number: number;
    total: number;
    change: number;
    orderId: string;
  } | null>(null);

  const total = useMemo(() => {
    if (mode === "BY_WEIGHT") {
      return roundMoney((Math.max(0, Number(weight) || 0) / 1000) * prices.pricePerKg);
    }
    return roundMoney(Math.max(0, Number(people) || 0) * prices.fixedPrice);
  }, [mode, weight, people, prices]);

  const received = amountReceived.trim() ? parseMoney(amountReceived) : null;
  const change = received !== null ? roundMoney(Math.max(0, received - total)) : 0;
  const showChange = paidNow && paymentMethod === "CASH";
  const shortfall = showChange && received !== null && received < total;

  function submit() {
    if (total <= 0) {
      show("error", "Configure o preço correspondente antes de registrar a venda.");
      return;
    }
    if (showChange && shortfall) {
      show("error", `Valor recebido insuficiente. Faltam ${formatCurrency(total - (received ?? 0))}.`);
      return;
    }
    startTransition(async () => {
      const result = await createSelfServiceSaleAction({
        mode,
        ...(mode === "BY_WEIGHT" ? { weightGrams: Number(weight) } : { people: Number(people) }),
        customerId: customerId || null,
        paymentMethod,
        paidNow,
        ...(showChange ? { amountReceived: received ?? undefined } : {}),
        observation: observation.trim() || null,
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      setLastSale({
        number: result.orderNumber,
        total: result.total,
        change: result.change,
        orderId: result.orderId,
      });
      setObservation("");
      setAmountReceived("");
      show("success", `Venda #${result.orderNumber} registrada!`);
      router.refresh();
    });
  }

  function savePrices() {
    startTransition(async () => {
      const result = await saveSelfServiceSettingsAction({
        pricePerKg: parseMoney(pricePerKg),
        fixedPrice: parseMoney(fixedPrice),
      });
      if (!result.ok) {
        show("error", result.error);
        return;
      }
      show("success", "Preços do self-service atualizados.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Self-service</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Vendas por quilo ou preço fixo, independentes das marmitas do dia.
        </p>
      </div>

      {lastSale && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm font-bold">Venda #{lastSale.number} registrada</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(lastSale.total)}
                  {lastSale.change > 0 ? ` · Troco ${formatCurrency(lastSale.change)}` : ""}
                </p>
              </div>
            </div>
            <Link href={`/recibo/${lastSale.orderId}`}>
              <Button variant="outline" size="sm">Ver recibo</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!cashRegisterOpen && (
        <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-xs font-medium text-warning">
          Não há caixa aberto. Abra o caixa para registrar recebimentos agora; vendas a pagar continuam disponíveis.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Registrar venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("BY_WEIGHT")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
                  mode === "BY_WEIGHT"
                    ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
                    : "border-border bg-background hover:bg-muted/50"
                )}
              >
                <Scale className="h-4 w-4" /> Por quilo
              </button>
              <button
                type="button"
                onClick={() => setMode("FIXED")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
                  mode === "FIXED"
                    ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
                    : "border-border bg-background hover:bg-muted/50"
                )}
              >
                <UtensilsCrossed className="h-4 w-4" /> Preço fixo
              </button>
            </div>

            {mode === "BY_WEIGHT" ? (
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-[180px] flex-1">
                    <Label>Peso da refeição (gramas)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      inputMode="numeric"
                      value={weight}
                      onChange={(event) => setWeight(event.target.value)}
                      className="mt-1 text-lg font-bold"
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Preço por kg</p>
                    <p className="text-lg font-bold text-brand-700">{formatCurrency(prices.pricePerKg)}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[300, 500, 650, 800, 1000].map((grams) => (
                    <button
                      key={grams}
                      type="button"
                      onClick={() => setWeight(String(grams))}
                      className="h-7 rounded-lg border border-border bg-card px-2.5 text-[11px] font-semibold hover:bg-muted"
                    >
                      {grams} g
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-[180px] flex-1">
                    <Label>Quantidade de pessoas</Label>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      inputMode="numeric"
                      value={people}
                      onChange={(event) => setPeople(event.target.value)}
                      className="mt-1 text-lg font-bold"
                    />
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Preço por pessoa</p>
                    <p className="text-lg font-bold text-brand-700">{formatCurrency(prices.fixedPrice)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Cliente (opcional)</Label>
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                >
                  <option value="">Consumidor final</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Forma de pagamento</Label>
                <div className="mt-1 grid grid-cols-3 gap-1.5">
                  {PAYMENTS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPaymentMethod(option.value)}
                      className={cn(
                        "flex items-center justify-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-semibold",
                        paymentMethod === option.value
                          ? "border-brand-600 bg-brand-50 text-brand-800 ring-1 ring-brand-600"
                          : "border-border bg-background hover:bg-muted/50"
                      )}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Label>Observação (opcional)</Label>
              <Textarea
                value={observation}
                onChange={(event) => setObservation(event.target.value)}
                placeholder="Ex.: Sem cebola, cliente frequente..."
                maxLength={500}
                className="mt-1 min-h-[70px]"
              />
            </div>

            <label className="flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={paidNow}
                disabled={!canConfirmPayments}
                onChange={(event) => setPaidNow(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#FF9800]"
              />
              <span>
                <span className="block text-xs font-medium">Recebido agora</span>
                <span className="block text-[10px] text-muted-foreground">
                  {!canConfirmPayments
                    ? "Peça ao caixa para confirmar."
                    : paidNow
                      ? "Registra entrada no caixa."
                      : "Fica a pagar; confirme depois."}
                </span>
              </span>
            </label>

            {showChange && (
              <div className="rounded-2xl bg-[#0F0D0C] p-3 text-white">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0 text-[11px] text-white/70">Valor recebido</Label>
                  <span className="text-[10px] text-white/60">Total {formatCurrency(total)}</span>
                </div>
                <Input
                  inputMode="decimal"
                  value={amountReceived}
                  onChange={(event) => setAmountReceived(event.target.value)}
                  placeholder="0,00"
                  className="mt-1.5 h-11 border-white/15 bg-white/10 text-lg font-bold text-white placeholder:text-white/30"
                />
                <div className="mt-2.5 flex items-end justify-between border-t border-white/10 pt-2.5">
                  <div>
                    <p className="text-[10px] text-white/60">Troco</p>
                    <p
                      className={cn(
                        "text-2xl font-extrabold leading-none",
                        shortfall ? "text-red-300" : "text-[#FFB74D]"
                      )}
                    >
                      {received === null ? "—" : formatCurrency(change)}
                    </p>
                  </div>
                  {shortfall && (
                    <p className="text-right text-[10px] text-red-300">
                      Faltam {formatCurrency(total - (received ?? 0))}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Total da venda</p>
                <p className="text-3xl font-extrabold text-foreground">{formatCurrency(total)}</p>
              </div>
              <Button size="lg" onClick={submit} disabled={pending || total <= 0}>
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                Registrar venda
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {canManageSettings && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Settings2 className="h-4 w-4 text-brand-600" /> Configuração de preços
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Preço por quilo (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={pricePerKg}
                    onChange={(event) => setPricePerKg(event.target.value)}
                    className="mt-1"
                    placeholder="69,90"
                  />
                </div>
                <div>
                  <Label>Preço fixo por pessoa (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={fixedPrice}
                    onChange={(event) => setFixedPrice(event.target.value)}
                    className="mt-1"
                    placeholder="45,00"
                  />
                </div>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={savePrices}
                  disabled={pending}
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar preços
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Os preços configurados aqui não afetam o catálogo de produtos.
                </p>
              </CardContent>
            </Card>
          )}

          <Card className="max-h-[520px] overflow-auto">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-brand-600" /> Últimas vendas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sales.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                  Nenhuma venda de self-service registrada.
                </p>
              ) : (
                sales.slice(0, 40).map((sale) => (
                  <div key={sale.id} className="rounded-xl border border-border px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold">#{sale.order?.number ?? sale.number}</p>
                      <p className="text-xs font-extrabold text-brand-700">{formatCurrency(sale.total)}</p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {sale.mode === "BY_WEIGHT"
                        ? `${sale.weightGrams} g × ${formatCurrency(sale.pricePerKg ?? 0)}/kg`
                        : `${sale.people} pessoa(s) × ${formatCurrency(sale.pricePerPerson ?? 0)}`}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge
                        tone={
                          sale.paidNow || sale.order?.paymentStatus === "CONFIRMED"
                            ? "success"
                            : "warning"
                        }
                        className="text-[9px]"
                      >
                        {sale.paidNow || sale.order?.paymentStatus === "CONFIRMED"
                          ? sale.paymentMethod
                          : "A pagar"}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground">
                        {formatDateTime(sale.createdAt)} · {sale.customer?.name ?? "Consumidor final"}
                      </span>
                    </div>
                    {sale.order && (
                      <Link
                        href={`/recibo/${sale.order.id}`}
                        className="mt-1 inline-block text-[10px] font-semibold text-brand-700 underline"
                      >
                        Recibo do pedido #{sale.order.number}
                      </Link>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
