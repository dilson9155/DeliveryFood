"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { signIn, signOut, findUserByIdentifier } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validations";
import { UserType } from "@prisma/client";

export type AuthFormState = {
  error?: string;
  success?: string;
  devResetLink?: string;
};

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    await signIn("credentials", {
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Telefone/e-mail ou senha inválidos." };
    }
    throw error;
  }

  // auth() nesta mesma action ainda não enxerga o cookie que o acabou de
  // criar (ele é gravado na resposta), então buscamos o usuário no banco
  // para decidir o destino do redirect.
  const user = await findUserByIdentifier(parsed.data.identifier);

  let target = "/";
  if (user?.userType === "EMPLOYEE") {
    target = user.role === "MOTOBOY" ? "/entregador" : "/admin/dashboard";
  }
  redirect(target);
}

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    taxId: formData.get("taxId"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { name, phone, taxId, email, password } = parsed.data;

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { phone },
        ...(email ? [{ email }] : []),
        ...(taxId ? [{ taxId }] : []),
      ],
    },
  });

  if (existing) {
    if (existing.phone === phone) {
      return { error: "Este telefone já está cadastrado. Faça login." };
    }
    if (email && existing.email === email) {
      return { error: "Este e-mail já está cadastrado. Faça login." };
    }
    if (taxId && existing.taxId === taxId) {
      return { error: "Este CPF/CNPJ já está cadastrado." };
    }
    return { error: "Dados já cadastrados. Faça login." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      userType: UserType.CUSTOMER,
      name,
      phone,
      taxId: taxId ?? null,
      email: email ?? null,
      password: passwordHash,
    },
  });

  await audit({
    userId: user.id,
    action: "CREATE",
    resource: "customer",
    entityId: user.id,
    details: "Cadastro de cliente",
  });

  try {
    await signIn("credentials", {
      identifier: phone,
      password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login");
    }
    throw error;
  }

  redirect("/");
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = forgotPasswordSchema.safeParse({
    identifier: formData.get("identifier"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const identifier = parsed.data.identifier;
  const isEmail = identifier.includes("@");
  const where = isEmail
    ? { email: identifier.toLowerCase().trim() }
    : {
        OR: [
          { phone: identifier.replace(/\D/g, "") },
          { login: identifier.trim().toLowerCase() },
        ],
      };

  const user = await prisma.user.findFirst({ where });

  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExpires: new Date(Date.now() + 1000 * 60 * 60),
      },
    });

    const resetLink = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${token}`;

    // O envio automático (WhatsApp/E-mail) ainda não está configurado.
    // Em desenvolvimento, o link é exibido no console do servidor.
    console.log(`🔑 Recuperação de senha para ${user.name}: ${resetLink}`);

    if (process.env.NODE_ENV !== "production") {
      return {
        success: "Link de recuperação gerado.",
        devResetLink: resetLink,
      };
    }
  }

  return {
    success:
      "Se o cadastro existir, enviaremos um link de recuperação. (Envio automático por WhatsApp/E-mail será configurado futuramente).",
  };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { token, password } = parsed.data;

  const user = await prisma.user.findFirst({
    where: {
      resetToken: token,
      resetTokenExpires: { gt: new Date() },
    },
  });

  if (!user) {
    return {
      error:
        "Link de recuperação inválido ou expirado. Solicite um novo link.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: passwordHash,
      resetToken: null,
      resetTokenExpires: null,
    },
  });

  await audit({
    userId: user.id,
    action: "UPDATE",
    resource: "user",
    entityId: user.id,
    details: "Senha redefinida via recuperação",
  });

  redirect("/login?reset=1");
}

export async function logoutAction() {
  await signOut({ redirect: false });
  redirect("/login");
}