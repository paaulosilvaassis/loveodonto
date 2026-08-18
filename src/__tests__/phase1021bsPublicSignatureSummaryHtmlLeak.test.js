/**
 * PHASE_10.21BS — resumo público sem HTML bruto de procedimentos.
 * Sem assinatura real. Sem e-mail real. Sem mutar CTR/ORC de produção.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  buildPublicSigningSummaryFromV1Contract,
  buildPublicSigningSummaryFromV2Session,
} from '../contracts/publicSigningSummary.js';
import { PublicSigningTreatmentSection } from '../components/contracts/public/PublicSigningSummarySections.jsx';
import { parseLegacyProcedureHtml, LEGACY_PROCEDURES_UNAVAILABLE } from '../contracts/legacyProcedureHtmlParser.js';
import { freezeProcedureRows } from '../contracts/procedureSnapshotRows.js';
import { initDb, resetDb, withDb } from '../db/index.js';
import { getContractBySignToken } from '../services/contractModuleService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

const CTR3_LEGACY_HTML = [
  '<table class="contract-table"><thead><tr>',
  '<th>Procedimento</th><th>Dente/Região</th><th>Qtd</th><th>Unit.</th><th>Total</th>',
  '</tr></thead><tbody>',
  '<tr><td>Aplicação tópica de flúor</td><td></td><td>1</td><td>150.00</td><td>150.00</td></tr>',
  '</tbody></table>',
  '<p><strong>Profissional responsável:</strong> Dra. Juliana de Oliveira Freire</p>',
].join('');

const INCONSISTENT_HTML = [
  '<table class="contract-table"><thead><tr>',
  '<th>Procedimento</th><th>Dente/Região</th><th>Qtd</th><th>Unit.</th><th>Total</th>',
  '</tr></thead><tbody>',
  '<tr><td>Restauração</td><td>16</td><td>2</td><td>150.00</td><td>200.00</td></tr>',
  '</tbody></table>',
].join('');

const MALICIOUS_HTML = [
  '<script>globalThis.__xssBs=1</script>',
  '<img src=x onerror="globalThis.__xssBs=1">',
  '<table class="contract-table"><thead><tr>',
  '<th>Procedimento</th><th>Dente/Região</th><th>Qtd</th><th>Unit.</th><th>Total</th>',
  '</tr></thead><tbody>',
  '<tr><td>Limpeza<iframe src="https://evil.example"></iframe></td><td>11</td><td>1</td><td>10.00</td><td>10.00</td></tr>',
  '</tbody></table>',
].join('');

function renderTreatment(contract) {
  const summary = buildPublicSigningSummaryFromV1Contract(contract);
  return {
    summary,
    html: renderToStaticMarkup(
      React.createElement(PublicSigningTreatmentSection, { treatment: summary.treatment }),
    ),
  };
}

describe('PHASE_10.21BS — public signature summary HTML leak', () => {
  it('A) procedures estruturados → tabela correta', () => {
    const { summary, html } = renderTreatment({
      title: 'Contrato profissional odontológico',
      contractNumber: 'CTR-2026-00003',
      clinicalSnapshotJson: {
        planName: 'Aplicação tópica de flúor',
        procedures: [{
          name: 'Aplicação tópica de flúor',
          toothRegion: '',
          quantity: 1,
          unitValue: 150,
          totalValue: 150,
        }],
        procedimentos: CTR3_LEGACY_HTML,
      },
      professionalSnapshotJson: {
        name: 'Dra. Juliana de Oliveira Freire',
        cro: '27267',
        conselhoUf: 'MG',
      },
    });
    expect(summary.treatment.proceduresSource).toBe('structured');
    expect(summary.treatment.procedureRows[0].name).toBe('Aplicação tópica de flúor');
    expect(summary.treatment.procedureRows[0].quantity).toBe(1);
    expect(html).toContain('Procedimento');
    expect(html).toContain('Valor unitário');
    expect(html).toContain('R$');
    expect(html).not.toContain('<table class="contract-table">');
  });

  it('B/C) HTML legado nunca mostra <table nem <td', () => {
    const { summary, html } = renderTreatment({
      title: 'Contrato profissional odontológico',
      contractNumber: 'CTR-2026-00003',
      clinicalSnapshotJson: { procedimentos: CTR3_LEGACY_HTML },
      professionalSnapshotJson: { name: 'Dra. Juliana de Oliveira Freire', cro: 'CRO-MG 27267' },
    });
    expect(summary.treatment.procedures.join(' ')).not.toContain('<table');
    expect(summary.treatment.procedures.join(' ')).not.toContain('<td');
    expect(html).not.toContain('contract-table');
    expect(html).not.toContain('&lt;table');
    expect(html).not.toContain('&lt;td');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toContain('<table');
    expect(html.replace(/<[^>]+>/g, ' ')).not.toContain('<td');
  });

  it('D) HTML legado válido → parser extrai procedimento', () => {
    const parsed = parseLegacyProcedureHtml(CTR3_LEGACY_HTML);
    expect(parsed.ok).toBe(true);
    expect(parsed.rows[0].name).toBe('Aplicação tópica de flúor');
    expect(parsed.rows[0].quantity).toBe(1);
    expect(parsed.rows[0].unitValue).toBe(150);
    expect(parsed.rows[0].totalValue).toBe(150);
    expect(parsed.professionalName).toContain('Juliana');
  });

  it('E) HTML malicioso → script/event handler não executa', () => {
    delete globalThis.__xssBs;
    const { summary, html } = renderTreatment({
      title: 'CTR-X',
      clinicalSnapshotJson: { procedimentos: MALICIOUS_HTML },
    });
    expect(globalThis.__xssBs).toBeUndefined();
    expect(summary.treatment.procedureRows[0].name).toBe('Limpeza');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('javascript:');
  });

  it('F) sem procedures → fallback amigável', () => {
    const { html } = renderTreatment({
      title: 'Contrato profissional odontológico',
      clinicalSnapshotJson: { procedimentos: '<ul></ul>' },
    });
    expect(html).toContain(LEGACY_PROCEDURES_UNAVAILABLE);
    expect(html).not.toContain('<ul>');
  });

  it('G) valores preservados, sem recálculo', () => {
    const { summary } = renderTreatment({
      clinicalSnapshotJson: { procedimentos: INCONSISTENT_HTML },
    });
    const row = summary.treatment.procedureRows[0];
    expect(row.quantity).toBe(2);
    expect(row.unitValue).toBe(150);
    expect(row.totalValue).toBe(200);
    expect(row.totalValue).not.toBe(300);
  });

  it('H/I) profissional separado e CRO quando disponível', () => {
    const { summary, html } = renderTreatment({
      title: 'Contrato profissional odontológico',
      clinicalSnapshotJson: { procedimentos: CTR3_LEGACY_HTML },
      professionalSnapshotJson: {
        name: 'Dra. Juliana de Oliveira Freire',
        cro: '27267',
        conselhoUf: 'MG',
      },
    });
    expect(summary.treatment.name).toBe('Aplicação tópica de flúor');
    expect(summary.treatment.professionalName).toBe('Dra. Juliana de Oliveira Freire');
    expect(summary.treatment.professionalCro).toBe('CRO-MG 27267');
    expect(html).toMatch(/Profissional responsável<\/h3>/);
    expect(html).toContain('CRO-MG 27267');
    const procBlock = html.split('Profissional responsável')[0];
    expect(procBlock).not.toContain('Dra. Juliana de Oliveira Freire');
  });

  it('J) documento completo continua acessível', () => {
    const page = readSrc('src/pages/contratos/ContractSignPublicPage.jsx');
    const cta = readSrc('src/components/contracts/public/PublicSigningSummarySections.jsx');
    expect(cta).toContain('Visualizar documento completo');
    expect(page).toContain('PublicSigningDocumentCta');
    expect(page).toContain('ContractDocumentPreview');
    expect(page).toContain('contract.renderedHtml');
    expect(cta).not.toContain('dangerouslySetInnerHTML');
  });

  it('K) token/contract binding preservado', async () => {
    await initDb();
    resetDb();
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-bs-3',
        contractNumber: 'CTR-2026-00003',
        status: 'generated',
        clinicId: 'clinic-b721c2c9',
        renderedHtml: '<p>doc</p>',
        clinicalSnapshotJson: { procedimentos: CTR3_LEGACY_HTML },
      }];
      db.contractSignLinks = [{
        id: 'link-bs',
        token: 'csgn-bs-token',
        contractId: 'gctr-bs-3',
        status: 'pending',
        signerRole: 'PATIENT',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }];
      return db;
    });
    const ok = getContractBySignToken('csgn-bs-token');
    expect(ok.contract.id).toBe('gctr-bs-3');
    expect(ok.contract.contractNumber).toBe('CTR-2026-00003');
    expect(getContractBySignToken('missing-token')).toBeNull();
    expect(getContractBySignToken('csgn-bs-token').contract.id).not.toBe('other-contract');
  });

  it('L) zero mutação jurídica no resumo', () => {
    const contract = {
      id: 'gctr-5e4a7739-2b8d-4346-8d17-ccd0ce9fbb6a',
      contractNumber: 'CTR-2026-00003',
      title: 'Contrato profissional odontológico',
      renderedHtml: '<p>documento jurídico</p>',
      documentHash: 'frozen-hash',
      clinicalSnapshotJson: { procedimentos: CTR3_LEGACY_HTML },
      professionalSnapshotJson: { name: 'Dra. Juliana de Oliveira Freire', cro: 'CRO-MG 27267' },
    };
    const before = JSON.stringify(contract);
    buildPublicSigningSummaryFromV1Contract(contract);
    expect(JSON.stringify(contract)).toBe(before);
    const summarySrc = readSrc('src/contracts/publicSigningSummary.js');
    const parserSrc = readSrc('src/contracts/legacyProcedureHtmlParser.js');
    expect(summarySrc).not.toMatch(/withDb\(|signContractViaLink/);
    expect(parserSrc).not.toMatch(/innerHTML\s*=/);
    expect(readSrc('src/components/contracts/public/PublicSigningProceduresList.jsx'))
      .not.toContain('dangerouslySetInnerHTML');
  });

  it('freezeProcedureRows não recalcula total ausente', () => {
    const rows = freezeProcedureRows([
      { name: 'Flúor', quantity: 2, unitValue: 150 },
    ]);
    expect(rows[0].unitValue).toBe(150);
    expect(rows[0].totalValue).toBeNull();
  });

  it('V2 session com procedures nomeadas permanece compatível', () => {
    const v2 = buildPublicSigningSummaryFromV2Session({
      documentTitle: 'Doc',
      treatmentSummary: { name: 'Ortodontia', procedures: ['Aparelho'] },
    });
    expect(v2.treatment.name).toBe('Ortodontia');
    expect(v2.treatment.procedures).toContain('Aparelho');
  });
});
