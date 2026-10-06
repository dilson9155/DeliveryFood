import type { EmployeeRole, UserType } from "@prisma/client";

export type SessionUser = {
  id: string;
  userType: UserType;
  role: EmployeeRole | null;
  name?: string | null;
  email?: string | null;
};

export type Permission =
  | "orders.view"
  | "orders.manage"
  | "orders.cancel"
  | "orders.prepare"
  | "orders.pickup"
  | "payments.confirm"
  | "products.manage"
  | "categories.manage"
  | "customers.view"
  | "employees.manage"
  | "cash.register"
  | "cash.movements"
  | "reports.view"
  | "settings.manage"
  | "dashboard.view"
  | "delivery.view"
  | "delivery.manage"
  | "delivery.assign"
  | "orders.discount"
  | "finance.view"
  | "finance.manage";

const MATRIX: Record<Permission, EmployeeRole[]> = {
  "dashboard.view": ["ADMIN", "MANAGER", "ATTENDANT", "KITCHEN", "CASHIER", "MOTOBOY"],
  "orders.view": ["ADMIN", "MANAGER", "ATTENDANT", "KITCHEN", "CASHIER", "MOTOBOY"],
  "orders.manage": ["ADMIN", "MANAGER", "ATTENDANT", "CASHIER"],
  "orders.prepare": ["ADMIN", "MANAGER", "KITCHEN"],
  "orders.pickup": ["ADMIN", "MANAGER", "ATTENDANT", "CASHIER"],
  "orders.cancel": ["ADMIN", "MANAGER", "CASHIER"],
  "payments.confirm": ["ADMIN", "MANAGER", "CASHIER"],
  "products.manage": ["ADMIN", "MANAGER"],
  "categories.manage": ["ADMIN", "MANAGER"],
  "customers.view": ["ADMIN", "MANAGER", "ATTENDANT", "CASHIER"],
  "employees.manage": ["ADMIN"],
  "cash.register": ["ADMIN", "MANAGER", "CASHIER"],
  "cash.movements": ["ADMIN", "MANAGER", "CASHIER"],
  "reports.view": ["ADMIN", "MANAGER"],
  "settings.manage": ["ADMIN"],
  "delivery.view": ["ADMIN", "MANAGER", "ATTENDANT", "MOTOBOY"],
  "delivery.manage": ["ADMIN", "MANAGER"],
  "delivery.assign": ["ADMIN", "MANAGER", "ATTENDANT"],
  "orders.discount": ["ADMIN", "MANAGER", "ATTENDANT", "CASHIER"],
  "finance.view": ["ADMIN", "MANAGER", "CASHIER"],
  "finance.manage": ["ADMIN", "MANAGER"],
};

export function can(user: SessionUser | null | undefined, permission: Permission): boolean {
  if (!user || user.userType !== "EMPLOYEE" || !user.role) return false;
  return MATRIX[permission].includes(user.role);
}

export const ROLE_LABELS: Record<EmployeeRole, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  ATTENDANT: "Atendente",
  KITCHEN: "Cozinha",
  CASHIER: "Caixa",
  MOTOBOY: "Motoboy",
};