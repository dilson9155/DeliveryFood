/**
 * Geração de parcelas a partir de valor total + número de parcelas +
 * data de início + frequência.
 *
 * Arredonda o valor por parcela de modo que a soma sempre bata
 * com o total (a última parcela absorve a diferença de centavos).
 *
 * Sem dependência externa (date-fns não está no projeto). Usa apenas
 * APIs nativas de Date.
 */

import type { InstallmentFrequency } from "@prisma/client";

export type InstallmentDraft = {
  number: number;
  amount: number;
  dueDate: Date;
};

export type GenerateOptions = {
  totalAmount: number;
  installmentsCount: number;
  firstDueDate: Date;
  frequency: InstallmentFrequency;
};

/** Avança a data conforme a frequência */
function advanceDate(
  base: Date,
  frequency: InstallmentFrequency,
  count: number
): Date {
  const d = new Date(base);
  switch (frequency) {
    case "WEEKLY":
      d.setDate(d.getDate() + count * 7);
      break;
    case "BIWEEKLY":
      d.setDate(d.getDate() + count * 14);
      break;
    case "MONTHLY":
      d.setMonth(d.getMonth() + count);
      break;
    case "QUARTERLY":
      d.setMonth(d.getMonth() + count * 3);
      break;
  }
  return d;
}

/**
 * Gera N parcelas em que a soma é exatamente igual a totalAmount.
 * Estratégia: divide por N, arredonda para 2 casas. A diferença
 * de centavos é somada à última parcela.
 */
export function generateInstallments({
  totalAmount,
  installmentsCount,
  firstDueDate,
  frequency,
}: GenerateOptions): InstallmentDraft[] {
  if (installmentsCount < 1) {
    throw new Error("Número de parcelas deve ser >= 1");
  }
  if (totalAmount <= 0) {
    throw new Error("Valor total deve ser > 0");
  }

  const baseAmount = Math.floor((totalAmount * 100) / installmentsCount) / 100;
  const lastAmount =
    Math.round((totalAmount - baseAmount * (installmentsCount - 1)) * 100) / 100;

  const out: InstallmentDraft[] = [];
  for (let i = 0; i < installmentsCount; i++) {
    const dueDate = advanceDate(firstDueDate, frequency, i);
    out.push({
      number: i + 1,
      amount: i === installmentsCount - 1 ? lastAmount : baseAmount,
      dueDate,
    });
  }
  return out;
}

/** Helper para "primeiro dia do próximo mês" (úteis para mensal) */
export function defaultFirstDueDate(today = new Date()): Date {
  const d = new Date(today);
  d.setMonth(d.getMonth() + 1);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Helper: adicionar dias úteis (aproximação simples: pula sáb/dom) */
export function addBusinessDays(base: Date, days: number): Date {
  const result = new Date(base);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

/** Calcula idade (em dias) da parcela até hoje */
export function daysOverdue(dueDate: Date, today = new Date()): number {
  const ms = today.getTime() - dueDate.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** Helper: formata número de parcelas (1/12, 2/12...) */
export function installmentLabel(num: number, total: number): string {
  return `${num}/${total}`;
}