"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType, CampaignStatus, RecipientStatus } from "@prisma/client";
import { sendWhatsApp, normalizePhone } from "@/lib/whatsapp";
import { z } from "zod";

type AuthFailure = { ok: false; error: string };

async function requireEmployee(permission: "messages.manage" | "customers.view" = "messages.manage"): Promise<SessionUser | AuthFailure> {
  const session = (await auth()) as { user?: { id: string; userType: UserType; role: SessionUser["role"]; name?: string | null; email?: string | null } } | null;
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE || !session.user.role) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const user: SessionUser = {
    id: session.user.id,
    userType: UserType.EMPLOYEE,
    role: session.user.role,
    name: session.user.name,
    email: session.user.email,
  };
  if (!can(user, permission)) {
    return { ok: false, error: "Você não tem permissão para realizar essa ação." };
  }
  return user;
}

function isUser(v: SessionUser | AuthFailure): v is SessionUser {
  return !("ok" in v);
}

function replaceVariables(text: string, name: string | null): string {
  const firstName = (name || "Cliente").trim().split(/\s+/)[0] || "Cliente";
  return text.replace(/{nome}/gi, firstName);
}

const recipientSchema = z.object({
  customerId: z.string().optional().nullable(),
  name: z.string().min(1).max(120),
  phone: z.string().min(8).max(20),
});

const createCampaignSchema = z.object({
  title: z.string().min(2, "Dê um título para a campanha").max(120),
  message: z.string().min(5, "Escreva uma mensagem válida").max(2000),
  recipients: z.array(recipientSchema).min(1, "Selecione pelo menos um cliente"),
});

export type CreateCampaignResult =
  | { ok: true; campaignId: string; total: number }
  | { ok: false; error: string };

export async function createCampaignAction(input: {
  title: string;
  message: string;
  recipients: Array<{ customerId?: string | null; name: string; phone: string }>;
}): Promise<CreateCampaignResult> {
  const user = await requireEmployee("messages.manage");
  if (!isUser(user)) return user;

  const parsed = createCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const d = parsed.data;

  const campaign = await prisma.campaign.create({
    data: {
      title: d.title.trim(),
      message: d.message.trim(),
      status: CampaignStatus.DRAFT,
      total: d.recipients.length,
      createdById: user.id,
    },
    select: { id: true },
  });

  const recs = d.recipients.map((r) => {
    const msg = replaceVariables(d.message, r.name);
    return {
      campaignId: campaign.id,
      customerId: r.customerId || null,
      name: r.name.trim(),
      phone: r.phone.trim(),
      message: msg,
    };
  });

  await prisma.campaignRecipient.createMany({ data: recs });

  revalidatePath("/admin/disparo-mensagens");
  return { ok: true, campaignId: campaign.id, total: recs.length };
}

export async function sendCampaignAction(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEmployee("messages.manage");
  if (!isUser(user)) return user;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, message: true, total: true },
  });
  if (!campaign) return { ok: false, error: "Campanha não encontrada." };
  if (campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.CANCELLED) {
    return { ok: false, error: "Esta campanha não pode ser enviada novamente." };
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.SENDING },
  });

  const pending = await prisma.campaignRecipient.findMany({
    where: { campaignId: campaign.id, status: RecipientStatus.PENDING },
    select: { id: true, customerId: true, name: true, phone: true },
    take: 2000,
  });

  let sent = 0;
  let errors = 0;

  for (const r of pending) {
    const norm = normalizePhone(r.phone);
    const msg = replaceVariables(campaign.message, r.name);
    let res;
    if (!norm) {
      res = { ok: false, error: "Telefone inválido." } as const;
    } else {
      res = await sendWhatsApp({ phone: r.phone, text: msg });
    }
    if (res.ok) {
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: RecipientStatus.SENT, sentAt: new Date() },
      });
      sent++;
    } else {
      await prisma.campaignRecipient.update({
        where: { id: r.id },
        data: { status: RecipientStatus.ERROR, error: res.error.slice(0, 255) },
      });
      errors++;
    }
  }

  const finished = sent + errors >= pending.length || pending.length === 0;
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      sentCount: sent,
      errorCount: errors,
      status: finished ? (errors === 0 && sent > 0 ? CampaignStatus.COMPLETED : sent === 0 ? CampaignStatus.FAILED : CampaignStatus.COMPLETED) : CampaignStatus.SENDING,
      finishedAt: finished ? new Date() : null,
    },
  });

  revalidatePath("/admin/disparo-mensagens");
  return { ok: true };
}

export async function cancelCampaignAction(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEmployee("messages.manage");
  if (!isUser(user)) return user;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true },
  });
  if (!campaign) return { ok: false, error: "Campanha não encontrada." };
  if (campaign.status === CampaignStatus.COMPLETED || campaign.status === CampaignStatus.CANCELLED) {
    return { ok: false, error: "Não é possível cancelar esta campanha." };
  }

  await prisma.$transaction([
    prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.CANCELLED, cancelledAt: new Date() },
    }),
    prisma.campaignRecipient.updateMany({
      where: { campaignId: campaign.id, status: RecipientStatus.PENDING },
      data: { status: RecipientStatus.CANCELLED },
    }),
  ]);

  revalidatePath("/admin/disparo-mensagens");
  return { ok: true };
}

export async function deleteCampaignAction(campaignId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEmployee("messages.manage");
  if (!isUser(user)) return user;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true },
  });
  if (!campaign) return { ok: false, error: "Campanha não encontrada." };

  await prisma.campaign.delete({ where: { id: campaign.id } });

  revalidatePath("/admin/disparo-mensagens");
  return { ok: true };
}
