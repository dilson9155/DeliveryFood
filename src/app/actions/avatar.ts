"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType } from "@prisma/client";

type AuthFailure = { ok: false; error: string };

async function requireUser(): Promise<SessionUser | AuthFailure> {
  const session = (await auth()) as { user?: { id: string; userType: UserType; role?: SessionUser["role"]; name?: string | null; email?: string | null } } | null;
  if (!session?.user) return { ok: false, error: "Faça login." };
  return {
    id: session.user.id,
    userType: session.user.userType,
    role: session.user.role ?? null,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
  };
}

function isUser(v: SessionUser | AuthFailure): v is SessionUser {
  return !("ok" in v);
}

const MAX_BYTES = 512 * 1024; // 512 KB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function parseDataUrl(s: string): { mime: string; buffer: Buffer; dataUrl: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  if (!ALLOWED.has(mime)) return null;
  const buffer = Buffer.from(m[2]!, "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;
  return { mime, buffer, dataUrl: s };
}

/**
 * Atualiza o avatar do próprio usuário logado (cliente ou colaborador).
 */
export async function updateMyAvatarAction(input: {
  dataUrl: string | null;
}): Promise<{ ok: true; avatarUrl: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!isUser(user)) return user;

  let avatarUrl: string | null = null;
  if (input.dataUrl) {
    const parsed = parseDataUrl(input.dataUrl);
    if (!parsed) {
      return { ok: false, error: "Imagem inválida. Use PNG/JPG/WebP/GIF até 512 KB." };
    }
    avatarUrl = parsed.dataUrl;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl },
  });

  // Cache bust das páginas que mostram o avatar
  revalidatePath("/meus-dados");
  revalidatePath("/admin");
  revalidatePath("/admin/colaboradores");
  revalidatePath("/admin/clientes");
  return { ok: true, avatarUrl };
}

/**
 * Admin atualiza avatar de qualquer usuário (colaborador ou cliente).
 */
export async function updateUserAvatarAction(input: {
  userId: string;
  dataUrl: string | null;
}): Promise<{ ok: true; avatarUrl: string | null } | { ok: false; error: string }> {
  const session = (await auth()) as { user?: { id: string; userType: UserType; role?: SessionUser["role"] } } | null;
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE || !session.user.role) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const me: SessionUser = {
    id: session.user.id,
    userType: UserType.EMPLOYEE,
    role: session.user.role,
    name: null,
    email: null,
  };
  // Qualquer um que gerencia colaboradores pode editar avatar
  if (!can(me, "employees.manage")) {
    return { ok: false, error: "Sem permissão." };
  }

  let avatarUrl: string | null = null;
  if (input.dataUrl) {
    const parsed = parseDataUrl(input.dataUrl);
    if (!parsed) {
      return { ok: false, error: "Imagem inválida. Use PNG/JPG/WebP/GIF até 512 KB." };
    }
    avatarUrl = parsed.dataUrl;
  }

  await prisma.user.update({
    where: { id: input.userId },
    data: { avatarUrl },
  });

  revalidatePath("/admin/colaboradores");
  revalidatePath("/admin/clientes");
  return { ok: true, avatarUrl };
}
