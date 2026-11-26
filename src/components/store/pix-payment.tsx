"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  Copy,
  CheckCircle2,
  QrCode,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
  MessageCircle,
  BellRing,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/format";
import {
  createPixForOrderAction,
  createStaticPixForOrderAction,
  notifyStaticPixPaymentAction,
  refreshPixStatusAction,
} from "@/app/actions/payments";

type PixPaymentProps = {
  orderId: string;
  amount: number;
  initialQrBase64: string | null;
  initialQrText: string | null;
  initialPixExpiresAt: string | null;
  initialStatus: "PENDING" | "PAID" | "EXPIRED" | "DECLINED" | null;
  provider: "MANUAL" | "ASAAS" | "PAGBANK" | null;
  /** PIX estático configurado no painel; usado quando ainda não há PaymentIntent. */
  staticPixConfigured?: boolean;
  whatsapp?: string | null;
};

type Status = "idle" | "creating" | "pending" | "paid" | "expired" | "error";

type ErrorInfo = { message: string; canRetry: boolean };

export function PixPayment({
  orderId,
  amount,
  initialQrBase64,
  initialQrText,
  initialPixExpiresAt,
  initialStatus,
  provider,
  staticPixConfigured,
  whatsapp,
}: PixPaymentProps) {
  const router = useRouter();
  const { show } = useToast();
  const isStatic = provider === "MANUAL" || (provider === null && staticPixConfigured === true);
  const [status, setStatus] = useState<Status>(
    initialQrBase64 || initialQrText ? (initialStatus === "PAID" ? "paid" : "pending") : "idle"
  );
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [qrBase64, setQrBase64] = useState(initialQrBase64);
  const [qrText, setQrText] = useState(initialQrText);
  const [expiresAt, setExpiresAt] = useState(
    initialPixExpiresAt ? new Date(initialPixExpiresAt) : null
  );
  const [displayAmount, setDisplayAmount] = useState(amount);
  const [countdown, setCountdown] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isNotifying, startNotify] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Contador regressivo (somente PIX via Asaas, que tem validade)
  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const ms = expiresAt.getTime() - Date.now();
      if (ms <= 0) {
        setCountdown("Expirado");
        setStatus("expired");
        return;
      }
      const totalSec = Math.floor(ms / 1000);
      const hours = Math.floor(totalSec / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;
      if (hours > 0)
        setCountdown(`${hours}h ${String(minutes).padStart(2, "0")}min`);
      else
        setCountdown(
          `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        );
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  // Polling do status (no PIX estático a confirmação é feita no painel admin)
  useEffect(() => {
    if (status !== "pending") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      const res = await refreshPixStatusAction(orderId);
      if (res.ok && res.paid) {
        setStatus("paid");
        show("success", "Pagamento confirmado! 🎉");
        router.refresh();
      }
    }, 6000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, orderId, router, show]);

  function handleCreate() {
    startTransition(async () => {
      const res = isStatic
        ? await createStaticPixForOrderAction(orderId)
        : await createPixForOrderAction(orderId);
      if (!res.ok) {
        show("error", res.error);
        setErrorInfo({
          message: res.error,
          canRetry: !res.error.includes("CPF/CNPJ"),
        });
        setStatus("error");
        return;
      }
      // O QR é renderizado no cliente a partir do copia-e-cola (BR Code).
      setErrorInfo(null);
      setQrBase64("qrBase64" in res ? res.qrBase64 : null);
      setQrText(res.qrText);
      setDisplayAmount("amount" in res ? res.amount : amount);
      setExpiresAt(
        "expiresAt" in res && res.expiresAt ? new Date(res.expiresAt) : null
      );
      setCopied(false);
      setStatus("pending");
      router.refresh();
    });
  }

  function copyPix() {
    if (!qrText) return;
    navigator.clipboard
      .writeText(qrText)
      .then(() => {
        setCopied(true);
        show("success", "Código PIX copiado");
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => show("error", "Não foi possível copiar. Selecione o código manualmente."));
  }

  function notifyPaid() {
    startNotify(async () => {
      const res = await notifyStaticPixPaymentAction(orderId);
      if (!res.ok) {
        show("error", res.error);
        return;
      }
      show("success", "Avisamos o estabelecimento. Confira com o balcão antes de retirar.");
    });
  }

  const waLink = (() => {
    const digits = (whatsapp ?? "").replace(/\D/g, "");
    if (digits.length < 10) return null;
    const phone = digits.startsWith("55") ? digits : `55${digits}`;
    const text = encodeURIComponent(
      `Olá! Já paguei o PIX do pedido #${orderId.slice(0, 8).toUpperCase()}.`
    );
    return `https://wa.me/${phone}?text=${text}`;
  })();

  // Estado: precisa gerar o PIX
  if (status === "idle") {
    return (
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
          <QrCode className="h-4 w-4 text-brand-600" />
          Pagamento via PIX
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {isStatic
            ? `Gere seu QR Code e pague ${formatCurrency(amount)}. A confirmação é feita no balcão.`
            : `Pague com PIX para confirmar seu pedido instantaneamente. Valor: ${formatCurrency(amount)}`}
        </p>
        <Button onClick={handleCreate} disabled={isPending} className="w-full" size="lg">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <QrCode className="h-4 w-4" />
          )}
          Gerar QR Code PIX
        </Button>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card className="p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-danger">
          <AlertCircle className="h-4 w-4" />
          Erro ao gerar pagamento
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {errorInfo?.message ??
            "Não conseguimos gerar o PIX agora. Tente novamente ou escolha outro método de pagamento."}
        </p>
        {errorInfo?.message?.includes("CPF/CNPJ") && (
          <p className="mb-3 text-sm font-medium">
            <Link href="/meus-dados" className="text-brand-600 hover:underline">
              → Atualizar meus dados (CPF/CNPJ)
            </Link>
          </p>
        )}
        {errorInfo?.canRetry !== false && (
          <Button onClick={handleCreate} disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Tentar novamente
          </Button>
        )}
      </Card>
    );
  }

  if (status === "paid") {
    return (
      <Card className="border-success/30 bg-success/5 p-5">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-success">
          <CheckCircle2 className="h-4 w-4" />
          Pagamento confirmado
        </h2>
        <p className="text-sm text-muted-foreground">
          Recebemos seu pagamento de <strong>{formatCurrency(displayAmount)}</strong>.
          Seu pedido já está sendo preparado.
        </p>
      </Card>
    );
  }

  // Pending ou expired
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-brand-50 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-brand-700">
          <QrCode className="h-4 w-4" />
          Pague com PIX
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isStatic
            ? "Escaneie o QR Code ou copie o código. Válido até o pagamento."
            : "Escaneie o QR Code ou copie o código abaixo"}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-start">
        {qrText ? (
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div className="rounded-xl border border-border bg-white p-3">
              <QRCodeSVG value={qrText} size={168} level="M" marginSize={0} />
            </div>
            {expiresAt && status !== "expired" && (
              <span className="flex items-center gap-1 text-xs font-medium text-warning">
                <Clock className="h-3 w-3" />
                Expira em {countdown}
              </span>
            )}
            {status === "expired" && (
              <span className="flex items-center gap-1 text-xs font-medium text-danger">
                <AlertCircle className="h-3 w-3" />
                QR Code expirado
              </span>
            )}
          </div>
        ) : qrBase64 ? (
          <div className="flex shrink-0 flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${qrBase64}`}
              alt="QR Code PIX"
              className="h-48 w-48 rounded-xl border border-border bg-white p-2"
            />
          </div>
        ) : null}

        <div className="flex w-full flex-1 flex-col gap-3">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Valor do PIX</p>
            <p className="text-2xl font-extrabold text-brand-700">
              {formatCurrency(displayAmount)}
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              PIX copia-e-cola
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={qrText ?? ""}
                className="flex-1 truncate rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                onClick={(e) => e.currentTarget.select()}
              />
              <Button onClick={copyPix} disabled={!qrText} size="sm" variant="outline">
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </div>

          {isStatic ? (
            <div className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
              <strong>Pagamento confirmado no balcão.</strong> Após pagar, avise a loja
              para liberarmos seu pedido.
            </div>
          ) : (
            <div className="rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
              <strong>Aguardando pagamento.</strong> Atualizamos o status automaticamente
              assim que o pagamento for confirmado.
            </div>
          )}

          {isStatic && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={notifyPaid}
                disabled={isNotifying}
                variant="outline"
                className="flex-1"
              >
                <BellRing className="h-4 w-4" />
                {isNotifying ? "Enviando..." : "Já paguei"}
              </Button>
              {waLink && (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                >
                  <MessageCircle className="h-4 w-4" />
                  Avisar no WhatsApp
                </a>
              )}
            </div>
          )}

          {status === "expired" && (
            <Button onClick={handleCreate} disabled={isPending} variant="outline">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Gerar novo QR Code
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
