/**
 * PIX estático (BR Code / EMV) — mesmo modelo usado na loja de vasilhas:
 * o QR é gerado no navegador a partir da chave cadastrada, sem gateway.
 * A confirmação é feita pelo estabelecimento (balcão/painel admin).
 */

import { prisma } from "@/lib/prisma";

export type PixKeyType = "EMAIL" | "CPF" | "CNPJ" | "PHONE" | "RANDOM";

export type StaticPixConfig = {
  key: string;
  keyType: PixKeyType;
  receiverName: string;
  city: string;
  discountPercent: number;
};

const GUI = "br.gov.bcb.pix";

/** Normaliza para ASCII: o BR Code não aceita acentos nem caracteres especiais. */
function ascii(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim();
}

function field(id: string, value: string) {
  const v = ascii(value);
  if (!v) return "";
  return `${id}${String(v.length).padStart(2, "0")}${v}`;
}

/** CRC16/CCITT-FALSE exigido pelo padrão BR Code. */
export function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function normalizePixKey(key: string, keyType: PixKeyType) {
  const value = ascii(key);
  if (keyType === "EMAIL") return value.toLowerCase();
  if (keyType === "RANDOM") return value;
  return value.replace(/\D/g, "");
}

export function buildStaticPixPayload(input: {
  key: string;
  keyType: PixKeyType;
  receiverName: string;
  city: string;
  amount: number;
  txid: string;
}): string {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error("Valor do PIX inválido.");
  }

  const key = normalizePixKey(input.key, input.keyType).slice(0, 77);
  if (!key) throw new Error("Chave PIX não configurada.");

  const merchantAccount = field("00", GUI) + field("01", key);
  const txid = ascii(input.txid).slice(0, 25) || "***";

  // 00: payload format indicator; 26: merchant account; 52: category code;
  // 53: currency (BRL); 54: amount; 58: country; 59/60: merchant; 62: txid; 63: CRC
  const payload =
    "000201" +
    field("26", merchantAccount) +
    "52040000" +
    "5303986" +
    field("54", input.amount.toFixed(2)) +
    "5802BR" +
    field("59", ascii(input.receiverName).slice(0, 25) || "LOJA") +
    field("60", ascii(input.city).slice(0, 15) || "BRASIL") +
    field("62", field("05", txid)) +
    "6304";

  return payload + crc16(payload);
}

export type PixSettingsView = StaticPixConfig & { configured: boolean };

type PixSource = {
  key: string | null | undefined;
  keyType: string | null | undefined;
  receiverName: string | null | undefined;
  city: string | null | undefined;
  discountPercent: number | string | null | undefined;
};

/** Banco é a fonte autoritativa; env é mantido como fallback para instalações antigas. */
async function readPixSource(): Promise<PixSource> {
  const saved = await prisma.pixSettings
    .findUnique({ where: { id: "default" } })
    .catch(() => null);
  if (saved?.key?.trim()) return saved;

  return {
    key: process.env.PIX_KEY,
    keyType: process.env.PIX_KEY_TYPE,
    receiverName: process.env.PIX_RECEIVER_NAME,
    city: process.env.PIX_CITY,
    discountPercent: process.env.PIX_DISCOUNT_PERCENT,
  };
}

function normalize(source: PixSource): StaticPixConfig {
  const rawType = (source.keyType ?? "EMAIL").toUpperCase();
  const keyType: PixKeyType = (["EMAIL", "CPF", "CNPJ", "PHONE", "RANDOM"] as const).includes(
    rawType as PixKeyType
  )
    ? (rawType as PixKeyType)
    : "EMAIL";
  const discount = Number(source.discountPercent ?? 0);
  return {
    key: source.key?.trim() ?? "",
    keyType,
    receiverName: source.receiverName?.trim() ?? "",
    city: source.city?.trim() ?? "",
    discountPercent: Number.isFinite(discount) && discount > 0 ? Math.min(discount, 100) : 0,
  };
}

/** Valores atuais do PIX, para exibição no painel administrativo. */
export async function readPixSettings(): Promise<PixSettingsView> {
  const config = normalize(await readPixSource());
  return { ...config, configured: Boolean(config.key) };
}

/** Configuração ativa do PIX estático (banco ou variáveis de ambiente). */
export async function getStaticPixConfig(): Promise<StaticPixConfig | null> {
  const config = normalize(await readPixSource());
  return config.key ? config : null;
}
