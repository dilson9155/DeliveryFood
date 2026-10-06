import type { Metadata } from "next";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Nova senha" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="rounded-3xl border border-border bg-card p-6 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Link inválido. Solicite um novo link de recuperação.
        </p>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}