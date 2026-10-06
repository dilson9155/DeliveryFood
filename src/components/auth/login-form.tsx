"use client";

import { useActionState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, LogIn } from "lucide-react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, {});

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold">Bem-vindo de volta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Entre com telefone, e-mail ou login (motoboys).
      </p>

      {state.error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="identifier">Telefone, e-mail ou login</Label>
          <Input
            id="identifier"
            name="identifier"
            autoComplete="username"
            placeholder="(31) 99999-9999, email@exemplo.com ou login"
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link
              href="/esqueci-senha"
              className="mb-1.5 text-xs text-brand-600 hover:underline"
            >
              Esqueceu a senha?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Sua senha"
            required
          />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          Entrar
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-brand-600 hover:underline">
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}