"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2, KeyRound } from "lucide-react";
import { resetPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(resetPasswordAction, {});

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold">Nova senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Defina uma nova senha para sua conta.
      </p>

      {state.error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <Label htmlFor="password">Nova senha</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Salvar nova senha
        </Button>
      </form>
    </div>
  );
}