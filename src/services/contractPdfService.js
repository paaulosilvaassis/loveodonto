/**
 * Exporta HTML do contrato para PDF (client-side) e dispara impressão nativa.
 */
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

function appendSignatureBlock(html) {
  const sig = `
    <div class="contract-signatures">
      <div>
        <div class="sig-line" aria-hidden="true"></div>
        <small>Assinatura do paciente / responsável</small>
      </div>
      <div>
        <div class="sig-line" aria-hidden="true"></div>
        <small>Assinatura da clínica</small>
      </div>
    </div>`;
  if (String(html || '').includes('contract-signatures')) return html;
  return `${html || ''}${sig}`;
}

/**
 * @param {HTMLElement} element — nó visível com classe contract-print-root (recomendado)
 * @param {string} [filename]
 */
export async function downloadContractPdfFromElement(element, filename = 'contrato.pdf') {
  if (!element || !(element instanceof HTMLElement)) {
    throw new Error('Elemento inválido para gerar PDF.');
  }
  const clone = element.cloneNode(true);
  clone.classList.add('contract-print-root');
  const wrap = document.createElement('div');
  wrap.style.position = 'fixed';
  wrap.style.left = '-9999px';
  wrap.style.top = '0';
  wrap.style.width = element.offsetWidth ? `${element.offsetWidth}px` : '794px';
  wrap.appendChild(clone);
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const usableW = pageWidth - margin * 2;
    const usableH = pageHeight - margin * 2;
    const imgHeightMm = (canvas.height * usableW) / canvas.width;
    let heightLeft = imgHeightMm;
    let position = margin;
    pdf.addImage(imgData, 'PNG', margin, position, usableW, imgHeightMm);
    heightLeft -= usableH;
    while (heightLeft > 0) {
      position = margin - (imgHeightMm - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', margin, position, usableW, imgHeightMm);
      heightLeft -= usableH;
    }
    pdf.save(filename);
  } finally {
    wrap.remove();
  }
}

/** HTML completo para preview/impressão (com área de assinatura). */
export function contractHtmlWithSignatures(renderedHtml) {
  return appendSignatureBlock(renderedHtml || '');
}

/**
 * Marca o elemento como alvo de @media print e chama window.print().
 * @param {HTMLElement} element
 */
export function printContractElement(element) {
  if (!element || !(element instanceof HTMLElement)) return;
  element.classList.add('contract-print-root--printing');
  const onAfter = () => {
    element.classList.remove('contract-print-root--printing');
    window.removeEventListener('afterprint', onAfter);
  };
  window.addEventListener('afterprint', onAfter);
  window.print();
}
