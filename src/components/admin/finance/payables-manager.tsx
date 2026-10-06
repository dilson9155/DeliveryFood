"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Receipt,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Filter,
  Wallet,
  Trash2,
  FileText,
  Banknote,
  CreditCard,
  QrCode,
  ArrowRightLeft,
  Barcode,
  CircleDollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createPayableAction,
  payInstallmentAction,
  cancelInstallmentAction,
  cancelPayableAction,
} from "@/app/actions/finance";
import {
  generateInstallments,
  defaultFirstDueDate,
  installmentLabel,
  daysOverdue,
} from "@/lib/installments";
import type {
  BillCategory,
  InstallmentFrequency,
  InstallmentStatus,
  PayableMethod,
} from "@prisma/client";

// ============== Tipos ==============
type Installment = {
  id: string;
  number: number;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidAt: string | null;
  paymentMethod: PayableMethod | null;
  status: InstallmentStatus;
  notes: string | null;
};

type Payable = {
  id: string;
  description: string;
  supplier: string | null;
  category: BillCategory;
  totalAmount: number;
  paidAmount: number;
  issueDate: string;
  notes: string | null;
  paidAt: string | null;
  installments: Installment[];
  createdBy: { name: string };
};

// ============== Constantes ==============
const CATEGORY_LABEL: Record<BillCategory, string> = {
  SUPPLIER: "Fornecedor",
  EMPLOYEE: "Funcionário",
  RENT: "Aluguel",
  ENERGY: "Energia",
  WATER: "Água",
  INTERNET: "Internet",
  TAX: "Impostos",
  MARKETING: "Marketing",
  MAINTENANCE: "Manutenção",
  OTHER: "Outros",
};

const FREQUENCY_LABEL: Record<InstallmentFrequency, string> = {
  WEEKLY: "Semanal",
  BIWEEKLY: "Quinzenal",
  MONTHLY: "Mensal",
  QUARTERLY: "Trimestral",
};

const METHOD_ICON: Record<PayableMethod, React.ReactNode> = {
  CASH: <Banknote className="h-4 w-4" />,
  CARD: <CreditCard className="h-4 w-4" />,
  PIX: <QrCode className="h-4 w-4" />,
  BANK_TRANSFER: <ArrowRightLeft className="h-4 w-4" />,
  BOLETO: <Barcode className="h-4 w-4" />,
  OTHER: <CircleDollarSign className="h-4 w-4" />,
};

const METHOD_LABEL: Record<PayableMethod, string> = {
  CASH: "Dinheiro",
  CARD: "Cartão",
  PIX: "PIX",
  BANK_TRANSFER: "Transferência",
  BOLETO: "Boleto",
  OTHER: "Outro",
};

function installmentStatus(i: Installment): {
  tone: "default" | "success" | "warning" | "danger" | "muted";
  label: string;
} {
  if (i.status === "CANCELLED") return { tone: "muted", label: "Cancelada" };
  if (i.status === "PAID") return { tone: "success", label: "Paga" };
  if (i.status === "PARTIALLY_PAID") return { tone: "warning", label: "Parcial" };
  const overdueDays = daysOverdue(new Date(i.dueDate));
  if (overdueDays > 0) {
    return { tone: "danger", label: `${overdueDays}d vencido` };
  }
  return { tone: "default", label: "Pendente" };
}

