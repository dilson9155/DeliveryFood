import Link from "next/link";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });
  const logoUrl = settings?.logoUrl ?? null;
  const storeName = settings?.storeName ?? "Delivery Food";

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b border-border bg-background">
        <div className="container-app flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt={`Logo ${storeName}`}
                className="h-10 w-10 rounded-xl object-cover ring-1 ring-border"
              />
            ) : (
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
                <UtensilsCrossed className="h-5 w-5" />
              </span>
            )}
            <span className="text-base font-bold">{storeName}</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para a loja
          </Link>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Logo grande centralizada (se houver) */}
          {logoUrl && (
            <div className="mb-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={`Logo ${storeName}`}
                className="h-24 w-24 rounded-3xl object-cover shadow-md ring-1 ring-border"
              />
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
