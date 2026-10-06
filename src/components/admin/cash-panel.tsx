"use client";

import { useState, useTransition } from "react";
import { LockOpen, Plus, Minus, Scale, Lock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  openCashRegisterAction,
  addCashMovementAction,
  closeCashRegisterAction,
} from "@/app/actions/cash";
import type { CashMovementType, PaymentMethod } from "@prisma/client";

type Movement = {
  id: string;
  type: CashMovementType;
  amount: number;
  description: string | null;
  paymentMethod: PaymentMethod | null;
  createdAt: string;
  user: { name: string } | null;
};

type ManualMovementType = "INCOME" | "EXPENSE" | "WITHDRAWAL" | "SUPPLY";

type Tone = "default" | "muted" | "success" | "warning" | "danger" | "info" | "brand";

type OpenRegister = {
  id: string;
  openingAmount: number;
  openedAt: string;
  notes: string | null;
  openedByUser: { name: string } | null;
  movements: Movement[];
} | null;

const TYPE_LABEL: Record<string, string> = {
  OPENING: "Abertura",
  CLOSING: "Fechamento",
  INCOME: "Entrada",
  EXPENSE: "Saída",
  WITHDRAWAL: "Retirada",
  SUPPLY: "Suprimento",
};

const TYPE_TONE: Record<string, Tone> = {
  OPENING: "default",
  CLOSING: "default",
  INCOME: "success",
  EXPENSE: "danger",
  WITHDRAWAL: "warning",
  SUPPLY: "info",
};

