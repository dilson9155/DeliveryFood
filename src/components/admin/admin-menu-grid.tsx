"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CreditCard,
  FolderOpen,
  LayoutGrid,
  Receipt,
  Scale,
  Search,
  Settings,
  ShoppingCart,
  Soup,
  Tags,
  Truck,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
  ArrowLeftRight,
  type LucideIcon,
} from "lucide-react";
import { can, type Permission, type SessionUser } from "@/lib/permissions";
import { cn } from "@/lib/format";

type ModuleItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: string;
  permission?: Permission;
  accent?: string;
};

const QUICK: ModuleItem[] = [
  {
    href: "/admin/pdv",
    label: "PDV",
    description: "Produtos, marmitas e self-service em um só lugar.",
    icon: ShoppingCart,
    group: "Acesso rápido",
    permission: "orders.manage",
    accent: "bg-brand-600",
  },
  {
    href: "/admin/fila-pedidos",
    label: "Entregas",
    description: "Receba pedidos e marque entregas em um clique.",
    icon: Truck,
    group: "Acesso rápido",
    permission: "orders.view",
    accent: "bg-info",
  },
  {
    href: "/admin/cardapio-do-dia",
    label: "Cardápio do dia",
    description: "Monte as marmitas e os tamanhos de hoje.",
    icon: Soup,
    group: "Acesso rápido",
    permission: "products.manage",
    accent: "bg-warning",
  },
  {
    href: "/admin/autoatendimento",
    label: "Self-service",
    description: "Vendas por quilo ou preço fixo com caixa.",
    icon: Scale,
    group: "Acesso rápido",
    permission: "orders.manage",
    accent: "bg-success",
  },
];

const MODULES: ModuleItem[] = [
  { href: "/admin/pdv", label: "PDV", description: "Frente de caixa com produtos e marmitas.", icon: ShoppingCart, group: "Operação", permission: "orders.manage" },
  { href: "/admin/fila-pedidos", label: "Entregas", description: "Fila simples de pedidos com entrega.", icon: Truck, group: "Operação", permission: "orders.view" },
  { href: "/admin/comandas", label: "Comandas", description: "Abra, transfira e feche comandas.", icon: Receipt, group: "Operação", permission: "orders.manage" },
  { href: "/admin/mesas", label: "Mesas", description: "Organize mesas e comandas por mesa.", icon: LayoutGrid, group: "Operação", permission: "orders.manage" },
  { href: "/admin/cardapio-do-dia", label: "Cardápio do dia", description: "Refeições completas, tamanhos e preços.", icon: Soup, group: "Cardápio", permission: "products.manage" },
  { href: "/admin/autoatendimento", label: "Self-service", description: "Balança, preço fixo e fechamento de caixa.", icon: Scale, group: "Cardápio", permission: "orders.manage" },
  { href: "/admin/produtos", label: "Produtos", description: "Cadastre produtos e opções.", icon: UtensilsCrossed, group: "Cardápio", permission: "products.manage" },
  { href: "/admin/categorias", label: "Categorias", description: "Organize o catálogo por categorias.", icon: FolderOpen, group: "Cardápio", permission: "categories.manage" },
  { href: "/admin/precificacao", label: "Precificação", description: "Ajuste preços e margens.", icon: Tags, group: "Cardápio", permission: "products.manage" },
  { href: "/admin/clientes", label: "Clientes", description: "Cadastro, telefones e endereços.", icon: Users, group: "Clientes e equipe", permission: "customers.view" },
  { href: "/admin/colaboradores", label: "Colaboradores", description: "Usuários, funções e permissões.", icon: UserCog, group: "Clientes e equipe", permission: "employees.manage" },
  { href: "/admin/notificacoes", label: "Notificações", description: "Avisos e alertas do sistema.", icon: Bell, group: "Clientes e equipe", permission: "dashboard.view" },
  { href: "/admin/caixa", label: "Caixa", description: "Abertura, fechamento e movimentos.", icon: Wallet, group: "Financeiro", permission: "cash.movements" },
  { href: "/admin/financeiro/pagar", label: "Contas a pagar", description: "Despesas e parcelamentos.", icon: CreditCard, group: "Financeiro", permission: "finance.view" },
  { href: "/admin/financeiro/receber", label: "Contas a receber", description: "Recebimentos e cobranças.", icon: ArrowLeftRight, group: "Financeiro", permission: "finance.view" },
  { href: "/admin/financeiro/livro-caixa", label: "Livro caixa", description: "Extrato financeiro completo.", icon: BookOpen, group: "Financeiro", permission: "finance.view" },
  { href: "/admin/relatorios", label: "Relatórios", description: "Vendas, produtos e desempenho.", icon: BarChart3, group: "Financeiro", permission: "reports.view" },
  { href: "/admin/configuracoes", label: "Configurações", description: "Dados da loja, PIX e integrações.", icon: Settings, group: "Sistema", permission: "settings.manage" },
];

