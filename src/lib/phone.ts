/** Normaliza qualquer formato de telefone brasileiro para 55DDDNNNNNNNNN. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Já vem com DDI 55 (12 ou 13 dígitos).
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }

  // Telefone brasileiro sem DDI (10 ou 11 dígitos).
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }

  // Outros formatos são assumidos como já contendo DDI.
  return digits;
}
