/** Utilitários de data para o cardápio do dia (fuso do estabelecimento). */

export const MENU_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Data de hoje no fuso de Brasília, no formato yyyy-MM-dd usado pelo banco. */
export function businessDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Rótulo amigável exibido ao cliente e no painel administrativo. */
export function menuDateLabel(date: string): string {
  if (!MENU_DATE_PATTERN.test(date)) return date;
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function menuIsSoldOut(meal: { availableQty: number | null }): boolean {
  return meal.availableQty !== null && meal.availableQty <= 0;
}

export function menuRemainingLabel(availableQty: number | null): string {
  if (availableQty === null) return "Sem limite";
  if (availableQty <= 0) return "Esgotado";
  return `${availableQty} disponível(is)`;
}
