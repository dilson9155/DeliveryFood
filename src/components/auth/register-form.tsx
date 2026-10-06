"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Loader2, UserPlus } from "lucide-react";
import { registerAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { formatTaxId } from "@/lib/format";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, {});
  const [taxIdDisplay, setTaxIdDisplay] = useState("");

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold">Criar conta</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cadastro rápido — só o essencial para fazer pedidos.
      </p>

      {state.error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {state.error}
        </div>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <Label htmlFor="name">Nome completo</Label>
          <Input
            id="name"
            name="name"
            placeholder="Seu nome completo"
            autoComplete="name"
            required
            minLength={2}
          />
        </div>
        <div>
          <Label htmlFor="phone">Telefone (com DDD)</Label>
          <Input
            id="phone"
            name="phone"
            placeholder="(31) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
            required
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Use o telefone para entrar no sistema.
          </p>
        </div>
        <div>
          <Label htmlFor="taxId">
            CPF ou CNPJ <span className="text-danger">*</span>
          </Label>
          <Input
            id="taxId"
            name="taxId"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            inputMode="numeric"
            autoComplete="off"
            required
            value={taxIdDisplay}
            onChange={(e) => setTaxIdDisplay(formatTaxId(e.target.value))}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Necessário para emissão de PIX e notas.
          </p>
        </div>
        <div>
          <Label htmlFor="email">E-mail <span className="text-muted-foreground">(opcional)</span></Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="voce@email.com (opcional)"
            autoComplete="email"
          />
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
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
            <UserPlus className="h-4 w-4" />
          )}
          Criar conta
        </Button>
      </form>

      <p className="mt-2 text-xs text-muted-foreground">
        Ao se cadastrar você concorda com o uso de seus dados para realizar pedidos neste estabelecimento.
      </p>
    </div>
  );
}