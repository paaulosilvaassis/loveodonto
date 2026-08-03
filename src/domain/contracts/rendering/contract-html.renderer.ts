/**
 * @module domain/contracts/rendering/contract-html.renderer
 * @description HTML de impressão sanitizado e determinístico — Phase 10.7.
 */

import type { ContractDomainWarning } from '../contract.errors.js';
import { createContractDomainError } from '../contract.errors.js';
import { sha256Utf8 } from '../files/contract-binary-hash.js';
import type { ContractDocumentRenderModel } from './contract-document-render.model.js';

export interface ContractHtmlRenderOptions {
  includeSignatureBlocks?: boolean;
  technicalDemoBanner?: boolean;
}

export interface RenderedContractHtml {
  html: string;
  plainText: string;
  sha256: string;
  warnings: ContractDomainWarning[];
}

export interface ContractHtmlRenderer {
  render(
    model: ContractDocumentRenderModel,
    options?: ContractHtmlRenderOptions,
  ): Promise<RenderedContractHtml>;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripDangerous(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

export function createContractHtmlRenderer(): ContractHtmlRenderer {
  return {
    async render(model, options = {}) {
      if (!model?.documentHash || !model.contractId) {
        throw Object.assign(new Error('Render model inválido.'), {
          domainError: createContractDomainError(
            'CONTRACT_HTML_RENDER_FAILED',
            'Render model inválido para HTML.',
          ),
        });
      }

      const warnings: ContractDomainWarning[] = [];
      const includeSig = options.includeSignatureBlocks !== false;
      const banner = options.technicalDemoBanner !== false
        ? '<p class="demo-banner">DOCUMENTO TÉCNICO DE DEMONSTRAÇÃO — SEM VALOR JURÍDICO</p>'
        : '';

      const sectionsHtml = model.sections
        .slice()
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
        .map((s) => `
<section class="ctr-section" data-section="${escapeHtml(s.key)}">
  <h2>${escapeHtml(s.title)}</h2>
  <div class="ctr-section-body">${escapeHtml(s.bodyText).replace(/\n/g, '<br/>')}</div>
</section>`).join('\n');

      const sigHtml = includeSig
        ? model.signatureBlocks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((b) => `
<div class="sig-block" data-role="${escapeHtml(b.role)}">
  <div class="sig-line"></div>
  <p>${escapeHtml(b.name)} — ${escapeHtml(b.role)}${b.required ? ' (obrigatório)' : ''}</p>
</div>`).join('\n')
        : '';

      const htmlRaw = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(model.title)}</title>
<style>
  body{font-family:Georgia,serif;color:#111;margin:24px;font-size:12pt;line-height:1.45}
  .demo-banner{background:#fff3cd;border:1px solid #f0d78c;padding:8px;font-weight:bold}
  .header{border-bottom:1px solid #333;padding-bottom:8px;margin-bottom:16px}
  .meta{font-size:10pt;color:#333}
  table.meta-table{width:100%;border-collapse:collapse;margin:12px 0}
  table.meta-table th,table.meta-table td{border:1px solid #ccc;padding:4px 6px;text-align:left}
  thead{display:table-header-group}
  .sig-block{break-inside:avoid;margin-top:28px}
  .sig-line{border-top:1px solid #111;width:240px;margin-top:40px}
  .footer{margin-top:24px;font-size:9pt;color:#444;border-top:1px solid #ccc;padding-top:8px}
  .page-break{break-before:page}
</style>
</head>
<body>
${banner}
<header class="header">
  <h1>${escapeHtml(model.header.legalName)}</h1>
  <p class="meta">${escapeHtml(model.header.tradeName || '')}</p>
  <p class="meta">${escapeHtml(model.header.cnpjMasked || '')} · ${escapeHtml(model.header.addressFull || '')}</p>
  <p class="meta">${escapeHtml(model.header.phone || '')} · RT: ${escapeHtml(model.header.responsibleProfessionalName || '')} ${escapeHtml(model.header.responsibleProfessionalCro || '')}</p>
</header>
<table class="meta-table">
  <thead><tr><th>Campo</th><th>Valor</th></tr></thead>
  <tbody>
    <tr><td>Número</td><td>${escapeHtml(model.contractNumber)}</td></tr>
    <tr><td>Tipo</td><td>${escapeHtml(model.documentType)}</td></tr>
    <tr><td>Versão</td><td>${escapeHtml(String(model.versionNumber))}</td></tr>
    <tr><td>Emissão</td><td>${escapeHtml(model.issuedAt || model.renderedAt)}</td></tr>
    <tr><td>Paciente</td><td>${escapeHtml(model.patientDisplayName || '—')}</td></tr>
    <tr><td>Responsável</td><td>${escapeHtml(model.guardianDisplayName || '—')}</td></tr>
  </tbody>
</table>
<main>
${sectionsHtml}
</main>
<section class="signatures page-break">
  <h2>Assinaturas</h2>
  ${sigHtml}
</section>
<footer class="footer">
  <p>Página — · Contrato ${escapeHtml(model.footer.contractIdShort)} · Versão ${escapeHtml(model.footer.versionIdShort)} · Hash ${escapeHtml(model.footer.documentHashShort)}${model.footer.verificationCodeHint ? ` · Verif. ${escapeHtml(model.footer.verificationCodeHint)}` : ''}</p>
</footer>
</body>
</html>`;

      const html = stripDangerous(htmlRaw);
      if (/<script|<iframe|javascript:/i.test(html)) {
        throw Object.assign(new Error('HTML inseguro.'), {
          domainError: createContractDomainError(
            'CONTRACT_HTML_RENDER_FAILED',
            'HTML sanitizado ainda contém conteúdo bloqueado.',
          ),
        });
      }

      const plainText = [
        model.header.legalName,
        model.title,
        model.contractNumber,
        ...model.sections.map((s) => `${s.title}\n${s.bodyText}`),
        ...model.signatureBlocks.map((b) => `${b.role}: ${b.name}`),
        model.documentHash,
      ].join('\n\n');

      const hash = await sha256Utf8(html);
      return { html, plainText, sha256: hash, warnings };
    },
  };
}
