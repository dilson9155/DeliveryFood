/**
 * Templates de impressão pré-configurados para impressoras térmicas.
 *
 * Cada template define largura de papel, fontes, padding e quebras.
 * CSS é injetado dinamicamente baseado no template escolhido.
 *
 * Para adicionar nova impressora, basta inserir outro objeto em TEMPLATES.
 */

export type PrintTemplate = {
  id: string;
  name: string;
  description: string;
  /** Largura do papel (mm) — usada na regra @page size */
  paperWidthMm: number;
  /** Padding da página (mm) */
  pagePaddingMm: number;
  /** Largura útil para conteúdo (geralmente paperWidth - 2×padding) */
  contentWidthMm: number;
  /** Tamanho base da fonte (px) */
  baseFontPx: number;
  /** Tamanho de fonte do título/header (px) */
  titleFontPx: number;
  /** Fonte monoespaçada p/ alinhamento (tamanho em px) */
  monoFontPx: number;
  /** Espaçamento entre linhas (1.0, 1.2, 1.4...) */
  lineHeight: number;
  /** Mostra logo/header */
  showLogo: boolean;
  /** Adiciona QR Code no fim (se for implementar PIX etc.) */
  showQrCode: boolean;
};

export const TEMPLATES: Record<string, PrintTemplate> = {
  thermal80: {
    id: "thermal80",
    name: "Térmica 80mm (padrão)",
    description:
      "Para impressoras 80mm (Epson TM-T20, Elgin i9, Bematech MP-4200 TH). A maioria das impressoras de balcão.",
    paperWidthMm: 80,
    pagePaddingMm: 4,
    contentWidthMm: 72,
    baseFontPx: 12,
    titleFontPx: 16,
    monoFontPx: 12,
    lineHeight: 1.3,
    showLogo: true,
    showQrCode: false,
  },
  thermal58: {
    id: "thermal58",
    name: "Térmica 58mm",
    description:
      "Para impressoras 58mm (Daruma DR800, Bematech MP-100S). Cupons mais compactos.",
    paperWidthMm: 58,
    pagePaddingMm: 5,
    contentWidthMm: 48,
    baseFontPx: 11,
    titleFontPx: 14,
    monoFontPx: 11,
    lineHeight: 1.3,
    showLogo: true,
    showQrCode: false,
  },
  thermal76: {
    id: "thermal76",
    name: "Térmica 76mm",
    description: "Para impressoras 76mm (Bematech MP-100S TH).",
    paperWidthMm: 76,
    pagePaddingMm: 4,
    contentWidthMm: 68,
    baseFontPx: 12,
    titleFontPx: 15,
    monoFontPx: 12,
    lineHeight: 1.3,
    showLogo: true,
    showQrCode: false,
  },
  a4: {
    id: "a4",
    name: "A4 normal (PDF)",
    description:
      "Para impressora comum A4 ou geração de PDF. Maior, mais detalhado.",
    paperWidthMm: 210,
    pagePaddingMm: 12,
    contentWidthMm: 186,
    baseFontPx: 14,
    titleFontPx: 22,
    monoFontPx: 13,
    lineHeight: 1.5,
    showLogo: true,
    showQrCode: false,
  },
};

export const DEFAULT_TEMPLATE_ID = "thermal80";

export function getTemplate(id?: string | null): PrintTemplate {
  if (id && id in TEMPLATES) return TEMPLATES[id];
  return TEMPLATES[DEFAULT_TEMPLATE_ID];
}

/** Gera CSS dinâmico baseado no template */
export function templateCss(t: PrintTemplate): string {
  return `
    @page {
      size: ${t.paperWidthMm}mm auto;
      margin: 0;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: white !important;
      }
      .no-print { display: none !important; }
    }
    html, body {
      font-family: 'Courier New', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: ${t.baseFontPx}px;
      line-height: ${t.lineHeight};
      color: #000;
      background: white;
    }
    .receipt {
      width: ${t.contentWidthMm}mm;
      padding: ${t.pagePaddingMm}mm;
      margin: 0 auto;
      box-sizing: border-box;
    }
    .receipt .center { text-align: center; }
    .receipt .right { text-align: right; }
    .receipt .bold { font-weight: 700; }
    .receipt h1 {
      font-size: ${t.titleFontPx}px;
      font-weight: 800;
      margin: 0 0 4px 0;
      letter-spacing: 0.5px;
    }
    .receipt h2 {
      font-size: ${t.baseFontPx + 2}px;
      font-weight: 700;
      margin: 8px 0 4px 0;
      text-transform: uppercase;
    }
    .receipt hr {
      border: none;
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .receipt hr.solid {
      border-top: 1px solid #000;
    }
    .receipt .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .receipt .row > .grow { flex: 1; }
    .receipt table { width: 100%; border-collapse: collapse; }
    .receipt th, .receipt td {
      padding: 2px 0;
      vertical-align: top;
    }
    .receipt th { text-align: left; font-weight: 700; }
    .receipt td.r, .receipt th.r { text-align: right; }
    .receipt td.c, .receipt th.c { text-align: center; }
    .receipt .small { font-size: ${t.baseFontPx - 2}px; opacity: 0.8; }
    .receipt .item-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 4px;
      padding: 1px 0;
    }
    .receipt .item-row .qty { text-align: right; font-weight: 700; }
    .receipt .item-row .price { text-align: right; }
    .receipt .total-row {
      display: flex;
      justify-content: space-between;
      font-weight: 800;
      font-size: ${t.baseFontPx + 3}px;
      padding: 4px 0;
      border-top: 1px dashed #000;
      margin-top: 6px;
    }
    .receipt .footer-msg {
      text-align: center;
      margin-top: 12px;
      font-size: ${t.baseFontPx - 1}px;
    }
    .receipt .cut-here {
      margin-top: 16px;
      padding-top: 6px;
      border-top: 1px dashed #000;
      text-align: center;
      font-size: ${t.baseFontPx - 2}px;
      letter-spacing: 1px;
    }
  `;
}