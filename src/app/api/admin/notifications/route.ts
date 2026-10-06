import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserType } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export async function GET(req: Request) {
  const session = (await auth()) as { user?: { id: string; userType: UserType } } | null;
  if (session?.user?.userType !== UserType.EMPLOYEE) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;

  const items = await prisma.notification.findMany({
    where: {
      userId: null,
      ...(cursor ? { createdAt: { lt: await prisma.notification.findUnique({ where: { id: cursor } }).then((r) => r?.createdAt ?? new Date()) } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  return NextResponse.json({ items });
}