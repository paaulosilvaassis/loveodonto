/**
 * PHASE_10.21AN-HOTFIX — /gestao/contratos/assinados não pode crashar
 * com ReferenceError: ContractDetailModal is not defined.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.React = React;

vi.mock('../services/contractPdfService.js', () => ({
  contractHtmlWithSignatures: (html) => html || '',
  downloadContractPdfFromElement: async () => {},
}));

vi.mock('html2canvas', () => ({ default: async () => ({ toDataURL: () => '' }) }));
vi.mock('jspdf', () => ({ jsPDF: class JsPDF { save() {} } }));
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { AuthContext } from '../auth/authContext.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  getContractDetails,
  listContractsByStatus,
} from '../services/contractModuleService.js';
import {
  buildContractViewIdentity,
  matchesContractViewIdentity,
} from '../contracts/contractViewIdentity.js';
import ContractsAssinadosPage from '../pages/contratos/ContractsAssinadosPage.jsx';
import ContractsPendentesPage from '../pages/contratos/ContractsPendentesPage.jsx';
import ContractsAssinaturasPage from '../pages/contratos/ContractsAssinaturasPage.jsx';
import ContractsDashboardPage from '../pages/contratos/ContractsDashboardPage.jsx';
import ContractsTermosPage from '../pages/contratos/ContractsTermosPage.jsx';
import ContractsConfigPage from '../pages/contratos/ContractsConfigPage.jsx';
import ContractsFilaPage from '../pages/contratos/ContractsFilaPage.jsx';
import ContractDetailModal from '../components/contracts/ContractDetailModal.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PAGES_DIR = path.join(ROOT, 'src/pages/contratos');
const TENANT = 'tenant-hotfix-an';
const PATIENT_A = 'patient-an-a';
const PATIENT_B = 'patient-an-b';
const APPT_A = 'appt-an-a';
const APPT_B = 'appt-an-b';
const BUDGET_A = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const BUDGET_B = 'budget-an-other';
const CONTRACT_A = 'gctr-an-signed-a';
const CONTRACT_B = 'gctr-an-signed-b';
const user = { id: 'user-an', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin AN' };

const MUTATION_TOKENS = [
  'sendContractForSignature',
  'signContractOnScreen',
  'signContractViaLink',
  'finalizeGeneratedContract',
  'createContractNewVersion',
];

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function declaredNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s+([A-Za-z_][\w]*)\s+from/g)) names.add(m[1]);
  for (const m of src.matchAll(/import\s+\*\s+as\s+([A-Za-z_][\w]*)\s+from/g)) names.add(m[1]);
  for (const m of src.matchAll(/import\s+\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const bit = part.trim();
      if (!bit) continue;
      const aliased = bit.match(/\sas\s+([A-Za-z_][\w]*)$/);
      names.add(aliased ? aliased[1] : bit.replace(/\s+as\s+[A-Za-z_][\w]*$/, '').trim().split(/\s+/)[0]);
    }
  }
  for (const m of src.matchAll(/(?:function|const|class|let|var)\s+([A-Z][A-Za-z0-9]*)/g)) names.add(m[1]);
  return names;
}

function jsxTags(src) {
  const tags = new Set();
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)) tags.add(m[1]);
  return [...tags];
}

function wrap(node) {
  return React.createElement(
    AuthContext.Provider,
    { value: { user } },
    React.createElement(MemoryRouter, { initialEntries: ['/gestao/contratos/assinados'] }, node),
  );
}

function renderPage(Page) {
  return renderToStaticMarkup(wrap(React.createElement(Page)));
}

function legalSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    generatedContracts: db.generatedContracts || [],
    contractSignatures: db.contractSignatures || [],
    contractSignLinks: db.contractSignLinks || [],
    contractEvents: db.contractEvents || [],
    contractAttachments: db.contractAttachments || [],
  });
}

function seedContracts({ withSigned = true } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'AN Clinic' }];
    db.clinicProfile = { id: 'clinic-1', nomeFantasia: 'AN', tenant_id: TENANT };
    db.patients = [
      { id: PATIENT_A, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT, cpf: '39053344705' },
      { id: PATIENT_B, full_name: 'Outro Paciente', tenant_id: TENANT },
    ];
    db.generatedContracts = withSigned
      ? [
        {
          id: CONTRACT_A,
          clinicId: 'clinic-1',
          tenant_id: TENANT,
          tenantId: TENANT,
          patientId: PATIENT_A,
          quoteId: APPT_A,
          appointmentId: APPT_A,
          budgetId: BUDGET_A,
          status: CONTRACT_STATUS.SIGNED,
          contractNumber: 'CTR-2026-00001',
          title: 'Contrato A',
          renderedHtml: '<p>CONTRATO-A-SELECIONADO</p>',
          totalValueSnapshot: 1500,
          signedAt: '2026-08-14T12:00:00.000Z',
          generatedAt: '2026-08-14T11:00:00.000Z',
          patientSnapshotJson: { full_name: 'Paulo Henrique Silva de Assis' },
        },
        {
          id: CONTRACT_B,
          clinicId: 'clinic-1',
          tenant_id: TENANT,
          tenantId: TENANT,
          patientId: PATIENT_B,
          quoteId: APPT_B,
          appointmentId: APPT_B,
          budgetId: BUDGET_B,
          status: CONTRACT_STATUS.SIGNED,
          contractNumber: 'CTR-2026-00002',
          title: 'Contrato B',
          renderedHtml: '<p>CONTRATO-B-NAO-SELECIONADO</p>',
          totalValueSnapshot: 900,
          signedAt: '2026-08-13T12:00:00.000Z',
          generatedAt: '2026-08-13T11:00:00.000Z',
          patientSnapshotJson: { full_name: 'Outro Paciente' },
        },
        {
          id: 'gctr-an-pending',
          clinicId: 'clinic-1',
          tenant_id: TENANT,
          patientId: PATIENT_A,
          quoteId: APPT_A,
          budgetId: BUDGET_A,
          status: CONTRACT_STATUS.GENERATED,
          contractNumber: 'CTR-2026-00003',
          renderedHtml: '<p>PENDENTE</p>',
          generatedAt: '2026-08-14T10:00:00.000Z',
          patientSnapshotJson: { full_name: 'Paulo Henrique Silva de Assis' },
        },
      ]
      : [];
    db.contractSignatures = [];
    db.contractSignLinks = [];
    db.contractEvents = [];
    return db;
  });
}

describe('PHASE_10.21AN-HOTFIX signed contracts page crash', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    await initDb();
  });

  afterEach(() => {
    resetDb();
  });

  it('A/B — Signed page importa ContractDetailModal definido', () => {
    const page = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    const modal = readSrc('src/components/contracts/ContractDetailModal.jsx');
    expect(modal).toMatch(/export default function ContractDetailModal/);
    expect(page).toMatch(/import ContractDetailModal from ['"].*ContractDetailModal\.jsx['"]/);
    expect(typeof ContractDetailModal).toBe('function');
    expect(typeof ContractsAssinadosPage).toBe('function');
  });

  it('C — /assinados renderiza lista vazia sem ReferenceError', () => {
    seedContracts({ withSigned: false });
    expect(() => renderPage(ContractsAssinadosPage)).not.toThrow();
    const html = renderPage(ContractsAssinadosPage);
    expect(html).toContain('Nenhum contrato assinado.');
    expect(html).not.toContain('ContractDetailModal is not defined');
  });

  it('D — /assinados renderiza contrato assinado', () => {
    seedContracts();
    const html = renderPage(ContractsAssinadosPage);
    expect(html).toContain('CTR-2026-00001');
    expect(html).toContain('Paulo Henrique Silva de Assis');
    expect(html).toContain('Visualizar');
  });

  it('E — Visualizar usa o contrato clicado, não o último/primeiro da lista', () => {
    const page = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(page).toContain('setSelectedView(buildContractViewIdentity(r))');
    expect(page).not.toMatch(/contracts\[0\]/);
    expect(page).not.toMatch(/contracts\.at\(-1\)/);
    expect(page).not.toMatch(/listContractsByStatus\([^)]*\)\[0\]/);

    seedContracts();
    const selected = listContractsByStatus([CONTRACT_STATUS.SIGNED]).find((c) => c.id === CONTRACT_A);
    const identity = buildContractViewIdentity(selected);
    expect(identity.contractId).toBe(CONTRACT_A);
    expect(identity.patientId).toBe(PATIENT_A);
    expect(identity.budgetId).toBe(BUDGET_A);
    expect(identity.appointmentId).toBe(APPT_A);

    const details = getContractDetails(identity.contractId, identity);
    expect(details.contract.id).toBe(CONTRACT_A);
    expect(details.contract.renderedHtml).toContain('CONTRATO-A-SELECIONADO');
    expect(details.contract.renderedHtml).not.toContain('CONTRATO-B-NAO-SELECIONADO');

    const mismatch = getContractDetails(CONTRACT_A, {
      contractId: CONTRACT_A,
      patientId: PATIENT_B,
      appointmentId: APPT_B,
      budgetId: BUDGET_B,
    });
    expect(mismatch).toBeNull();
  });

  it('F — fechar modal limpa a seleção (onOpenChange false)', () => {
    const page = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(page).toMatch(/onOpenChange=\{\(o\) => \{ if \(!o\) setSelectedView\(null\); \}\}/);
  });

  it('G — visualizar não muta estado jurídico', () => {
    seedContracts();
    const before = legalSnapshot();
    const identity = buildContractViewIdentity({
      id: CONTRACT_A,
      tenant_id: TENANT,
      patientId: PATIENT_A,
      quoteId: APPT_A,
      budgetId: BUDGET_A,
    });
    getContractDetails(CONTRACT_A, identity);
    renderToStaticMarkup(wrap(React.createElement(ContractDetailModal, {
      open: true,
      contractId: CONTRACT_A,
      expectedIdentity: identity,
      onOpenChange: () => {},
    })));
    renderPage(ContractsAssinadosPage);
    expect(legalSnapshot()).toBe(before);
    expect(loadDb().contractSignLinks || []).toHaveLength(0);
    expect(loadDb().contractSignatures || []).toHaveLength(0);
  });

  it('H/I — Pendentes, Assinaturas, Dashboard, Termos, Config, Fila renderizam', () => {
    seedContracts();
    expect(() => renderPage(ContractsPendentesPage)).not.toThrow();
    expect(() => renderPage(ContractsAssinaturasPage)).not.toThrow();
    expect(() => renderPage(ContractsDashboardPage)).not.toThrow();
    expect(() => renderPage(ContractsTermosPage)).not.toThrow();
    expect(() => renderPage(ContractsConfigPage)).not.toThrow();
    expect(() => renderPage(ContractsFilaPage)).not.toThrow();
    const pendentes = renderPage(ContractsPendentesPage);
    expect(pendentes).toContain('CTR-2026-00003');
    expect(pendentes).toContain('Visualizar');
  });

  it('J — nenhuma ação de assinatura no mount/render da página assinados', () => {
    const page = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(page).not.toMatch(/useEffect\s*\(/);
    expect(page).not.toContain('sendContractForSignature');
    expect(page).not.toContain('signContractOnScreen');
    expect(page).not.toContain('signContractViaLink');
    expect(page).not.toContain('ContractSignModal');
  });

  it('módulo contratos: JSX PascalCase tem import/declaração (sem ReferenceError)', () => {
    const files = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.jsx'));
    const missing = [];
    for (const file of files) {
      const src = readFileSync(path.join(PAGES_DIR, file), 'utf8');
      const names = declaredNames(src);
      for (const tag of jsxTags(src)) {
        if (!names.has(tag)) missing.push(`${file}: <${tag}>`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('callers de ContractDetailModal importam o default export', () => {
    const callers = [
      'src/pages/contratos/ContractsAssinadosPage.jsx',
      'src/pages/contratos/ContractsPendentesPage.jsx',
      'src/pages/contratos/ContractsFilaPage.jsx',
    ];
    for (const rel of callers) {
      const src = readSrc(rel);
      expect(src).toMatch(/import ContractDetailModal from ['"].*ContractDetailModal\.jsx['"]/);
      expect(src).toContain('<ContractDetailModal');
    }
  });

  it('fail-closed: clínica / contractId inconsistentes não devolvem outro contrato', () => {
    seedContracts();
    withDb((db) => {
      db.generatedContracts.push({
        id: 'gctr-other-clinic',
        clinicId: 'clinic-other',
        patientId: PATIENT_A,
        quoteId: APPT_A,
        budgetId: BUDGET_A,
        status: CONTRACT_STATUS.SIGNED,
        contractNumber: 'CTR-OTHER',
        renderedHtml: '<p>OUTRA-CLINICA</p>',
      });
      return db;
    });
    expect(getContractDetails('gctr-other-clinic')).toBeNull();
    expect(getContractDetails(CONTRACT_B, { contractId: CONTRACT_A })).toBeNull();
    expect(matchesContractViewIdentity(
      { id: CONTRACT_A, patientId: PATIENT_A, quoteId: APPT_A, budgetId: BUDGET_A },
      { contractId: CONTRACT_B, patientId: PATIENT_A, appointmentId: APPT_A, budgetId: BUDGET_A },
    )).toBe(false);
  });

  it('rotas reais do módulo estão montadas em ProtectedApp', () => {
    const app = readSrc('src/ProtectedApp.jsx');
    const routes = [
      'assinados',
      'pendentes',
      'fila',
      'modelos',
      'termos',
      'assinaturas',
      'configuracoes',
    ];
    for (const r of routes) {
      expect(app).toContain(`path="${r}"`);
    }
    expect(app).toContain('ContractsAssinadosPage');
    const signedSrc = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    for (const token of MUTATION_TOKENS.filter((t) => t !== 'createContractNewVersion')) {
      expect(signedSrc).not.toContain(token);
    }
  });
});
