"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType } from "@prisma/client";
import type { PixKeyType } from "@/lib/pix";

type PixSettingsInput = {
  key: string;
  keyType: PixKeyType;
  receiverName: string;
  city: string;
  discountPercent: number | string;
};

type Result = { ok: true; needsRestart: boolean } | { ok: false; error: string };

type PixEnvKey =
  | "PIX_KEY"
  | "PIX_KEY_TYPE"
  | "PIX_RECEIVER_NAME"
  | "PIX_CITY"
  | "PIX_DISCOUNT_PERCENT";

const VALID_TYPES: PixKeyType[] = ["EMAIL", "CPF", "CNPJ", "PHONE", "RANDOM"];

function clean(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (/[\r\n\0]/.test(text)) throw new Error("Não use quebras de linha nos campos.");
  return text.trim().slice(0, max);
}

export async function savePixSettingsAction(input: PixSettingsInput): Promise<Result> {
  const session = await auth();
  const s = session as unknown as {
    user?: {
      id: string;
      userType: UserType;
      role: SessionUser["role"];
      name?: string | null;
      email?: string | null;
    };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const user: SessionUser = {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role,
    name: s.user.name,
    email: s.user.email,
  };
  if (!can(user, "settings.manage")) {
    return { ok: false, error: "Você não tem permissão para configurar o PIX." };
  }

  let values: Record<PixEnvKey, string>;
  try {
    const keyType = clean(input.keyType, 10).toUpperCase() as PixKeyType;
    if (!VALID_TYPES.includes(keyType)) throw new Error("Tipo de chave PIX inválido.");
    const discount = Number(input.discountPercent);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw new Error("O desconto deve estar entre 0 e 100%.");
    }

    values = {
      PIX_KEY: clean(input.key, 140),
      PIX_KEY_TYPE: keyType,
      PIX_RECEIVER_NAME: clean(input.receiverName, 40),
      PIX_CITY: clean(input.city, 40),
      PIX_DISCOUNT_PERCENT: discount.toFixed(2).replace(/\.00$/, ""),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Dados inválidos." };
  }

  // Persiste no banco: em Vercel o sistema de arquivos é somente leitura e
  // variáveis de ambiente não podem ser alteradas em tempo de execução.
  try {
    await prisma.pixSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        key: values.PIX_KEY,
        keyType: values.PIX_KEY_TYPE,
        receiverName: values.PIX_RECEIVER_NAME,
        city: values.PIX_CITY,
        discountPercent: Number(values.PIX_DISCOUNT_PERCENT),
      },
      update: {
        key: values.PIX_KEY,
        keyType: values.PIX_KEY_TYPE,
        receiverName: values.PIX_RECEIVER_NAME,
        city: values.PIX_CITY,
        discountPercent: Number(values.PIX_DISCOUNT_PERCENT),
      },
    });
  } catch (error) {
    console.error("Falha ao salvar configuração PIX:", error);
    return { ok: false, error: "Não foi possível salvar a configuração do PIX." };
  }

  await audit({
    userId: user.id,
    action: "SETTINGS_CHANGE",
    resource: "pix",
    entityId: "default",
    details: `PIX configurado (tipo ${values.PIX_KEY_TYPE}, desconto ${values.PIX_DISCOUNT_PERCENT}%).`,
  });

  revalidatePath("/admin/configuracoes");
  revalidatePath("/");

  return { ok: true, needsRestart: false };
}
