"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { phoneSchema } from "@/lib/validations";
import { UserType } from "@prisma/client";
import { z } from "zod";
import { taxIdSchema } from "@/lib/validations";

type ActionResult = { ok: true } | { ok: false; error: string };

const profileSchema = z.object({
  name: z.string().min(2, "Informe seu nome").max(120),
  phone: phoneSchema,
  taxId: taxIdSchema.optional().nullable(),
  email: z
    .union([z.string().email("E-mail inválido"), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v.toLowerCase().trim() : null)),
  defaultObservation: z
    .union([z.string().max(500, "Observação muito longa (máx. 500 caracteres)"), z.null()])
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe sua senha atual"),
    newPassword: z.string().min(6, "A nova senha deve ter pelo menos 6 caracteres").max(72),
  });

export async function updateProfileAction(
  data: {
    name: string;
    phone: string;
    taxId?: string | null;
    email?: string | null;
    defaultObservation?: string | null;
  }
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.userType !== UserType.CUSTOMER) {
    return { ok: false, error: "Acesso restrito a clientes." };
  }

  const parsed = profileSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const orClauses: Array<Record<string, unknown>> = [{ phone: parsed.data.phone }];
  if (parsed.data.email) orClauses.push({ email: parsed.data.email });
  if (parsed.data.taxId) orClauses.push({ taxId: parsed.data.taxId });

  const exists = await prisma.user.findFirst({
    where: {
      id: { not: session.user.id },
      OR: orClauses,
    },
  });
  if (exists) {
    if (exists.phone === parsed.data.phone) {
      return { ok: false, error: "Este telefone já está em uso." };
    }
    if (parsed.data.email && exists.email === parsed.data.email) {
      return { ok: false, error: "Este e-mail já está em uso." };
    }
    if (parsed.data.taxId && exists.taxId === parsed.data.taxId) {
      return { ok: false, error: "Este CPF/CNPJ já está em uso." };
    }
    return { ok: false, error: "Dados já cadastrados para outro cliente." };
  }

  const current = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!current || current.userType !== UserType.CUSTOMER) {
    return { ok: false, error: "Conta não encontrada." };
  }

  if (current.email && parsed.data.email === null) {
    if (await prisma.user.findFirst({ where: { email: current.email } })) {
      // mantém o e-mail atual se o novo for vazio
      parsed.data.email = current.email;
    }
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email ?? current.email,
      taxId: parsed.data.taxId ?? current.taxId ?? null,
      defaultObservation: parsed.data.defaultObservation ?? null,
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE",
    resource: "customer",
    entityId: session.user.id,
    details: "Dados do perfil atualizados",
  });

  revalidatePath("/meus-dados");
  return { ok: true };
}

export async function changePasswordAction(
  data: { currentPassword: string; newPassword: string }
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Faça login para alterar a senha." };
  }

  const parsed = changePasswordSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return { ok: false, error: "Conta não encontrada." };
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!valid) {
    return { ok: false, error: "Senha atual incorreta." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(parsed.data.newPassword, 10) },
  });

  await audit({
    userId: user.id,
    action: "UPDATE",
    resource: "user",
    entityId: user.id,
    details: "Senha alterada pelo próprio usuário",
  });

  return { ok: true };
}