"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  FolderOpen,
  Users,
  UserCog,
  Wallet,
  BarChart3,
  Settings,
  Bell,
  LogOut,
  Menu,
  X,
  UtensilsCrossed as LogoIcon,
  Bike,
  Truck,
  FileText,
  CreditCard,
  ArrowLeftRight,
  BookOpen,
  Tags,
} from "lucide-react";
import { can, ROLE_LABELS, type SessionUser, type Permission } from "@/lib/permissions";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/format";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission?: Permission | null;
};

export function AdminShell({
  user,
  children,
}: {
  user: { id: string; name: string; role: SessionUser["role"] };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sessionUser: SessionUser = {
    id: user.id,
    userType: "EMPLOYEE",
    role: user.role,
    name: user.name,
  };

  const nav: NavItem[] = [
    { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, permission: "dashboard.view" },
    { href: "/admin/pedidos", label: "Pedidos", icon: <ShoppingBag className="h-5 w-5" />, permission: "orders.view" },
    { href: "/admin/delivery", label: "Entregas", icon: <Truck className="h-5 w-5" />, permission: "delivery.view" },
    { href: "/admin/entregadores", label: "Entregadores", icon: <Bike className="h-5 w-5" />, permission: "employees.manage" },
    { href: "/admin/produtos", label: "Produtos", icon: <UtensilsCrossed className="h-5 w-5" />, permission: "products.manage" },
    { href: "/admin/precificacao", label: "Precificação", icon: <Tags className="h-5 w-5" />, permission: "products.manage" },
    { href: "/admin/categorias", label: "Categorias", icon: <FolderOpen className="h-5 w-5" />, permission: "categories.manage" },
    { href: "/admin/clientes", label: "Clientes", icon: <Users className="h-5 w-5" />, permission: "customers.view" },
    { href: "/admin/colaboradores", label: "Colaboradores", icon: <UserCog className="h-5 w-5" />, permission: "employees.manage" },
    { href: "/admin/caixa", label: "Caixa", icon: <Wallet className="h-5 w-5" />, permission: "cash.movements" },
    { href: "/admin/financeiro/pagar", label: "Contas a pagar", icon: <CreditCard className="h-5 w-5" />, permission: "finance.view" },
    { href: "/admin/financeiro/receber", label: "Contas a receber", icon: <ArrowLeftRight className="h-5 w-5" />, permission: "finance.view" },
    { href: "/admin/financeiro/livro-caixa", label: "Livro caixa", icon: <BookOpen className="h-5 w-5" />, permission: "finance.view" },
    { href: "/admin/relatorios", label: "Relatórios", icon: <BarChart3 className="h-5 w-5" />, permission: "reports.view" },
    { href: "/admin/notificacoes", label: "Notificações", icon: <Bell className="h-5 w-5" />, permission: "dashboard.view" },
    { href: "/admin/configuracoes", label: "Configurações", icon: <Settings className="h-5 w-5" />, permission: "settings.manage" },
  ];

  const visibleNav = nav.filter((item) => !item.permission || can(sessionUser, item.permission));

  const Sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
          <LogoIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold leading-tight">Delivery Food</p>
          <p className="text-[11px] text-muted-foreground">Painel de controle</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-2.5 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user.role ?? "ATTENDANT"]}</p>
          </div>
        </div>
        <form
          action={async () => {
            await logoutAction();
          }}
        >
          <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-danger hover:bg-danger/5">
            <LogOut className="h-5 w-5" />
            Sair do painel
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-card lg:block">
        {Sidebar}
      </aside>

      {/* Sidebar mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-card shadow-xl animate-fade-in">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
            {Sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Ver loja
          </Link>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}