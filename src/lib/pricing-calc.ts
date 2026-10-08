import { roundMoney } from "@/lib/format";

/**
 * Cálculos da tabela de precificação (custo-plus / markon).
 *
 * Fórmulas:
 *  - Custo real      = (custo de compra + frete + outros custos) × (1 + custo adicional %)
 *  - Preço sugerido  = Custo real ÷ [1 − (margem + impostos + comissão + cartão + marketplace)/100]
 *  - Preço mínimo    = maior entre [sugerido × (1 − desconto máximo)] e
 *                      [preço de equilíbrio = Custo real ÷ (1 − (impostos + comissão + cartão + marketplace)/100)]
 *  - Markup          = Preço sugerido ÷ Custo real
 *  - Lucro unitário  = preço − custo real − taxas(% do preço)        [calculado no preço atual e no sugerido]
 *  - Margem real %   = lucro ÷ preço × 100
 *  - Ponto de equil. = custo fixo ÷ margem de contribuição por unidade
 *                      (margem de contribuição = preço atual − custo real − taxas sobre o preço atual)
 */

export type CostFields = {
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
};

export type CostCalc = {
  /** Custo real por unidade */
  realCost: number;
  /** Soma das taxas que incidem sobre o preço (impostos+comissão+cartão+marketplace) */
  feeRatio: number;
  /** Preço sugerido (null quando a soma das % ≥ 100 → fórmula inválida) */
  suggestedPrice: number | null;
  /** Preço de equilíbrio (margem desejada = 0) */
  breakEvenPrice: number | null;
  /** Preço mínimo aceitável */
  minPrice: number | null;
  /** Markup (sugerido ÷ custo real) */
  markup: number | null;
  /** Lucro unitário no preço sugerido */
  suggestedProfit: number | null;
  /** Margem % no preço sugerido */
  suggestedMarginPct: number | null;
  /** Lucro unitário no preço de venda atual */
  currentProfit: number | null;
  /** Margem real % no preço de venda atual */
  currentMarginPct: number | null;
  /** Ponto de equilíbrio em unidades (custo fixo ÷ margem de contribuição) */
  breakEvenQty: number | null;
  /** true quando a soma (margem + taxas) impede o cálculo do preço sugerido */
  invalid: boolean;
  /** Custo informado? (para exibir "—" quando a ficha está vazia) */
  hasCost: boolean;
};

const num = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Converte campos de entrada no cálculo completo. */
export function calculatePricing(c: CostFields, currentPrice: number): CostCalc {
  const base = num(c.purchaseCost) + num(c.freight) + num(c.otherCosts);
  const hasCost = base > 0;
  const realCost = roundMoney(base * (1 + num(c.additionalCostPct) / 100));

  const feeRatio =
    (num(c.taxPct) + num(c.commissionPct) + num(c.cardFeePct) + num(c.marketplaceFeePct)) / 100;
  const marginRatio = num(c.desiredMarginPct) / 100;

  const sugDen = 1 - feeRatio - marginRatio;
  const beDen = 1 - feeRatio;
  const invalid = hasCost && sugDen <= 0.0001;

  const suggestedPrice =
    hasCost && sugDen > 0.0001 ? roundMoney(realCost / sugDen) : null;
  const breakEvenPrice = hasCost && beDen > 0.0001 ? roundMoney(realCost / beDen) : null;

  const discountPrice =
    suggestedPrice !== null
      ? roundMoney(suggestedPrice * (1 - num(c.maxDiscountPct) / 100))
      : null;

  let minPrice: number | null = null;
  if (discountPrice !== null && breakEvenPrice !== null) {
    minPrice = Math.max(discountPrice, breakEvenPrice);
  } else {
    minPrice = discountPrice ?? breakEvenPrice;
  }

  const markup =
    suggestedPrice !== null && realCost > 0 ? suggestedPrice / realCost : null;

  const suggestedProfit =
    suggestedPrice !== null
      ? roundMoney(suggestedPrice - realCost - suggestedPrice * feeRatio)
      : null;
  const suggestedMarginPct =
    suggestedProfit !== null && suggestedPrice
      ? (suggestedProfit / suggestedPrice) * 100
      : null;

  const currentProfit = hasCost
    ? roundMoney(currentPrice - realCost - currentPrice * feeRatio)
    : null;
  const currentMarginPct =
    currentProfit !== null && currentPrice > 0 ? (currentProfit / currentPrice) * 100 : null;

  const contribution = currentPrice - realCost - currentPrice * feeRatio;
  const breakEvenQty =
    hasCost && num(c.fixedCost) > 0 && contribution > 0
      ? Math.ceil(num(c.fixedCost) / contribution)
      : null;

  return {
    realCost,
    feeRatio,
    suggestedPrice,
    breakEvenPrice,
    minPrice,
    markup,
    suggestedProfit,
    suggestedMarginPct,
    currentProfit,
    currentMarginPct,
    breakEvenQty,
    invalid,
    hasCost,
  };
}

/** Formata markup como "2,45×" */
export function formatMarkup(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2).replace(".", ",")}×`;
}

/** Formata percentual como "12,5%" */
export function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")}%`;
}