export function CashPanel({
  openRegister: initial,
  closedRegisters,
}: {
  openRegister: OpenRegister;
  closedRegisters: Array<{
    id: string;
    openedAt: string;
    closedAt: string | null;
    openingAmount: number;
    closingAmount: number | null;
    expectedAmount: number | null;
    difference: number | null;
    openedByUser: { name: string } | null;
    closedByUser: { name: string } | null;
  }>;
}) {
  const { show } = useToast();
  const [, startTransition] = useTransition();
  const [openRegister] = useState(initial);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [movementType, setMovementType] = useState<ManualMovementType>("INCOME");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementDesc, setMovementDesc] = useState("");
  const [movementMethod, setMovementMethod] = useState<PaymentMethod | "">("");
  const [closingCounted, setClosingCounted] = useState("");

  function openCash() {
    const amount = parseFloat(openingAmount.replace(",", "."));
    startTransition(async () => {
      const res = await openCashRegisterAction(isNaN(amount) ? 0 : amount);
      if (res.ok) {
        show("success", "Caixa aberto!");
        window.location.reload();
      } else show("error", res.error);
    });
  }

  function addMovement() {
    const amount = parseFloat(movementAmount.replace(",", "."));
    startTransition(async () => {
      const res = await addCashMovementAction({
        type: movementType,
        amount: isNaN(amount) ? 0 : amount,
        description: movementDesc,
        paymentMethod: (movementMethod || null) as PaymentMethod | null,
      });
      if (res.ok) {
        show("success", "Movimentação registrada.");
        setMovementAmount("");
        setMovementDesc("");
        window.location.reload();
      } else show("error", res.error);
    });
  }

  function closeCash() {
    const counted = parseFloat(closingCounted.replace(",", "."));
    startTransition(async () => {
      if (!openRegister) return;
      const res = await closeCashRegisterAction(openRegister.id, isNaN(counted) ? 0 : counted);
      if (res.ok) {
        show("success", "Caixa fechado com sucesso.");
        window.location.reload();
      } else show("error", res.error);
    });
  }

  if (!openRegister) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Caixa</h1>
          <p className="text-sm text-muted-foreground">O caixa está fechado.</p>
        </div>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Abrir caixa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="opening">Valor de abertura (R$)</Label>
              <Input
                id="opening"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
              />
            </div>
            <Button className="w-full" size="lg" onClick={openCash}>
              <LockOpen className="h-4 w-4" /> Abrir caixa
            </Button>
          </CardContent>
        </Card>

        <HistorySection registers={closedRegisters} />
      </div>
    );
  }

  const incomes = openRegister.movements
    .filter((m) => m.type === "INCOME")
    .reduce((s, m) => s + m.amount, 0);
  const expenses = openRegister.movements
    .filter((m) => m.type === "EXPENSE" || m.type === "WITHDRAWAL")
    .reduce((s, m) => s + m.amount, 0);
  const supplies = openRegister.movements
    .filter((m) => m.type === "SUPPLY")
    .reduce((s, m) => s + m.amount, 0);
  const expected = openRegister.openingAmount + incomes + supplies - expenses;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Caixa aberto</h1>
          <p className="text-sm text-muted-foreground">
            Aberto em {formatDateTime(openRegister.openedAt)} por{" "}
            {openRegister.openedByUser?.name ?? "-"}
          </p>
        </div>
        <Badge tone="success">Aberto</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Abertura</p><p className="text-lg font-extrabold">{formatCurrency(openRegister.openingAmount)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Entradas</p><p className="text-lg font-extrabold text-success">+ {formatCurrency(incomes)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Saídas</p><p className="text-lg font-extrabold text-danger">- {formatCurrency(expenses)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Saldo esperado</p><p className="text-lg font-extrabold">{formatCurrency(expected)}</p></CardContent></Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Nova movimentação</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="mv-type">Tipo</Label>
                <Select id="mv-type" value={movementType} onChange={(e) => setMovementType(e.target.value as ManualMovementType)}>
                  <option value="INCOME">Entrada</option>
                  <option value="EXPENSE">Saída (despesa)</option>
                  <option value="WITHDRAWAL">Retirada (sangria)</option>
                  <option value="SUPPLY">Suprimento</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="mv-method">Forma de pagamento</Label>
                <Select id="mv-method" value={movementMethod} onChange={(e) => setMovementMethod(e.target.value as PaymentMethod | "")}>
                  <option value="">—</option>
                  <option value="CASH">Dinheiro</option>
                  <option value="CARD">Cartão</option>
                  <option value="PIX">PIX</option>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="mv-amount">Valor (R$)</Label>
              <Input id="mv-amount" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <div>
              <Label htmlFor="mv-desc">Descrição</Label>
              <Input id="mv-desc" value={movementDesc} onChange={(e) => setMovementDesc(e.target.value)} placeholder="Ex.: compra de insumos" />
            </div>
            <Button className="w-full" size="lg" onClick={addMovement} disabled={!movementAmount}>
              {movementType === "INCOME" ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              Registrar {TYPE_LABEL[movementType].toLowerCase()}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Fechar caixa</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="closing">Valor contado no caixa (R$)</Label>
              <Input id="closing" value={closingCounted} onChange={(e) => setClosingCounted(e.target.value)} inputMode="decimal" placeholder="0,00" />
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Scale className="h-4 w-4" /> O sistema calculará a diferença entre o valor contado e o esperado.
            </p>
            <Button className="w-full" size="lg" variant="outline" onClick={closeCash} disabled={!closingCounted}>
              <Lock className="h-4 w-4" /> Fechar caixa
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Movimentações</CardTitle></CardHeader>
        <CardContent>
          {openRegister.movements.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma movimentação.</p>
          ) : (
            <div className="divide-y divide-border">
              {openRegister.movements.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <Badge tone={TYPE_TONE[m.type] || "default"}>{TYPE_LABEL[m.type]}</Badge>
                    <span className="text-muted-foreground">{m.paymentMethod ?? "—"}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{m.description ?? TYPE_LABEL[m.type]}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)} · {m.user?.name ?? "-"}
                    </p>
                  </div>
                  <span className={`font-bold ${m.type === "INCOME" || m.type === "SUPPLY" ? "text-success" : "text-danger"}`}>
                    {m.type === "INCOME" || m.type === "SUPPLY" ? "+" : "-"}{formatCurrency(m.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <HistorySection registers={closedRegisters} />
    </div>
  );
}

function HistorySection({
  registers,
}: {
  registers: Array<{
    id: string;
    openedAt: string;
    closedAt: string | null;
    openingAmount: number;
    closingAmount: number | null;
    expectedAmount: number | null;
    difference: number | null;
    openedByUser: { name: string } | null;
    closedByUser: { name: string } | null;
  }>;
}) {
  if (registers.length === 0) return null;
  return (
    <Card>
      <CardHeader><CardTitle>Caixas anteriores</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {registers.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
            <div>
              <p className="font-medium">Aberto {formatDateTime(r.openedAt)}</p>
              <p className="text-xs text-muted-foreground">
                Abertura {formatCurrency(r.openingAmount)} · Fechado {r.closedAt ? formatDateTime(r.closedAt) : "-"}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">Esperado: {formatCurrency(r.expectedAmount ?? 0)}</p>
              <p className="font-semibold">Contado: {formatCurrency(r.closingAmount ?? 0)}</p>
              <p className={`text-xs font-bold ${(r.difference ?? 0) < 0 ? "text-danger" : (r.difference ?? 0) > 0 ? "text-success" : "text-muted-foreground"}`}>
                Diferença: {formatCurrency(r.difference ?? 0)}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}