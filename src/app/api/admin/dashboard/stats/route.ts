import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { UserType } from "@prisma/client";
import { getDashboardStats } from "@/lib/dashboard-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const s = session as unknown as { user?: { userType: UserType } };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }
  const stats = await getDashboardStats();
  return NextResponse.json(stats);
}