const GROUPS = ["Operação", "Cardápio", "Clientes e equipe", "Financeiro", "Sistema"];

function CardModule({ item, featured = false }: { item: ModuleItem; featured?: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="group block h-full">
      <div
        className={cn(
          "relative flex h-full flex-col rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-all duration-200",
          "hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-500/10",
          featured && "min-h-[112px] border-brand-200 bg-gradient-to-br from-brand-50/70 to-card"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "flex items-center justify-center rounded-xl bg-brand-50 text-brand-700 transition-transform group-hover:scale-105",
              featured ? "h-10 w-10" : "h-9 w-9",
              item.accent && `${item.accent} text-white`
            )}
          >
            <Icon className={featured ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={2} />
          </span>
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
        </div>
        <p className="mt-2.5 text-sm font-extrabold leading-tight">
          {item.label}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{item.description}</p>
      </div>
    </Link>
  );
}

export function AdminMenuGrid({ user }: { user: SessionUser }) {
  const [query, setQuery] = useState("");

  const allowed = (item: ModuleItem) => !item.permission || can(user, item.permission);
  const matches = (item: ModuleItem) => {
    const term = query.trim().toLowerCase();
    return !term || `${item.label} ${item.description} ${item.group}`.toLowerCase().includes(term);
  };

  const quick = useMemo(() => QUICK.filter((item) => allowed(item) && matches(item)), [query, user]);
  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        group,
        items: MODULES.filter((item) => item.group === group && allowed(item) && matches(item)),
      })).filter((entry) => entry.items.length > 0),
    [query, user]
  );
  const total = grouped.reduce((sum, entry) => sum + entry.items.length, 0);

  return (
    <div className="container-app py-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Menu geral</h1>
          <p className="text-xs text-muted-foreground">Escolha um módulo para abrir.</p>
        </div>
        <div className="relative w-full sm:w-80 lg:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar módulo..."
            className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm shadow-sm placeholder:text-muted-foreground focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {quick.length > 0 && (
        <section className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-brand-500" />
            <h2 className="text-sm font-extrabold">Acesso rápido</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quick.map((item) => (
              <CardModule key={`quick-${item.href}`} item={item} featured />
            ))}
          </div>
        </section>
      )}

      {grouped.map(({ group, items }) => (
        <section key={group} className="mt-5">
          <div className="mb-3 flex items-center gap-2">
            <span className="h-5 w-1 rounded-full bg-brand-500" />
            <h2 className="text-sm font-extrabold">{group}</h2>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <CardModule key={item.href} item={item} />
            ))}
          </div>
        </section>
      ))}

      {total === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-bold">Nenhum módulo encontrado</p>
          <p className="mt-1 text-xs text-muted-foreground">Tente outro termo na busca.</p>
        </div>
      )}
    </div>
  );
}
