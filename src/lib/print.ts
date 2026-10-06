/**
 * Helpers para impressão e geração de PDF via browser nativo.
 *
 * Não usa libs externas. O Chrome/Edge/Firefox já têm
 * "Imprimir → Salvar como PDF" no dialog nativo.
 */

declare global {
  interface Window {
    print: () => void;
  }
}

/** Abre o dialog de impressão do browser (com opção de salvar como PDF) */
export function browserPrint() {
  if (typeof window !== "undefined") {
    window.print();
  }
}

/**
 * Abre o dialog de impressão apontado para um elemento específico.
 * Ideal para relatórios: cria um iframe escondido, injeta só o
 * conteúdo do elemento, espera carregar e chama print().
 */
export function printElement(element: HTMLElement, title = "Documento") {
  if (typeof document === "undefined") return;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    // popup bloqueado: fallback para print normal
    window.print();
    return;
  }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("\n");
  const html = `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        ${styles}
        <style>
          @page { size: A4; margin: 12mm; }
          body { padding: 16px; font-family: system-ui, sans-serif; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 12px; }
          th { background: #f9fafb; font-weight: 600; }
          .no-print { display: none !important; }
        </style>
      </head>
      <body>
        ${element.outerHTML}
      </body>
    </html>
  `;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Espera carregar imagens
  setTimeout(() => {
    win.print();
  }, 250);
}