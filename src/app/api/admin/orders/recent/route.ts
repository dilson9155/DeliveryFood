import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UserType, Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const s = session as unknown as {
    user?: { userType: UserType; role?: string | null };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const orders = await prisma.order.findMany({
    orderBy: [{ status: Prisma.SortOrder.desc }, { createdAt: Prisma.SortOrder.asc }],
    include: {
      customer: { select: { name: true, phone: true } },
      items: true,
      payment: true,
    },
    take: 300,
  });

  return NextResponse.json({ orders });
}