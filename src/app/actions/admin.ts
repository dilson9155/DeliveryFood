"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { can, type SessionUser } from "@/lib/permissions";
import {
  productSchema,
  categorySchema,
  employeeSchema,
  settingsSchema,
  businessHoursSchema,
} from "@/lib/validations";
import { roundMoney } from "@/lib/format";
import { UserType, EmployeeRole } from "@prisma/client";

export type AdminResult = { ok: true; id?: string } | { ok: false; error: string };

async function requireEmployee(permission: "products.manage" | "categories.manage" | "employees.manage" | "settings.manage" | "cash.movements" | "delivery.assign"): Promise<SessionUser | AdminResult> {
  const session = await auth();
  const s = session as unknown as {
    user?: { id: string; userType: UserType; role: SessionUser["role"]; name?: string | null; email?: string | null };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  const user: SessionUser = {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role,
    name: s.user.name,
    email: s.user.email,
  };
  if (!can(user, permission)) {
    return { ok: false, error: "Você não tem permissão para realizar essa ação." };
  }
  return user;
}

function isUserResult(v: SessionUser | AdminResult): v is SessionUser {
  return !("ok" in v);
}

async function requireAnyEmployee(): Promise<SessionUser | AdminResult> {
  const session = await auth();
  const s = session as unknown as {
    user?: { id: string; userType: UserType; role: SessionUser["role"]; name?: string | null; email?: string | null };
  };
  if (!s?.user || s.user.userType !== UserType.EMPLOYEE || !s.user.role) {
    return { ok: false, error: "Acesso restrito a colaboradores." };
  }
  return {
    id: s.user.id,
    userType: UserType.EMPLOYEE,
    role: s.user.role,
    name: s.user.name,
    email: s.user.email,
  };
}

// ---------------- Produtos ----------------

export async function saveProductAction(data: {
  id?: string;
  name: string;
  description?: string | null;
  price: number;
  categoryId: string;
  imageUrl?: string | null;
  featured?: boolean;
  order?: number;
  active?: boolean;
}): Promise<AdminResult> {
  const user = await requireEmployee("products.manage");
  if (!isUserResult(user)) return user;

  const parsed = productSchema.safeParse({
    ...data,
    price: data.price,
    featured: data.featured ?? false,
    order: data.order ?? 0,
    active: data.active ?? true,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const category = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
  if (!category) {
    return { ok: false, error: "Categoria inválida." };
  }

  if (data.id) {
    await prisma.product.update({
      where: { id: data.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        price: roundMoney(parsed.data.price),
        categoryId: parsed.data.categoryId,
        imageUrl: parsed.data.imageUrl || null,
        featured: parsed.data.featured ?? false,
        order: parsed.data.order ?? 0,
        active: parsed.data.active ?? true,
      },
    });
    await audit({
      userId: user.id,
      action: "UPDATE",
      resource: "product",
      entityId: data.id,
      details: `Produto "${parsed.data.name}" atualizado`,
    });
  } else {
    const product = await prisma.product.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        price: roundMoney(parsed.data.price),
        categoryId: parsed.data.categoryId,
        imageUrl: parsed.data.imageUrl || null,
        featured: parsed.data.featured ?? false,
        order: parsed.data.order ?? 0,
        active: parsed.data.active ?? true,
      },
    });
    await audit({
      userId: user.id,
      action: "CREATE",
      resource: "product",
      entityId: product.id,
      details: `Produto "${parsed.data.name}" criado`,
    });
  }

  revalidatePath("/");
  revalidatePath("/admin/produtos");
  return { ok: true, id: data.id };
}

export async function toggleProductActiveAction(
  id: string,
  active: boolean
): Promise<AdminResult> {
  const user = await requireEmployee("products.manage");
  if (!isUserResult(user)) return user;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return { ok: false, error: "Produto não encontrado." };

  await prisma.product.update({ where: { id }, data: { active } });
  await audit({
    userId: user.id,
    action: active ? "UPDATE" : "DELETE",
    resource: "product",
    entityId: id,
    details: active ? `Produto "${product.name}" ativado` : `Produto "${product.name}" desativado (exclusão lógica)`,
  });

  revalidatePath("/");
  revalidatePath("/admin/produtos");
  return { ok: true };
}

// ---------------- Categorias ----------------

