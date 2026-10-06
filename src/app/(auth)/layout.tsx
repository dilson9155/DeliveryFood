import Link from "next/link";
import { UtensilsCrossed, ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await prisma.settings.findUnique({ where: { id: "default" } });

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="border-b border-border bg-background">
        <div className="container-app flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <span className="text-base font-bold">{settings?.storeName ?? "Delivery Food"}</span>
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
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}