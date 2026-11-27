import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOperationsOrders } from "@/lib/orders-feed";
import { UserType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const s = session as unknown as {
    user?: { userType: UserType; role?: string | null };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const orders = await getOperationsOrders();
  return NextResponse.json({
    orders,
    serverTime: new Date().toISOString(),
  });
}