export async function saveCategoryAction(data: {
  id?: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  order?: number;
  active?: boolean;
}): Promise<AdminResult> {
  const user = await requireEmployee("categories.manage");
  if (!isUserResult(user)) return user;

  const parsed = categorySchema.safeParse({
    ...data,
    order: data.order ?? 0,
    active: data.active ?? true,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (data.id) {
    await prisma.category.update({
      where: { id: data.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        icon: parsed.data.icon || null,
        order: parsed.data.order ?? 0,
        active: parsed.data.active ?? true,
      },
    });
    await audit({
      userId: user.id,
      action: "UPDATE",
      resource: "category",
      entityId: data.id,
      details: `Categoria "${parsed.data.name}" atualizada`,
    });
  } else {
    const cat = await prisma.category.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description || null,
        icon: parsed.data.icon || null,
        order: parsed.data.order ?? 0,
        active: parsed.data.active ?? true,
      },
    });
    await audit({
      userId: user.id,
      action: "CREATE",
      resource: "category",
      entityId: cat.id,
      details: `Categoria "${parsed.data.name}" criada`,
    });
  }

  revalidatePath("/");
  revalidatePath("/admin/categorias");
  return { ok: true, id: data.id };
}

export async function toggleCategoryActiveAction(
  id: string,
  active: boolean
): Promise<AdminResult> {
  const user = await requireEmployee("categories.manage");
  if (!isUserResult(user)) return user;

  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) return { ok: false, error: "Categoria não encontrada." };

  await prisma.category.update({ where: { id }, data: { active } });
  await audit({
    userId: user.id,
    action: active ? "UPDATE" : "DELETE",
    resource: "category",
    entityId: id,
    details: active ? `Categoria "${category.name}" ativada` : `Categoria "${category.name}" desativada`,
  });

  revalidatePath("/");
  revalidatePath("/admin/categorias");
  return { ok: true };
}

// ---------------- Colaboradores ----------------

export async function saveEmployeeAction(data: {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  login: string;
  password?: string;
  role: EmployeeRole;
  active?: boolean;
}): Promise<AdminResult> {
  const user = await requireEmployee("employees.manage");
  if (!isUserResult(user)) return user;

  const parsed = employeeSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const loginExists = await prisma.user.findFirst({
    where: {
      login: parsed.data.login.toLowerCase(),
      ...(data.id ? { id: { not: data.id } } : {}),
    },
  });
  if (loginExists) {
    return { ok: false, error: "Este login já está em uso." };
  }
  if (parsed.data.email) {
    const emailExists = await prisma.user.findFirst({
      where: {
        email: parsed.data.email.toLowerCase(),
        ...(data.id ? { id: { not: data.id } } : {}),
      },
    });
    if (emailExists) {
      return { ok: false, error: "Este e-mail já está em uso." };
    }
  }

  const base = {
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    email: parsed.data.email?.toLowerCase() || null,
    login: parsed.data.login.toLowerCase(),
    role: parsed.data.role,
    active: parsed.data.active ?? true,
  };

  if (data.id && (parsed.data.password === undefined || parsed.data.password === "")) {
    await prisma.user.update({ where: { id: data.id }, data: { ...base } });
    await audit({
      userId: user.id,
      action: "UPDATE",
      resource: "employee",
      entityId: data.id,
      details: `Colaborador "${parsed.data.name}" atualizado (permissões)`,
    });
  } else if (data.id) {
    await prisma.user.update({
      where: { id: data.id },
      data: { ...base, password: await bcrypt.hash(parsed.data.password as string, 10) },
    });
    await audit({
      userId: user.id,
      action: "UPDATE",
      resource: "employee",
      entityId: data.id,
      details: `Colaborador "${parsed.data.name}" atualizado (permissões e senha)`,
    });
  } else {
    const created = await prisma.user.create({
      data: {
        userType: UserType.EMPLOYEE,
        ...base,
        password: await bcrypt.hash(parsed.data.password as string, 10),
      },
    });
    await audit({
      userId: user.id,
      action: "CREATE",
      resource: "employee",
      entityId: created.id,
      details: `Colaborador "${parsed.data.name}" criado com papel ${parsed.data.role}`,
    });
  }

  revalidatePath("/admin/colaboradores");
  return { ok: true };
}

