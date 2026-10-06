"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { generateInstallments, type InstallmentDraft } from "@/lib/installments";
import {
  BillCategory,
  InstallmentFrequency,
  InstallmentStatus,
  PayableMethod,
  PayableType,
} from "@prisma/client";
import { z } from "zod";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ============== Helpers ==============
async function requireFinance(permission: "finance.view" | "finance.manage") {
  const session = await auth();
  const s = session as unknown as {
    user?: { id: string; userType: string; role: string | null; name?: string | null };
  };
  if (!s?.user || s.user.userType !== "EMPLOYEE") {
    return { ok: false as const, error: "Acesso restrito a colaboradores." };
  }
  const user = {
    id: s.user.id,
    userType: "EMPLOYEE" as const,
    role: (s.user.role ?? null) as
      | "ADMIN" | "MANAGER" | "ATTENDANT" | "KITCHEN" | "CASHIER" | "MOTOBOY" | null,
    name: s.user.name ?? null,
    email: undefined as string | null | undefined,
  };
  if (!can(user, permission)) {
    return { ok: false as const, error: "Você não tem permissão para essa ação." };
  }
  return { ok: true as const, user };
}

// ============== Payable (Contas a Pagar) ==============

const payableSchema = z.object({
  description: z.string().min(2, "Informe a descrição").max(200),
  supplier: z.string().max(120).optional().nullable(),
  category: z.nativeEnum(BillCategory),
  totalAmount: z.number().positive("Valor deve ser maior que zero"),
  issueDate: z.date().optional(),
  notes: z.string().max(500).optional().nullable(),
  firstDueDate: z.date(),
  installmentsCount: z.number().int().min(1).max(48),
  frequency: z.nativeEnum(InstallmentFrequency),
});

export async function createPayableAction(
  input: z.infer<typeof payableSchema>
): Promise<ActionResult<{ payableId: string }>> {
  const guard = await requireFinance("finance.manage");
  if (!guard.ok) return guard;
  const parsed = payableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const drafts: InstallmentDraft[] = generateInstallments({
    totalAmount: parsed.data.totalAmount,
    installmentsCount: parsed.data.installmentsCount,
    firstDueDate: parsed.data.firstDueDate,
    frequency: parsed.data.frequency,
  });

  const payable = await prisma.payable.create({
    data: {
      description: parsed.data.description,
      supplier: parsed.data.supplier ?? null,
      category: parsed.data.category,
      totalAmount: parsed.data.totalAmount,
      issueDate: parsed.data.issueDate ?? new Date(),
      notes: parsed.data.notes ?? null,
      createdById: guard.user.id,
      installments: {
        create: drafts.map((d) => ({
          parentType: PayableType.PAYABLE,
          number: d.number,
          amount: d.amount,
          dueDate: d.dueDate,
        })),
      },
    },
    include: { installments: true },
  });

  await audit({
    userId: guard.user.id,
    action: "CREATE",
    resource: "payable",
    entityId: payable.id,
    details: `Conta a pagar criada: ${payable.description} (${drafts.length}x ${parsed.data.frequency})`,
  });

  revalidatePath("/admin/financeiro/pagar");
  return { ok: true, payableId: payable.id };
}

export async function cancelPayableAction(
  payableId: string
): Promise<ActionResult> {
  const guard = await requireFinance("finance.manage");
  if (!guard.ok) return guard;

  const payable = await prisma.payable.findUnique({
    where: { id: payableId },
    include: { installments: true },
  });
  if (!payable) return { ok: false, error: "Conta não encontrada." };
  if (payable.installments.some((i) => i.paidAmount > 0)) {
    return {
      ok: false,
      error: "Não é possível cancelar conta que já possui pagamentos.",
    };
  }

  await prisma.$transaction([
    prisma.payable.update({
      where: { id: payableId },
      data: { notes: (payable.notes ?? "") + " [CANCELADA]" },
    }),
    prisma.installment.updateMany({
      where: { payableId, paidAmount: 0 },
      data: { status: InstallmentStatus.CANCELLED },
    }),
  ]);

  await audit({
    userId: guard.user.id,
    action: "UPDATE",
    resource: "payable",
    entityId: payableId,
    details: "Conta a pagar cancelada",
  });

  revalidatePath("/admin/financeiro/pagar");
  return { ok: true };
}

