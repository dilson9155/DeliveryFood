"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShoppingBag,
  UtensilsCrossed,
  User as UserIcon,
  LogOut,
  Package,
  LayoutDashboard,
  Clock,
  MapPin,
  Phone,
  X,
  Minus,
  Plus,
  Trash2,
  Bell,
  Timer,
} from "lucide-react";
import { useCart, cartSubtotal } from "@/stores/cart";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { logoutAction } from "@/app/actions/auth";

type StoreUser = {
  id: string;
  name: string;
  userType: "CUSTOMER" | "EMPLOYEE";
  role: string | null;
};

type Hours = {
  dayOfWeek: number;
  open: boolean;
  openTime: string;
  closeTime: string;
};

const DAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function StoreShell({
  settings,
  hours,
  open,
  statusMessage,
  user,
  unreadNotifications = 0,
  children,
}: {
  settings: {
    storeName: string;
    logoUrl: string | null;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    prepTimeMinutes: number | null;
  };
  hours: Hours[];
  open: boolean;
  statusMessage: string;
  user: StoreUser | null;
  unreadNotifications?: number;
  children: React.ReactNode;
}) {
  const { items } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="container-store flex h-16 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 min-w-0">
              {settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logoUrl}
                  alt={settings.storeName}
                  className="h-10 w-10 rounded-xl object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                  <UtensilsCrossed className="h-5 w-5" />
                </span>
              )}
              <span className="truncate text-base font-bold text-foreground">
                {settings.storeName}
              </span>
            </Link>

            {/* Indicador de status + tempo estimado (visível em md+) */}
            <div className="hidden items-center gap-1.5 md:flex">
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                  open
                    ? "bg-success/10 text-success"
                    : "bg-warning/10 text-warning"
                }`}
                title={statusMessage}
              >
                <span className="relative flex h-2 w-2">
                  {open && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${
                      open ? "bg-success" : "bg-warning"
                    }`}
                  />
                </span>
                {open ? "Aberto" : "Fechado"}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Timer className="h-3 w-3" />~{settings.prepTimeMinutes ?? 30} min
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-10 items-center gap-2 rounded-xl px-2 hover:bg-muted"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <UserIcon className="h-4 w-4" />
                </span>
                {user && (
                  <span className="hidden max-w-[120px] truncate text-sm font-medium sm:block">
                    {user.name.split(" ")[0]}
                  </span>
                )}
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-card shadow-lg animate-fade-in">
                    {user ? (
                      <>
                        <div className="border-b border-border px-4 py-3">
                          <p className="truncate text-sm font-semibold">{user.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.userType === "EMPLOYEE" ? "Colaborador" : "Cliente"}
                          </p>
                        </div>
                        {user.userType === "EMPLOYEE" ? (
                          <Link
                            href="/admin/dashboard"
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted"
                          >
                            <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                            Painel administrativo
                          </Link>
                        ) : (
                          <>
                            <Link
                              href="/meus-pedidos"
                              onClick={() => setMenuOpen(false)}
                              className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted"
                            >
                              <Package className="h-4 w-4 text-muted-foreground" />
                              Meus pedidos
                            </Link>
                            <Link
                              href="/meus-dados"
                              onClick={() => setMenuOpen(false)}
                              className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted"
                            >
                              <UserIcon className="h-4 w-4 text-muted-foreground" />
                              Meus dados
                            </Link>
                          </>
                        )}
                        <form
                          action={async () => {
                            await logoutAction();
                          }}
                        >
                          <button className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-danger hover:bg-danger/5">
                            <LogOut className="h-4 w-4" />
                            Sair
                          </button>
                        </form>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/login"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm font-medium hover:bg-muted"
                        >
                          Entrar
                        </Link>
                        <Link
                          href="/cadastro"
                          onClick={() => setMenuOpen(false)}
                          className="block px-4 py-2.5 text-sm hover:bg-muted"
                        >
                          Criar conta
                        </Link>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {user && (
              <Link
                href="/notificacoes"
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl hover:bg-muted"
                aria-label="Notificações"
              >
                <Bell className="h-5 w-5" />
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
                    {unreadNotifications > 99 ? "99+" : unreadNotifications}
                  </span>
                )}
              </Link>
            )}

            <button
              onClick={() => setCartOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm hover:bg-brand-700"
              aria-label="Abrir carrinho"
            >
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-bold text-background">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>

        {!open && (
          <div className="border-t border-warning/20 bg-warning/10 px-4 py-2 text-center text-xs font-medium text-warning">
            {statusMessage}
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="no-print border-t border-border bg-card">
        <div className="container-store py-8">
          <div className="grid gap-6 sm:grid-cols-3">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <MapPin className="h-4 w-4 text-brand-600" />
                Retirada no estabelecimento
              </p>
              <p className="text-sm text-muted-foreground">
                {settings.address}
                {settings.number ? `, ${settings.number}` : ""}
                {settings.complement ? ` - ${settings.complement}` : ""}
              </p>
              {settings.neighborhood && (
                <p className="text-sm text-muted-foreground">
                  {settings.neighborhood}
                  {settings.city ? `, ${settings.city}` : ""}
                  {settings.state ? ` - ${settings.state}` : ""}
                </p>
              )}
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Clock className="h-4 w-4 text-brand-600" />
                Horário de funcionamento
              </p>
              <ul className="space-y-0.5 text-sm text-muted-foreground">
                {hours
                  .filter((h) => h.open)
                  .map((h) => (
                    <li key={h.dayOfWeek}>
                      {DAY_LABELS[h.dayOfWeek]}: {h.openTime} às {h.closeTime}
                    </li>
                  ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Phone className="h-4 w-4 text-brand-600" />
                Contato
              </p>
              <p className="text-sm text-muted-foreground">
                {settings.phone ?? "Telefone não informado"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Tempo estimado de preparo:{" "}
                {settings.prepTimeMinutes ?? 30} min
              </p>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} {settings.storeName} — Pedido e retirada no
            local. Pagamento na retirada.
          </p>
        </div>
      </footer>

      {cartOpen && (
        <CartDrawer
          onClose={() => setCartOpen(false)}
          prepTime={settings.prepTimeMinutes ?? 30}
        />
      )}
    </div>
  );
}

function CartDrawer({
  onClose,
  prepTime,
}: {
  onClose: () => void;
  prepTime: number;
}) {
  const router = useRouter();
  const { items, setQuantity, removeItem } = useCart();
  const subtotal = cartSubtotal(items);

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-background shadow-2xl sm:animate-slide-up md:animate-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <ShoppingBag className="h-5 w-5 text-brand-600" />
            Seu pedido
          </h2>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm font-medium">Seu carrinho está vazio</p>
              <p className="text-xs text-muted-foreground">
                Adicione produtos para começar seu pedido.
              </p>
              <Button
                className="mt-3"
                variant="outline"
                onClick={() => {
                  onClose();
                  router.push("/");
                }}
              >
                Ver produtos
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li
                  key={item.productId}
                  className="flex gap-3 rounded-2xl border border-border bg-card p-3"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                      <UtensilsCrossed className="h-6 w-6" />
                    </span>
                  )}
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold leading-tight">
                        {item.name}
                      </p>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="text-muted-foreground hover:text-danger"
                        aria-label={`Remover ${item.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(item.unitPrice)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        onClick={() => setQuantity(item.productId, item.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                        aria-label="Diminuir"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          setQuantity(item.productId, item.quantity + 1)
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border"
                        aria-label="Aumentar"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <span className="ml-auto flex items-baseline gap-1 text-sm">
                        <span className="text-xs text-muted-foreground">subtotal</span>
                        <span className="font-semibold">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </span>
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t border-border px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-lg font-bold">{formatCurrency(subtotal)}</span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">
              Tempo estimado de preparo: {prepTime} min
            </p>
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                onClose();
                router.push("/checkout");
              }}
            >
              Continuar e finalizar pedido
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}