export async function toggleEmployeeActiveAction(
  id: string,
  active: boolean
): Promise<AdminResult> {
  const user = await requireEmployee("employees.manage");
  if (!isUserResult(user)) return user;

  const employee = await prisma.user.findUnique({ where: { id } });
  if (!employee || employee.userType !== UserType.EMPLOYEE) {
    return { ok: false, error: "Colaborador não encontrado." };
  }

  await prisma.user.update({ where: { id }, data: { active } });
  await audit({
    userId: user.id,
    action: active ? "UPDATE" : "DELETE",
    resource: "employee",
    entityId: id,
    details: active ? `Colaborador "${employee.name}" ativado` : `Colaborador "${employee.name}" desativado`,
  });

  revalidatePath("/admin/colaboradores");
  return { ok: true };
}

export async function deleteEmployeeAction(input: {
  id: string;
  confirmLogin: string;
}): Promise<(AdminResult & { name?: string; orders?: number; deliveries?: number })> {  const user = await requireEmployee("employees.manage");
  if (!isUserResult(user)) return user;

  const employee = await prisma.user.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      userType: true,
      name: true,
      login: true,
      role: true,
      active: true,
      _count: { select: { orders: true, deliveries: true, auditLogs: true } },
    },
  });
  if (!employee || employee.userType !== UserType.EMPLOYEE) {
    return { ok: false, error: "Colaborador não encontrado." };
  }

  if (employee.id === user.id) {
    return { ok: false, error: "Você não pode excluir o seu próprio usuário." };
  }

  if (employee.login?.toLowerCase() !== input.confirmLogin.trim().toLowerCase()) {
    return { ok: false, error: `Confirmação inválida. Digite exatamente o login "${employee.login}" para excluir.` };
  }

  if (employee.role === EmployeeRole.ADMIN) {
    const otherAdmins = await prisma.user.count({
      where: {
        userType: UserType.EMPLOYEE,
        role: EmployeeRole.ADMIN,
        active: true,
        id: { not: employee.id },
      },
    });
    if (otherAdmins === 0) {
      return { ok: false, error: "Não é possível excluir o último administrador ativo do sistema." };
    }
  }

  const removed = {
    orders: employee._count.orders,
    deliveries: employee._count.deliveries,
  };

  await prisma.user.delete({ where: { id: employee.id } });
  await audit({
    userId: user.id,
    action: "DELETE",
    resource: "employee",
    entityId: employee.id,
    details: `Colaborador "${employee.name}" (@${employee.login}) excluído`,
  });

  revalidatePath("/admin/colaboradores");
  return { ok: true, name: employee.name, ...removed };
}

// ---------------- Excluir cliente ----------------

export async function deleteCustomerAction(input: {
  id: string;
  confirmPhone: string;
}): Promise<AdminResult & { name?: string; addressesRemoved?: number }> {
  const user = await requireAnyEmployee();
  if (!isUserResult(user)) return user;

  const customer = await prisma.user.findUnique({
    where: { id: input.id },
    select: {
      id: true,
      userType: true,
      name: true,
      phone: true,
      active: true,
      _count: { select: { orders: true, addresses: true, receivables: true, notifications: true, campaignRecipients: true } },
    },
  });
  if (!customer || customer.userType !== UserType.CUSTOMER) {
    return { ok: false, error: "Cliente não encontrado." };
  }

  const refPhone = (customer.phone ?? "").replace(/\D/g, "");
  const inputPhone = input.confirmPhone.replace(/\D/g, "");
  if (!refPhone || refPhone !== inputPhone) {
    return { ok: false, error: `Confirmação inválida. Digite o telefone cadastrado (somente números) para excluir.` };
  }

  if (customer._count.orders > 0 || customer._count.receivables > 0) {
    return {
      ok: false,
      error: `Este cliente possui ${customer._count.orders} pedido(s) e ${customer._count.receivables} recebível(is). Exclua os pedidos primeiro ou desative o cliente.`,
    };
  }

  const addressesRemoved = customer._count.addresses;

  await prisma.user.delete({ where: { id: customer.id } });
  await audit({
    userId: user.id,
    action: "DELETE",
    resource: "customer",
    entityId: customer.id,
    details: `Cliente "${customer.name}" excluído (${addressesRemoved} endereço(s), ${customer._count.notifications} notificação(ões) removidas)`,
  });

  revalidatePath("/admin/clientes");
  return { ok: true, name: customer.name, addressesRemoved };
}

// ---------------- Configurações ----------------

