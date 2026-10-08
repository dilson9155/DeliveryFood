"use client";

import { useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { Receipt as ReceiptIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButtons } from "@/components/ui/print-buttons";
import { formatCurrency, formatDateTime, formatPhone } from "@/lib/format";
import { PAYMENT_LABELS, STATUS_LABELS, orderNumberLabel } from "@/lib/order-ui";
import { TEMPLATES, DEFAULT_TEMPLATE_ID, type PrintTemplate } from "@/lib/print-templates";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";

type ReceiptOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  discountReason: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  observation: string | null;
  createdAt: string;
  customer: { name: string; phone: string | null };
  items: {
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  payment: {
    id: string;
    method: PaymentMethod;
    status: PaymentStatus;
    confirmedAt: string | null;
  } | null;
};

export function Receipt({
  order,
  settings,
}: {
  order: ReceiptOrder;
  settings: {
    storeName: string;
    logoUrl: string | null;
    cnpj: string | null;
    phone: string | null;
    address: string | null;
    number: string | null;
    complement: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    receiptMessage: string | null;
    receiptFooter: string | null;
    printTemplateId: string | null;
  };
}) {
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [templateId, setTemplateId] = useState<string>(
    settings.printTemplateId ?? DEFAULT_TEMPLATE_ID
  );
  const template: PrintTemplate = useMemo(
    () => TEMPLATES[templateId] ?? TEMPLATES[DEFAULT_TEMPLATE_ID],
    [templateId]
  );

  // Aplica CSS do template
  useEffect(() => {
    const id = "receipt-template-css";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = templateCss(template);
  }, [template]);

  function padLine(left: string, right: string, width: number): string {
    const total = width;
    const maxLeft = Math.max(0, total - right.length - 1);
    const l = left.length > maxLeft ? left.slice(0, maxLeft) : left;
    const spaces = total - l.length - right.length;
    return l + " ".repeat(Math.max(1, spaces)) + right;
  }

  return (
    <div className="container-store py-8">
      <div className="mx-auto max-w-2xl">
        {/* Toolbar (não imprime) */}
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <ReceiptIcon className="h-5 w-5 text-brand-600" />
            Recibo do pedido
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <TemplateSelector value={templateId} onChange={setTemplateId} />
            <PrintButtons
              targetRef={receiptRef}
              documentTitle={`Recibo-${orderNumberLabel(order.number)}`}
              variant="default"
              size="default"
            />
          </div>
        </div>

        {/* Recibo (modelo térmico) */}
        <div
          ref={receiptRef}
          className="receipt mx-auto bg-background shadow-sm"
          style={{ maxWidth: `${template.contentWidthMm}mm` }}
        >
          {/* Cabeçalho da loja */}
          <div className="center">
            {settings.logoUrl && template.showLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logoUrl}
                alt={settings.storeName}
                className="mx-auto mb-2 max-h-16"
              />
            )}
            <h1>{settings.storeName}</h1>
            {settings.cnpj && (
              <div className="small">CNPJ: {settings.cnpj}</div>
            )}
            {settings.address && (
              <div className="small">
                {settings.address}
                {settings.number ? `, ${settings.number}` : ""}
                {settings.complement ? ` - ${settings.complement}` : ""}
              </div>
            )}
            {(settings.neighborhood || settings.city) && (
              <div className="small">
                {settings.neighborhood}
                {settings.city ? `, ${settings.city}` : ""}
                {settings.state ? `/${settings.state}` : ""}
                {settings.zipCode ? ` · CEP ${settings.zipCode}` : ""}
              </div>
            )}
            {settings.phone && (
              <div className="small">Tel: {formatPhone(settings.phone)}</div>
            )}
          </div>

          <hr />

          {/* Cabeçalho do pedido */}
          <div className="row">
            <div className="bold">Pedido {orderNumberLabel(order.number)}</div>
            <div className="bold">{STATUS_LABELS[order.status]}</div>
          </div>
          <div className="row small">
            <div>{formatDateTime(order.createdAt)}</div>
            <div>Pagto: {PAYMENT_LABELS[order.paymentMethod]}</div>
          </div>

          <hr />

          {/* Cliente */}
          <div>
            <h2>Cliente</h2>
            <div>{order.customer.name}</div>
            {order.customer.phone && (
              <div className="small">{formatPhone(order.customer.phone)}</div>
            )}
          </div>

          <hr />

          {/* Itens */}
          <div>
            <h2>Itens</h2>
            {order.items.map((i) => (
              <div key={i.id} className="item-row">
                <div className="grow">{i.productName}</div>
                <div className="qty">{i.quantity}x</div>
                <div className="price">{formatCurrency(i.subtotal)}</div>
              </div>
            ))}
            <div className="small">
              {order.items.map((i) => (
                <div key={i.id} className="row">
                  <div>{i.quantity} × {formatCurrency(i.unitPrice)}</div>
                  <div>{formatCurrency(i.subtotal)}</div>
                </div>
              ))}
            </div>
          </div>

          <hr />

          {/* Totais */}
          <div>
            <div className="row">
              <div>Subtotal</div>
              <div>{formatCurrency(order.subtotal)}</div>
            </div>
            {order.deliveryFee > 0 && (
              <div className="row">
                <div>Taxa de entrega</div>
                <div>{formatCurrency(order.deliveryFee)}</div>
              </div>
            )}
            {order.discount > 0 && (
              <div className="row">
                <div>
                  Desconto{order.discountReason ? ` (${order.discountReason})` : ""}
                </div>
                <div>−{formatCurrency(order.discount)}</div>
              </div>
            )}
            <div className="total-row">
              <div>TOTAL</div>
              <div>{formatCurrency(order.total)}</div>
            </div>
          </div>

          {/* Pagamento */}
          <hr />
          <div>
            <h2>Pagamento</h2>
            <div className="row">
              <div>Forma</div>
              <div>{PAYMENT_LABELS[order.paymentMethod]}</div>
            </div>
            <div className="row">
              <div>Status</div>
              <div>
                {order.paymentStatus === "CONFIRMED" ? "Confirmado" : "Pendente"}
              </div>
            </div>
          </div>

          {/* Observação */}
          {order.observation && (
            <>
              <hr />
              <div>
                <h2>Observação</h2>
                <div>{order.observation}</div>
              </div>
            </>
          )}

          {/* Mensagem customizada */}
          {settings.receiptMessage && (
            <>
              <hr />
              <div className="center small">{settings.receiptMessage}</div>
            </>
          )}

          {/* Rodapé padrão */}
          <div className="footer-msg">
            {settings.receiptFooter ||
              "Obrigado pela preferência!"}
          </div>

          {/* Marca de corte */}
          <div className="cut-here">— ✂ —</div>
        </div>
      </div>
    </div>
  );

  // Função utilitária não utilizada — referência para IDE
  padLine;
}

function TemplateSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        {Object.values(TEMPLATES).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// CSS do template (injetado dinamicamente)
function templateCss(t: PrintTemplate): string {
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
      background: white;
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
    .receipt .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 1px 0;
    }
    .receipt .row > .grow { flex: 1; }
    .receipt .item-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 6px;
      padding: 1px 0;
      align-items: baseline;
    }
    .receipt .item-row .qty {
      text-align: right;
      font-weight: 700;
    }
    .receipt .item-row .price { text-align: right; min-width: 70px; }
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
    .receipt .small { font-size: ${t.baseFontPx - 2}px; opacity: 0.85; }
  `;
}