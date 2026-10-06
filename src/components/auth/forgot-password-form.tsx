"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2, KeyRound } from "lucide-react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(forgotPasswordAction, {});

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold">Recuperar senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Informe seu telefone ou e-mail cadastrado.
      </p>

      {state.error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/20 bg-success/10 px-3 py-2.5 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p>{state.success}</p>
            {state.devResetLink && (
              <div className="rounded-lg bg-white/60 p-2 text-xs">
                <p className="mb-1 font-medium">Ambiente de desenvolvimento:</p>
                <a href={state.devResetLink} className="break-all text-success underline">
                  {state.devResetLink}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="identifier">Telefone ou e-mail</Label>
          <Input
            id="identifier"
            name="identifier"
            placeholder="(31) 99999-9999 ou email@exemplo.com"
            required
          />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          Gerar link de recuperação
        </Button>
      </form>
    </div>
  );
}