export async function saveSettingsAction(data: Record<string, unknown>): Promise<AdminResult> {
  const user = await requireEmployee("settings.manage");
  if (!isUserResult(user)) return user;

  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const rest = { ...parsed.data };
  delete rest.isManuallyOpen;

  await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      ...rest,
      prepTimeMinutes: rest.prepTimeMinutes ?? 30,
    },
    create: {
      id: "default",
      storeName: rest.storeName ?? "Meu Estabelecimento",
      prepTimeMinutes: rest.prepTimeMinutes ?? 30,
    },
  });

  await audit({
    userId: user.id,
    action: "SETTINGS_CHANGE",
    resource: "settings",
    entityId: "default",
    details: "Configurações do estabelecimento atualizadas",
  });

  revalidatePath("/");
  revalidatePath("/admin/configuracoes");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function saveBusinessHoursAction(
  hours: { dayOfWeek: number; open: boolean; openTime: string; closeTime: string }[]
): Promise<AdminResult> {
  const user = await requireEmployee("settings.manage");
  if (!isUserResult(user)) return user;

  for (const h of hours) {
    const parsed = businessHoursSchema.safeParse(h);
    if (!parsed.success) {
      return { ok: false, error: "Horário inválido." };
    }
    const { dayOfWeek, ...data } = parsed.data;
    await prisma.businessHours.upsert({
      where: { dayOfWeek },
      update: data,
      create: { dayOfWeek, ...data },
    });
  }

  await audit({
    userId: user.id,
    action: "SETTINGS_CHANGE",
    resource: "businessHours",
    entityId: null,
    details: "Horários de funcionamento atualizados",
  });

  revalidatePath("/");
  revalidatePath("/admin/configuracoes");
  return { ok: true };
}

export async function toggleOpenOverrideAction(
  value: boolean | null
): Promise<AdminResult> {
  const user = await requireEmployee("settings.manage");
  if (!isUserResult(user)) return user;

  await prisma.settings.upsert({
    where: { id: "default" },
    update: { isManuallyOpen: value },
    create: { id: "default", storeName: "Meu Estabelecimento", isManuallyOpen: value },
  });

  await audit({
    userId: user.id,
    action: "SETTINGS_CHANGE",
    resource: "settings",
    entityId: "default",
    details: `Abertura manual definida para ${value === null ? "seguir horário" : value ? "aberto" : "fechado"}`,
  });

  revalidatePath("/");
  revalidatePath("/admin/configuracoes");
  return { ok: true };
}

// ---------------- Motoboys ----------------

import { z } from "zod";

const motoboyCreateSchema = z.object({
  name: z.string().min(2, "Nome muito curto").max(120),
  phone: z.string().optional().nullable(),
  login: z.string().min(2, "Login muito curto").max(40),
  password: z.string().min(6, "Senha deve ter ao menos 6 caracteres").max(72),
  vehiclePlate: z.string().max(20).optional().nullable(),
  vehicleModel: z.string().max(60).optional().nullable(),
});

const motoboyUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  phone: z.string().optional().nullable(),
  login: z.string().min(2).max(40),
  password: z.string().min(6).max(72).optional().or(z.literal("")),
  vehiclePlate: z.string().max(20).optional().nullable(),
  vehicleModel: z.string().max(60).optional().nullable(),
});

export type MotoboyResult =
  | { ok: true; motoboy: { id: string; name: string; phone: string | null; login: string | null; vehiclePlate: string | null; vehicleModel: string | null; active: boolean; email: string | null; createdAt: Date; _count: { deliveries: number } } }
  | { ok: false; error: string };

