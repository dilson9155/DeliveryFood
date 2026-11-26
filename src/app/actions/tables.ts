"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import { restaurantTableSchema } from "@/lib/validations";
import { UserType } from "@prisma/client";

export type TableActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function employeeOrError(session: unknown): SessionUser | null {
  const s = session as {
    user?: {
      id: string;
      userType: UserType;
      role: SessionUser["role"];
      name?: string | null;
    };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) return null;
  return {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role,
    name: s.user.name,
  };
}

export async function saveTableAction(
  input: Parameters<typeof restaurantTableSchema.parse>[0]
): Promise<TableActionResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para gerenciar mesas." };
  }

  const parsed = restaurantTableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const data = parsed.data;

  const duplicate = await prisma.restaurantTable.findFirst({
    where: {
      number: data.number,
      ...(data.id ? { id: { not: data.id } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: `Já existe uma mesa com o número ${data.number}.` };
  }

  const payload = {
    number: data.number,
    label: data.label?.trim() || null,
    seats: data.seats,
    area: data.area?.trim() || null,
    notes: data.notes?.trim() || null,
    active: data.active ?? true,
  };

  const table = data.id
    ? await prisma.restaurantTable.update({ where: { id: data.id }, data: payload })
    : await prisma.restaurantTable.create({ data: payload });

  await audit({
    userId: user.id,
    action: data.id ? "UPDATE" : "CREATE",
    resource: "restaurant_table",
    entityId: table.id,
    details: `Mesa ${table.number} ${table.label ? `— ${table.label}` : ""}`,
  });

  revalidatePath("/admin/mesas");
  revalidatePath("/admin/comandas");
  return { ok: true, id: table.id };
}

export async function setTableActiveAction(
  id: string,
  active: boolean
): Promise<TableActionResult> {
  const session = await auth();
  const user = employeeOrError(session);
  if (!user || !can(user, "orders.manage")) {
    return { ok: false, error: "Você não tem permissão para gerenciar mesas." };
  }

  const table = await prisma.restaurantTable.update({
    where: { id },
    data: { active },
  });

  await audit({
    userId: user.id,
    action: "UPDATE",
    resource: "restaurant_table",
    entityId: table.id,
    details: `Mesa ${table.number} ${active ? "ativada" : "desativada"}`,
  });

  revalidatePath("/admin/mesas");
  revalidatePath("/admin/comandas");
  return { ok: true, id: table.id };
}
