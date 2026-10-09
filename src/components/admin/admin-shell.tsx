"use client";

import { useEffect, useState } from "react";
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
  CreditCard,
  ArrowLeftRight,
  BookOpen,
  Tags,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
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

const COLLAPSE_KEY = "df.adminSidebarCollapsed";

export function AdminShell({
  user,
  settings,
  children,
}: {
  user: { id: string; name: string; role: SessionUser["role"] };
  settings?: { storeName: string; logoUrl: string | null };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // começa como `null` para evitar flicker de SSR; lido depois em useEffect
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLLAPSE_KEY);
      setCollapsed(saved === "1");
    } catch {
      setCollapsed(false);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !(prev ?? false);
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const sessionUser: SessionUser = {
    id: user.id,
    userType: "EMPLOYEE",
    role: user.role,
    name: user.name,
  };

  const storeName = settings?.storeName ?? "Delivery Food";
  const logoUrl = settings?.logoUrl ?? null;
  const isCollapsed = collapsed === true;

  const nav: NavItem[] = [
    { href: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" />, permission: "dashboard.view" },
    { href: "/admin/pedidos", label: "Pedidos", icon: <ShoppingBag className="h-5 w-5" />, permission: "orders.view" },
    { href: "/admin/delivery", label: "Entregas", icon: <Truck className="h-5 w-5" />, permission: "delivery.view" },
    { href: "/admin/entregadores", label: "Entregadores", icon: <Bike className="h-5 w-5" />, permission: "employees.manage" },
    { href: "/admin/produtos", label: "Produtos", icon: <UtensilsCrossed className="h-5 w-5" />, permission: "products.manage" },
    { href: "/admin/precificacao", label: "Precificação", icon: <Tags className="h-5 w-5" />, permission: "products.manage" },
    { href: "/admin/categorias", label: "Categorias", icon: <FolderOpen className="h-5 w-5" />, permission: "categories.manage" },
    { href: "/admin/clientes", label: "Clientes", icon: <Users className="h-5 w-5" />, permission: "customers.view" },
    { href: "/admin/disparo-mensagens", label: "Disparo de Mensagens", icon: <MessagesSquare className="h-5 w-5" />, permission: "messages.manage" },
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
      {/* Header do sidebar com logo + botão recolher */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-border",
          isCollapsed ? "justify-center px-2" : "gap-2.5 px-5"
        )}
      >
        {!isCollapsed && (
          <>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={storeName}
                className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-border"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
                <LogoIcon className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight">{storeName}</p>
              <p className="text-[11px] text-muted-foreground">Painel de controle</p>
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:flex"
              title="Recolher menu"
              aria-label="Recolher menu"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          </>
        )}
        {isCollapsed && (
          <div className="flex w-full items-center justify-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={storeName}
                title={storeName}
                className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-border"
              />
            ) : (
              <span
                title={storeName}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white"
              >
                <LogoIcon className="h-5 w-5" />
              </span>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {visibleNav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "group/nav relative flex items-center rounded-xl text-sm font-medium transition-all duration-150",
                isCollapsed
                  ? "justify-center px-0 py-2.5"
                  : "gap-3 px-3 py-2.5",
                active
                  ? isCollapsed
                    ? "bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                    : "bg-brand-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {/* Indicador lateral de item ativo (expandido) */}
              {!isCollapsed && active && (
                <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brand-600" />
              )}
              {/* Ícone — escala maior quando colapsado */}
              <span
                className={cn(
                  "inline-flex items-center justify-center transition-transform duration-150",
                  isCollapsed ? "h-7 w-7 [&>svg]:h-5 [&>svg]:w-5" : "[&>svg]:h-5 [&>svg]:w-5",
                  active && isCollapsed && "scale-110",
                  "group-hover/nav:scale-105"
                )}
              >
                {item.icon}
              </span>
              {!isCollapsed && <span className="truncate">{item.label}</span>}
              {/* Tooltip elegante quando colapsado (CSS puro) */}
              {isCollapsed && (
                <span
                  className={cn(
                    "pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-all duration-150",
                    "group-hover/nav:translate-x-0 group-hover/nav:opacity-100"
                  )}
                  role="tooltip"
                >
                  {item.label}
                  <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 border-l border-b border-border bg-foreground" />
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-border p-3", isCollapsed && "flex flex-col items-center gap-2")}>
        {!isCollapsed ? (
          <>
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
          </>
        ) : (
          <>
            <span
              title={user.name}
              className="flex h-9 w-9 cursor-default items-center justify-center rounded-full bg-muted text-sm font-bold"
            >
              {user.name.charAt(0).toUpperCase()}
            </span>
            <form action={async () => { await logoutAction(); }}>
              <button
                type="submit"
                title="Sair do painel"
                aria-label="Sair do painel"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-danger hover:bg-danger/5"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </form>
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Expandir menu"
              aria-label="Expandir menu"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r border-border bg-card transition-[width] duration-200 ease-out lg:block",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
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

          {/* Nome do sistema (preenche o espaço vazio) - à esquerda em telas grandes */}
          <div className="flex min-w-0 items-center gap-2.5 lg:gap-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={storeName}
                className="hidden h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-border lg:block"
              />
            ) : (
              <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-sm lg:flex">
                <Sparkles className="h-4 w-4" />
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-bold tracking-tight sm:text-base">
                {storeName}
              </p>
              <p className="hidden truncate text-[11px] text-muted-foreground sm:block">
                Painel administrativo
              </p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Quando colapsado, mostra nome + cargo do usuário */}
          {isCollapsed && (
            <div className="hidden items-center gap-2 lg:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{ROLE_LABELS[user.role ?? "ATTENDANT"]}</p>
              </div>
            </div>
          )}

          <Link
            href="/"
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Ver loja
          </Link>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