export async function createMotoboyAction(
  data: z.infer<typeof motoboyCreateSchema>
): Promise<MotoboyResult> {
  const guard = await requireEmployee("employees.manage");
  if (!isUserResult(guard)) {
    return { ok: false, error: (guard as { error: string }).error };
  }
  const parsed = motoboyCreateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const dup = await prisma.user.findFirst({
    where: { login: parsed.data.login.toLowerCase() },
  });
  if (dup) return { ok: false, error: "Já existe um usuário com esse login." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const created = await prisma.user.create({
    data: {
      userType: UserType.EMPLOYEE,
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      login: parsed.data.login.toLowerCase(),
      password: passwordHash,
      role: EmployeeRole.MOTOBOY,
      vehiclePlate: parsed.data.vehiclePlate || null,
      vehicleModel: parsed.data.vehicleModel || null,
    },
  });

  await audit({
    userId: guard.id,
    action: "CREATE",
    resource: "user",
    entityId: created.id,
    details: `Motoboy criado: ${created.name}`,
  });

  revalidatePath("/admin/entregadores");
  return {
    ok: true,
    motoboy: {
      id: created.id,
      name: created.name,
      phone: created.phone,
      login: created.login,
      vehiclePlate: created.vehiclePlate,
      vehicleModel: created.vehicleModel,
      active: created.active,
      email: created.email,
      createdAt: created.createdAt,
      _count: { deliveries: 0 },
    },
  };
}

export async function updateMotoboyAction(
  data: z.infer<typeof motoboyUpdateSchema>
): Promise<MotoboyResult> {
  const guard = await requireEmployee("employees.manage");
  if (!isUserResult(guard)) {
    return { ok: false, error: (guard as { error: string }).error };
  }
  const parsed = motoboyUpdateSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const existing = await prisma.user.findFirst({
    where: { id: parsed.data.id, role: EmployeeRole.MOTOBOY },
  });
  if (!existing) return { ok: false, error: "Motoboy não encontrado." };

  const dup = await prisma.user.findFirst({
    where: {
      login: parsed.data.login.toLowerCase(),
      id: { not: parsed.data.id },
    },
  });
  if (dup) return { ok: false, error: "Já existe outro usuário com esse login." };

  const updatePayload: {
    name: string;
    phone: string | null;
    login: string;
    vehiclePlate: string | null;
    vehicleModel: string | null;
    password?: string;
  } = {
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    login: parsed.data.login.toLowerCase(),
    vehiclePlate: parsed.data.vehiclePlate || null,
    vehicleModel: parsed.data.vehicleModel || null,
  };
  if (parsed.data.password && parsed.data.password.length >= 6) {
    updatePayload.password = await bcrypt.hash(parsed.data.password, 10);
  }

  const updated = await prisma.user.update({
    where: { id: parsed.data.id },
    data: updatePayload,
  });

  await audit({
    userId: guard.id,
    action: "UPDATE",
    resource: "user",
    entityId: updated.id,
    details: `Motoboy atualizado: ${updated.name}`,
  });

  revalidatePath("/admin/entregadores");
  return {
    ok: true,
    motoboy: {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      login: updated.login,
      vehiclePlate: updated.vehiclePlate,
      vehicleModel: updated.vehicleModel,
      active: updated.active,
      email: updated.email,
      createdAt: updated.createdAt,
      _count: { deliveries: 0 },
    },
  };
}

export async function setUserActiveAction(data: {
  userId: string;
  active: boolean;
}): Promise<AdminResult> {
  const guard = await requireEmployee("employees.manage");
  if ("ok" in guard) return guard;
  await prisma.user.update({
    where: { id: data.userId },
    data: { active: data.active },
  });
  await audit({
    userId: guard.id,
    action: "UPDATE",
    resource: "user",
    entityId: data.userId,
    details: `Usuário ${data.active ? "ativado" : "desativado"}`,
  });
  revalidatePath("/admin/entregadores");
  return { ok: true };
}

// ---------------- Delivery settings ----------------

const deliverySettingsSchema = z.object({
  deliveryEnabled: z.boolean(),
  baseFee: z.number().min(0).max(999),
  feePerKm: z.number().min(0).max(99),
  minFee: z.number().min(0).max(999),
  maxFee: z.number().min(0).max(9999),
  maxDistanceKm: z.number().min(0).max(500),
  avgSpeedKmh: z.number().min(1).max(120),
});

export async function saveDeliverySettingsAction(
  data: z.infer<typeof deliverySettingsSchema>
): Promise<AdminResult> {
  const guard = await requireEmployee("settings.manage");
  if ("ok" in guard) return guard;
  const parsed = deliverySettingsSchema.safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  await prisma.deliverySettings.upsert({
    where: { id: "default" },
    update: parsed.data,
    create: { id: "default", ...parsed.data },
  });

  await audit({
    userId: guard.id,
    action: "SETTINGS_CHANGE",
    resource: "delivery_settings",
    entityId: "default",
    details: "Configurações de entrega atualizadas",
  });

  revalidatePath("/admin/configuracoes");
  revalidatePath("/");
  return { ok: true };
}

export async function assignMotoboyToOrderAction(data: {
  orderId: string;
  motoboyId: string | null;
}): Promise<AdminResult> {
  const guard = await requireEmployee("delivery.assign");
  if ("ok" in guard) return guard;
  const { assignMotoboyAction } = await import("@/app/actions/delivery");
  const res = await assignMotoboyAction(data.orderId, data.motoboyId);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}