// ============== Componente principal ==============
export function PayablesManager({
  payables: initial,
  canManage,
}: {
  payables: Payable[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [payables, setPayables] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "PAID" | "OVERDUE">(
    "OPEN"
  );

  // Cálculos resumo
  const summary = useMemo(() => {
    const today = new Date();
    let totalOpen = 0;
    let totalPaid = 0;
    let totalOverdue = 0;
    let overdueCount = 0;
    let pendingCount = 0;
    payables.forEach((p) => {
      totalPaid += p.paidAmount;
      const remaining = p.totalAmount - p.paidAmount;
      totalOpen += remaining;
      p.installments.forEach((i) => {
        if (i.status === "PENDING" || i.status === "PARTIALLY_PAID") {
          if (new Date(i.dueDate) < today) {
            totalOverdue += i.amount - i.paidAmount;
            overdueCount++;
          } else {
            pendingCount++;
          }
        }
      });
    });
    return { totalOpen, totalPaid, totalOverdue, overdueCount, pendingCount };
  }, [payables]);

  const filtered = useMemo(() => {
    const today = new Date();
    if (statusFilter === "ALL") return payables;
    if (statusFilter === "PAID") {
      return payables.filter((p) => p.paidAmount >= p.totalAmount - 0.001);
    }
    if (statusFilter === "OVERDUE") {
      return payables.filter((p) =>
        p.installments.some(
          (i) =>
            (i.status === "PENDING" || i.status === "PARTIALLY_PAID") &&
            new Date(i.dueDate) < today
        )
      );
    }
    return payables.filter((p) => p.paidAmount < p.totalAmount - 0.001);
  }, [payables, statusFilter]);

  function handleCreate(formData: {
    description: string;
    supplier: string;
    category: BillCategory;
    totalAmount: number;
    installmentsCount: number;
    frequency: InstallmentFrequency;
    firstDueDate: Date;
    notes: string;
  }) {
    startTransition(async () => {
      const res = await createPayableAction({
        ...formData,
        supplier: formData.supplier || null,
        notes: formData.notes || null,
        issueDate: new Date(),
      });
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Conta a pagar criada.");
      setShowForm(false);
      router.refresh();
    });
  }

  function handlePay(data: {
    installmentId: string;
    amount: number;
    paymentMethod: PayableMethod;
    notes: string;
    forceEarly?: boolean;
  }) {
    startTransition(async () => {
      const res = await payInstallmentAction(data);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      const remaining = res.remaining ?? 0;
      show(
        "success",
        remaining <= 0.01
          ? "Parcela quitada."
          : `Pagamento parcial registrado (saldo R$ ${remaining.toFixed(2)}).`
      );
      router.refresh();
    });
  }

  function handleCancel(installmentId: string) {
    if (!confirm("Cancelar esta parcela?")) return;
    startTransition(async () => {
      const res = await cancelInstallmentAction(installmentId);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Parcela cancelada.");
      router.refresh();
    });
  }

  function handleCancelPayable(payableId: string) {
    if (!confirm("Cancelar esta conta? Esta ação não pode ser desfeita.")) return;
    startTransition(async () => {
      const res = await cancelPayableAction(payableId);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Conta cancelada.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
            <Wallet className="h-6 w-6 text-brand-600" />
            Contas a pagar
          </h1>
          <p className="text-sm text-muted-foreground">
            Gerencie dívidas, parcelas e pagamentos. Pagamento só é possível a
            partir da data de vencimento (exige confirmação se antecipado).
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nova conta
          </Button>
        )}
      </div>

      {/* Cards resumo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="Em aberto"
          value={summary.totalOpen}
          tone="warning"
          icon={<Receipt className="h-4 w-4" />}
        />
        <SummaryCard
          label="Vencido"
          value={summary.totalOverdue}
          tone="danger"
          icon={<AlertCircle className="h-4 w-4" />}
          subtitle={`${summary.overdueCount} parcela(s)`}
        />
        <SummaryCard
          label="A pagar no prazo"
          value={summary.totalOpen - summary.totalOverdue}
          tone="default"
          icon={<CalendarClock className="h-4 w-4" />}
          subtitle={`${summary.pendingCount} parcela(s)`}
        />
        <SummaryCard
          label="Total pago"
          value={summary.totalPaid}
          tone="success"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {(["OPEN", "OVERDUE", "PAID", "ALL"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-brand-600 text-white"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {s === "OPEN" && "Em aberto"}
            {s === "OVERDUE" && "Vencidos"}
            {s === "PAID" && "Pagos"}
            {s === "ALL" && "Todos"}
          </button>
        ))}
      </div>

      {showForm && canManage && (
        <PayableForm
          onClose={() => setShowForm(false)}
          onSubmit={handleCreate}
          isPending={isPending}
        />
      )}

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {statusFilter === "OPEN" && "Nenhuma conta em aberto."}
          {statusFilter === "OVERDUE" && "Nenhum vencimento."}
          {statusFilter === "PAID" && "Nenhum pagamento registrado."}
          {statusFilter === "ALL" && "Nada por aqui ainda."}
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const isOpen = p.paidAmount < p.totalAmount - 0.001;
            const progress = Math.min(100, (p.paidAmount / p.totalAmount) * 100);
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{p.description}</p>
                      <Badge tone="default">{CATEGORY_LABEL[p.category]}</Badge>
                      {!isOpen && (
                        <Badge tone="success">
                          <CheckCircle2 className="h-3 w-3" /> Quitado
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {p.supplier ? `Fornecedor: ${p.supplier} · ` : ""}
                      Emitido em {formatDate(p.issueDate)} · por {p.createdBy.name}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-sm">
                      <span className="font-bold">{formatCurrency(p.totalAmount)}</span>
                      {isOpen && p.paidAmount > 0 && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-success">
                            Pago: {formatCurrency(p.paidAmount)}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-warning">
                            Restante: {formatCurrency(p.totalAmount - p.paidAmount)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          isOpen ? "bg-warning" : "bg-success"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setExpandedId(expandedId === p.id ? null : p.id)
                      }
                    >
                      {p.installments.length} parcela(s)
                      {expandedId === p.id ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {isOpen && canManage && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancelPayable(p.id)}
                        disabled={isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger" />
                      </Button>
                    )}
                  </div>
                </div>
                {expandedId === p.id && (
                  <div className="border-t border-border bg-muted/20 p-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs uppercase text-muted-foreground">
                          <th className="py-2 text-left font-medium">#</th>
                          <th className="py-2 text-left font-medium">Vencimento</th>
                          <th className="py-2 text-right font-medium">Valor</th>
                          <th className="py-2 text-right font-medium">Pago</th>
                          <th className="py-2 text-center font-medium">Status</th>
                          <th className="py-2 text-right font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.installments.map((i) => {
                          const st = installmentStatus(i);
                          return (
                            <tr
                              key={i.id}
                              className="border-t border-border/60"
                            >
                              <td className="py-2 text-muted-foreground">
                                {installmentLabel(i.number, p.installments.length)}
                              </td>
                              <td className="py-2">{formatDate(i.dueDate)}</td>
                              <td className="py-2 text-right font-medium">
                                {formatCurrency(i.amount)}
                              </td>
                              <td className="py-2 text-right">
                                {i.paidAmount > 0 ? (
                                  <span className="text-success">
                                    {formatCurrency(i.paidAmount)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-2 text-center">
                                <Badge tone={st.tone}>{st.label}</Badge>
                              </td>
                              <td className="py-2 text-right">
                                {i.status === "PENDING" ||
                                i.status === "PARTIALLY_PAID" ? (
                                  <PayButton
                                    inst={i}
                                    isPending={isPending}
                                    onPay={handlePay}
                                    onCancel={() => handleCancel(i.id)}
                                  />
                                ) : i.status === "PAID" ? (
                                  i.paymentMethod && (
                                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                      {METHOD_ICON[i.paymentMethod]}
                                      {METHOD_LABEL[i.paymentMethod]}
                                    </span>
                                  )
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {p.notes && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        <strong>Obs:</strong> {p.notes}
                      </p>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============== Subcomponentes ==============

function SummaryCard({
  label,
  value,
  tone,
  icon,
  subtitle,
}: {
  label: string;
  value: number;
  tone: "default" | "success" | "warning" | "danger";
  icon: React.ReactNode;
  subtitle?: string;
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
        <span className={toneClass}>{icon}</span>
        {label}
      </div>
      <p className={`mt-1 text-lg font-extrabold ${toneClass}`}>
        {formatCurrency(value)}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      )}
    </Card>
  );
}

function PayableForm({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void;
  onSubmit: (data: {
    description: string;
    supplier: string;
    category: BillCategory;
    totalAmount: number;
    installmentsCount: number;
    frequency: InstallmentFrequency;
    firstDueDate: Date;
    notes: string;
  }) => void;
  isPending: boolean;
}) {
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [category, setCategory] = useState<BillCategory>("SUPPLIER");
  const [totalAmount, setTotalAmount] = useState("");
  const [installmentsCount, setInstallmentsCount] = useState(1);
  const [frequency, setFrequency] = useState<InstallmentFrequency>("MONTHLY");
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const d = defaultFirstDueDate();
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");

  // Preview das parcelas
  const preview = useMemo(() => {
    const amount = parseFloat(totalAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || installmentsCount < 1) return [];
    try {
      return generateInstallments({
        totalAmount: amount,
        installmentsCount,
        firstDueDate: new Date(firstDueDate),
        frequency,
      });
    } catch {
      return [];
    }
  }, [totalAmount, installmentsCount, frequency, firstDueDate]);

  const totalNum = parseFloat(totalAmount.replace(",", "."));
  const isValid =
    description.trim().length >= 2 &&
    Number.isFinite(totalNum) &&
    totalNum > 0 &&
    installmentsCount >= 1 &&
    installmentsCount <= 48;

  return (
    <Card className="p-5">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold">
        <Plus className="h-4 w-4 text-brand-600" />
        Nova conta a pagar
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Descrição" required>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex.: Coca-Cola 2L - lote mensal"
            className={inputCls}
            required
          />
        </Field>
        <Field label="Fornecedor">
          <input
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="Nome do fornecedor (opcional)"
            className={inputCls}
          />
        </Field>
        <Field label="Categoria">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as BillCategory)}
            className={inputCls}
          >
            {(Object.keys(CATEGORY_LABEL) as BillCategory[]).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Valor total (R$)" required>
          <input
            type="text"
            inputMode="decimal"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            placeholder="0,00"
            className={`${inputCls} font-bold`}
          />
        </Field>
        <Field label="Nº de parcelas">
          <input
            type="number"
            min={1}
            max={48}
            value={installmentsCount}
            onChange={(e) => setInstallmentsCount(parseInt(e.target.value) || 1)}
            className={inputCls}
          />
        </Field>
        <Field label="Frequência">
          <select
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as InstallmentFrequency)}
            className={inputCls}
          >
            {(Object.keys(FREQUENCY_LABEL) as InstallmentFrequency[]).map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="1º vencimento">
          <input
            type="date"
            value={firstDueDate}
            onChange={(e) => setFirstDueDate(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anotações internas (opcional)"
            className={inputCls}
          />
        </Field>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preview das parcelas
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {preview.slice(0, 8).map((d) => (
              <div
                key={d.number}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold">
                    {installmentLabel(d.number, preview.length)}
                  </span>
                  <span className="font-bold">{formatCurrency(d.amount)}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatDate(d.dueDate.toISOString())}
                </div>
              </div>
            ))}
            {preview.length > 8 && (
              <div className="rounded-lg border border-dashed border-border bg-background px-2.5 py-1.5 text-center text-xs text-muted-foreground">
                +{preview.length - 8} parcela(s)
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancelar
        </Button>
        <Button
          variant="success"
          className="flex-1"
          disabled={!isValid || isPending}
          onClick={() =>
            onSubmit({
              description,
              supplier,
              category,
              totalAmount: totalNum,
              installmentsCount,
              frequency,
              firstDueDate: new Date(firstDueDate),
              notes,
            })
          }
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Criar conta
        </Button>
      </div>
    </Card>
  );
}

function PayButton({
  inst,
  isPending,
  onPay,
  onCancel,
}: {
  inst: Installment;
  isPending: boolean;
  onPay: (data: {
    installmentId: string;
    amount: number;
    paymentMethod: PayableMethod;
    notes: string;
    forceEarly?: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const remaining = inst.amount - inst.paidAmount;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(inst.dueDate);
  due.setHours(0, 0, 0, 0);
  const isEarly = due.getTime() > today.getTime();

  return (
    <>
      <Button
        size="sm"
        variant="success"
        onClick={() => setShowModal(true)}
        disabled={isPending}
        className="h-7 px-2 text-xs"
      >
        <CheckCircle2 className="h-3 w-3" />
        {inst.paidAmount > 0 ? "Pagar" : "Pagar"}
      </Button>
      {showModal && (
        <PayModal
          inst={inst}
          remaining={remaining}
          isEarly={isEarly}
          isPending={isPending}
          onClose={() => setShowModal(false)}
          onCancel={() => {
            setShowModal(false);
            onCancel();
          }}
          onPay={(data) => {
            onPay(data);
            setShowModal(false);
          }}
        />
      )}
    </>
  );
}

function PayModal({
  inst,
  remaining,
  isEarly,
  isPending,
  onClose,
  onCancel,
  onPay,
}: {
  inst: Installment;
  remaining: number;
  isEarly: boolean;
  isPending: boolean;
  onClose: () => void;
  onCancel: () => void;
  onPay: (data: {
    installmentId: string;
    amount: number;
    paymentMethod: PayableMethod;
    notes: string;
    forceEarly?: boolean;
  }) => void;
}) {
  const [amount, setAmount] = useState(remaining.toFixed(2).replace(".", ","));
  const [paymentMethod, setPaymentMethod] = useState<PayableMethod>("PIX");
  const [notes, setNotes] = useState("");
  const [forceEarly, setForceEarly] = useState(false);

  const amountNum = parseFloat(amount.replace(",", "."));
  const valid =
    Number.isFinite(amountNum) && amountNum > 0 && amountNum <= remaining + 0.01;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background shadow-2xl animate-fade-in sm:rounded-3xl">
        <div className="border-b border-border p-5">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <CheckCircle2 className="h-4 w-4 text-success" />
            Pagar parcela {installmentLabel(inst.number, 0)}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Vencimento: {formatDate(inst.dueDate)} · Valor:{" "}
            {formatCurrency(inst.amount)}
            {inst.paidAmount > 0 && (
              <> · Pago: {formatCurrency(inst.paidAmount)}</>
            )}
          </p>
        </div>
        <div className="space-y-4 p-5">
          {isEarly && (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
              <p className="font-bold text-warning">⚠️ Pagamento antecipado</p>
              <p className="mt-1 text-muted-foreground">
                Esta parcela vence em {formatDate(inst.dueDate)}. Marque
                abaixo se realmente deseja pagar agora.
              </p>
              <label className="mt-2 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={forceEarly}
                  onChange={(e) => setForceEarly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border text-brand-600"
                />
                Confirmar pagamento antecipado
              </label>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Valor a pagar
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputCls} text-lg font-bold`}
            />
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setAmount(remaining.toFixed(2).replace(".", ","))}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              >
                Saldo total
              </button>
              <button
                type="button"
                onClick={() => setAmount((remaining / 2).toFixed(2).replace(".", ","))}
                className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              >
                50%
              </button>
            </div>
            {inst.paidAmount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Saldo restante: <strong>{formatCurrency(remaining)}</strong>
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Forma de pagamento
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(METHOD_LABEL) as PayableMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaymentMethod(m)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium transition-colors ${
                    paymentMethod === m
                      ? "border-brand-600 bg-brand-50"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  {METHOD_ICON[m]}
                  {METHOD_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Observação (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Nº da NF, comprovante etc."
              className={inputCls}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
              disabled={isPending}
              className="flex-1"
            >
              <XCircle className="h-4 w-4" />
              Cancelar parcela
            </Button>
            <Button
              variant="success"
              onClick={() =>
                onPay({
                  installmentId: inst.id,
                  amount: amountNum,
                  paymentMethod,
                  notes,
                  forceEarly: forceEarly || undefined,
                })
              }
              disabled={!valid || isPending || (isEarly && !forceEarly)}
              className="flex-1"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Confirmar
            </Button>
          </div>
          <button
            onClick={onClose}
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40";

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
    </div>
  );
}