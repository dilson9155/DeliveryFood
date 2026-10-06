"use client";

import { Printer, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { browserPrint } from "@/lib/print";

type Props = {
  /** Ref do elemento a ser impresso (se vazio, imprime a página inteira) */
  targetRef?: React.RefObject<HTMLElement | null>;
  /** Texto do botão Imprimir */
  printLabel?: string;
  /** Texto do botão PDF */
  pdfLabel?: string;
  /** Título do documento (apenas para a versão PDF) */
  documentTitle?: string;
  /** Tamanho dos botões (default: sm) */
  size?: "sm" | "default" | "lg";
  /** Variante visual dos botões */
  variant?: "outline" | "default" | "ghost";
  /** Esconde o texto (mostra só os ícones) — útil em layouts compactos */
  compact?: boolean;
  /** Classe adicional p/ container */
  className?: string;
};

/**
 * Par de botões: Imprimir + PDF (que na verdade usa o dialog de impressão
 * do browser — o usuário escolhe "Salvar como PDF" lá).
 *
 * Funciona em todos os browsers modernos sem dependência externa.
 */
export function PrintButtons({
  targetRef,
  printLabel = "Imprimir",
  pdfLabel = "PDF",
  documentTitle = "Documento",
  size = "sm",
  variant = "outline",
  compact = false,
  className,
}: Props) {
  function handlePrint() {
    if (targetRef?.current) {
      // Para elementos específicos, clona e abre janela
      import("@/lib/print").then((m) => m.printElement(targetRef.current!, documentTitle));
    } else {
      browserPrint();
    }
  }

  return (
    <div className={`flex items-center gap-1.5 ${className ?? ""}`}>
      <Button
        size={size}
        variant={variant}
        onClick={handlePrint}
        title="Imprimir"
      >
        <Printer className="h-3.5 w-3.5" />
        {!compact && <span>{printLabel}</span>}
      </Button>
      <Button
        size={size}
        variant={variant}
        onClick={handlePrint}
        title="Salvar como PDF"
      >
        <FileDown className="h-3.5 w-3.5" />
        {!compact && <span>{pdfLabel}</span>}
      </Button>
    </div>
  );
}