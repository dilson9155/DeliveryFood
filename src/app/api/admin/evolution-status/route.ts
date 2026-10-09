import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can, type SessionUser } from "@/lib/permissions";
import { UserType } from "@prisma/client";

/**
 * GET /api/admin/evolution-status
 *
 * Verifica conexão com a Evolution API a partir do servidor em produção.
 * Útil para validar de dentro do painel (uma vez que a Evolution roda em
 * um container docker interno e não pode ser acessada da máquina local).
 *
 * Resposta:
 *   { ok: true, configured: true, status: "open"|"close"|"connecting", instance, phoneNumber? }
 *   { ok: false, error }
 */
export async function GET() {
  const session = (await auth()) as { user?: { id: string; userType: UserType; role: SessionUser["role"] } } | null;
  if (!session?.user || session.user.userType !== UserType.EMPLOYEE || !session.user.role) {
    return NextResponse.json({ ok: false, error: "Acesso restrito a colaboradores." }, { status: 401 });
  }
  const user: SessionUser = {
    id: session.user.id,
    userType: UserType.EMPLOYEE,
    role: session.user.role,
    name: null,
    email: null,
  };
  if (!can(user, "messages.manage")) {
    return NextResponse.json({ ok: false, error: "Sem permissão." }, { status: 403 });
  }

  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!url || !key || !instance) {
    return NextResponse.json({
      ok: true,
      configured: false,
      message: "Evolution API não configurada (.env).",
    });
  }

  try {
    // Variantes do endpoint conforme versão
    const base = `${url.replace(/\/$/, "")}/instance/connectionState/${instance}`;
    const res = await fetch(base, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const text = await res.text();
    const data = text ? safeParse(text) : null;

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        configured: true,
        status: res.status,
        error: `HTTP ${res.status}`,
        body: text.slice(0, 300),
      });
    }

    // Tenta identificar campos comuns
    const d = data as Record<string, unknown> | null;
    const inst = d?.["instance"] as Record<string, unknown> | undefined;
    const me = d?.["me"] as Record<string, unknown> | undefined;
    const state =
      (inst?.["state"] as string | undefined) ??
      (d?.["state"] as string | undefined) ??
      (d?.["status"] as string | undefined);
    const phone =
      (inst?.["ownerJid"] as string | undefined) ??
      (inst?.["number"] as string | undefined) ??
      (me?.["id"] as string | undefined) ??
      null;

    let recentCampaign: { id: string; sentCount: number; errorCount: number; status: string } | null = null;
    try {
      recentCampaign = await prisma.campaign.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true, sentCount: true, errorCount: true, status: true },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      instance,
      url,
      status: state ?? "unknown",
      phoneNumber: phone,
      raw: data,
      lastCampaign: recentCampaign,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      configured: true,
      error: err instanceof Error ? err.message : "Erro de rede",
    });
  }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
