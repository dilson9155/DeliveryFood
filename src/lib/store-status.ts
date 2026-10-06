import { prisma } from "@/lib/prisma";
import type { BusinessHours, Settings } from "@prisma/client";

const DAY_LABELS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export type StoreContext = {
  settings: Settings;
  hours: BusinessHours[];
  open: boolean;
  statusMessage: string;
};

export async function getStoreContext(): Promise<StoreContext> {
  const [settings, hours] = await Promise.all([
    prisma.settings.findUnique({ where: { id: "default" } }),
    prisma.businessHours.findMany({ orderBy: { dayOfWeek: "asc" } }),
  ]);

  const fallbackSettings: Settings = {
    id: "default",
    storeName: "Meu Estabelecimento",
    logoUrl: null,
    cnpj: null,
    phone: null,
    whatsapp: null,
    email: null,
    address: null,
    number: null,
    complement: null,
    neighborhood: null,
    city: null,
    state: null,
    zipCode: null,
    prepTimeMinutes: 30,
    isManuallyOpen: null,
    receiptMessage: null,
    receiptFooter: null,
    printTemplateId: "thermal80",
    updatedAt: new Date(),
  };

  return {
    settings: settings ?? fallbackSettings,
    hours,
    ...computeStoreStatus(settings?.isManuallyOpen ?? null, hours),
  };
}

export function computeStoreStatus(
  override: boolean | null,
  hours: BusinessHours[]
): { open: boolean; statusMessage: string } {
  if (override != null) {
    return override
      ? { open: true, statusMessage: "Aberto agora" }
      : { open: false, statusMessage: "Estamos fechados no momento." };
  }

  const now = new Date();
  const today = now.getDay();
  const todayHours = hours.find((h) => h.dayOfWeek === today);

  if (!todayHours || !todayHours.open) {
    const next = findNextOpenDay(hours, today);
    return {
      open: false,
      statusMessage: next
        ? `Fechado hoje. Próximo horário: ${DAY_LABELS[next.dayOfWeek]} das ${next.openTime} às ${next.closeTime}.`
        : "Estamos fechados no momento.",
    };
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = toMinutes(todayHours.openTime);
  const closeMinutes = toMinutes(todayHours.closeTime);

  if (nowMinutes < openMinutes) {
    return {
      open: false,
      statusMessage: `Fechado no momento. Abrimos às ${todayHours.openTime}.`,
    };
  }
  if (nowMinutes >= closeMinutes) {
    const next = findNextOpenDay(hours, today);
    return {
      open: false,
      statusMessage: next
        ? `Fechado no momento. Próximo horário: ${DAY_LABELS[next.dayOfWeek]} das ${next.openTime} às ${next.closeTime}.`
        : "Estamos fechados no momento.",
    };
  }

  return { open: true, statusMessage: `Aberto até ${todayHours.closeTime}` };
}

function findNextOpenDay(hours: BusinessHours[], fromDay: number) {
  for (let i = 1; i <= 7; i++) {
    const day = (fromDay + i) % 7;
    const h = hours.find((x) => x.dayOfWeek === day);
    if (h && h.open) return h;
  }
  return null;
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}