const payInstallmentSchema = z.object({
  installmentId: z.string().min(1),
  amount: z.number().positive("Valor deve ser maior que zero"),
  paymentMethod: z.nativeEnum(PayableMethod),
  paidAt: z.date().optional(),
  notes: z.string().max(300).optional().nullable(),
  /** Para pagar antecipado (antes da data) */
  forceEarly: z.boolean().optional(),
});

/** Dá baixa (pagamento) em uma parcela */
export async function payInstallmentAction(
  input: z.infer<typeof payInstallmentSchema>
): Promise<ActionResult<{ remaining: number }>> {
  const guard = await requireFinance("finance.view");
  if (!guard.ok) return guard;
  const parsed = payInstallmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const inst = await prisma.installment.findUnique({
    where: { id: parsed.data.installmentId },
  });
  if (!inst) return { ok: false, error: "Parcela não encontrada." };
  if (inst.status === InstallmentStatus.CANCELLED) {
    return { ok: false, error: "Esta parcela foi cancelada." };
  }
  if (inst.status === InstallmentStatus.PAID) {
    return { ok: false, error: "Esta parcela já foi paga." };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(inst.dueDate);
  due.setHours(0, 0, 0, 0);
  const isEarly = due.getTime() > today.getTime();

  if (isEarly && !parsed.data.forceEarly) {
    return {
      ok: false,
      error: `Esta parcela vence em ${due.toLocaleDateString("pt-BR")}. Marque "Pagamento antecipado" se realmente deseja pagar antes do vencimento.`,
    };
  }

  const remaining = inst.amount - inst.paidAmount;
  if (parsed.data.amount > remaining + 0.01) {
    return {
      ok: false,
      error: `Valor excede o saldo restante (R$ ${remaining.toFixed(2)}).`,
    };
  }

  const newPaidAmount = Math.round((inst.paidAmount + parsed.data.amount) * 100) / 100;
  const newStatus =
    newPaidAmount >= inst.amount - 0.001
      ? InstallmentStatus.PAID
      : InstallmentStatus.PARTIALLY_PAID;
  const paidAt = parsed.data.paidAt ?? new Date();

  // Atualiza Installment + soma em ParentOrder/Parent
  await prisma.$transaction(async (tx) => {
    await tx.installment.update({
      where: { id: inst.id },
      data: {
        paidAmount: newPaidAmount,
        paidAt: newStatus === InstallmentStatus.PAID ? paidAt : inst.paidAt,
        paymentMethod: parsed.data.paymentMethod,
        status: newStatus,
        notes: parsed.data.notes ?? inst.notes,
      },
    });
    if (inst.payableId) {
      const parent = await tx.payable.findUnique({
        where: { id: inst.payableId },
      });
      if (parent) {
        const newPaid = Math.round((parent.paidAmount + parsed.data.amount) * 100) / 100;
        const allPaid = newPaid >= parent.totalAmount - 0.001;
        await tx.payable.update({
          where: { id: parent.id },
          data: {
            paidAmount: newPaid,
            paidAt: allPaid ? paidAt : parent.paidAt,
          },
        });
      }
    } else if (inst.receivableId) {
      const parent = await tx.receivable.findUnique({
        where: { id: inst.receivableId },
      });
      if (parent) {
        const newPaid = Math.round((parent.paidAmount + parsed.data.amount) * 100) / 100;
        const allPaid = newPaid >= parent.totalAmount - 0.001;
        await tx.receivable.update({
          where: { id: parent.id },
          data: {
            paidAmount: newPaid,
            paidAt: allPaid ? paidAt : parent.paidAt,
          },
        });
      }
    }
  });

  await audit({
    userId: guard.user.id,
    action: "PAYMENT",
    resource: inst.payableId ? "payable" : "receivable",
    entityId: inst.id,
    details: `Pagamento de R$ ${parsed.data.amount.toFixed(2)} (${parsed.data.paymentMethod}) na parcela ${inst.number}${
      isEarly ? " — antecipado" : ""
    }`,
  });

  revalidatePath("/admin/financeiro/pagar");
  revalidatePath("/admin/financeiro/receber");
  revalidatePath("/admin/financeiro/livro-caixa");
  return {
    ok: true,
    remaining: Math.round((remaining - parsed.data.amount) * 100) / 100,
  };
}

/** Cancela uma parcela (caso ainda não paga) */
export async function cancelInstallmentAction(
  installmentId: string
): Promise<ActionResult> {
  const guard = await requireFinance("finance.manage");
  if (!guard.ok) return guard;

  const inst = await prisma.installment.findUnique({
    where: { id: installmentId },
  });
  if (!inst) return { ok: false, error: "Parcela não encontrada." };
  if (inst.paidAmount > 0) {
    return { ok: false, error: "Não é possível cancelar parcela já paga." };
  }

  await prisma.installment.update({
    where: { id: installmentId },
    data: { status: InstallmentStatus.CANCELLED },
  });

  await audit({
    userId: guard.user.id,
    action: "UPDATE",
    resource: "installment",
    entityId: installmentId,
    details: "Parcela cancelada",
  });

  revalidatePath("/admin/financeiro/pagar");
  revalidatePath("/admin/financeiro/receber");
  return { ok: true };
}

// ============== Receivable (Contas a Receber) ==============

const receivableSchema = z.object({
  description: z.string().min(2).max(200),
  customerId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  totalAmount: z.number().positive(),
  issueDate: z.date().optional(),
  notes: z.string().max(500).optional().nullable(),
  firstDueDate: z.date(),
  installmentsCount: z.number().int().min(1).max(48),
  frequency: z.nativeEnum(InstallmentFrequency),
});

export async function createReceivableAction(
  input: z.infer<typeof receivableSchema>
): Promise<ActionResult<{ receivableId: string }>> {
  const guard = await requireFinance("finance.view");
  if (!guard.ok) return guard;
  const parsed = receivableSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const drafts: InstallmentDraft[] = generateInstallments({
    totalAmount: parsed.data.totalAmount,
    installmentsCount: parsed.data.installmentsCount,
    firstDueDate: parsed.data.firstDueDate,
    frequency: parsed.data.frequency,
  });

  const receivable = await prisma.receivable.create({
    data: {
      description: parsed.data.description,
      customerId: parsed.data.customerId || null,
      orderId: parsed.data.orderId || null,
      totalAmount: parsed.data.totalAmount,
      issueDate: parsed.data.issueDate ?? new Date(),
      notes: parsed.data.notes ?? null,
      createdById: guard.user.id,
      installments: {
        create: drafts.map((d) => ({
          parentType: PayableType.RECEIVABLE,
          number: d.number,
          amount: d.amount,
          dueDate: d.dueDate,
        })),
      },
    },
    include: { installments: true },
  });

  await audit({
    userId: guard.user.id,
    action: "CREATE",
    resource: "receivable",
    entityId: receivable.id,
    details: `Conta a receber criada: ${receivable.description} (${drafts.length}x)`,
  });

  revalidatePath("/admin/financeiro/receber");
  return { ok: true, receivableId: receivable.id };
}

export async function cancelReceivableAction(
  receivableId: string
): Promise<ActionResult> {
  const guard = await requireFinance("finance.manage");
  if (!guard.ok) return guard;

  const receivable = await prisma.receivable.findUnique({
    where: { id: receivableId },
    include: { installments: true },
  });
  if (!receivable) return { ok: false, error: "Conta não encontrada." };
  if (receivable.installments.some((i) => i.paidAmount > 0)) {
    return {
      ok: false,
      error: "Não é possível cancelar conta que já possui recebimentos.",
    };
  }

  await prisma.$transaction([
    prisma.receivable.update({
      where: { id: receivableId },
      data: { notes: (receivable.notes ?? "") + " [CANCELADA]" },
    }),
    prisma.installment.updateMany({
      where: { receivableId, paidAmount: 0 },
      data: { status: InstallmentStatus.CANCELLED },
    }),
  ]);

  await audit({
    userId: guard.user.id,
    action: "UPDATE",
    resource: "receivable",
    entityId: receivableId,
    details: "Conta a receber cancelada",
  });

  revalidatePath("/admin/financeiro/receber");
  return { ok: true };
}