/**
 * Phase 10.17 — Internal UX Beta
 * Validação de fluxo operacional, linguagem, estados e regressão V1.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb } from '../db/index.js';

import {
  isContractsV2TechnicalHarnessEnabled,
  isContractsV2TechnicalHarnessProductionBlocked,
} from '../domain/contracts/contracts-v2-technical-harness.ts';
import { PRODUCTION_REF } from '../domain/contracts/staging/contracts-v2-staging-pilot.ts';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';
import {
  UX_MESSAGES,
  formatUxMessage,
  labelDocumentType,
  labelSignerRole,
} from '../contracts/operationalUxMessages.js';
import {
  resolveBudgetContractCta,
  OPERATIONAL_UX_STATUS,
  resolveOperationalUxStatus,
} from '../contracts/operationalContractUi.js';
import {
  validateBudgetContractGeneration,
  buildDocumentPackageForBudget,
  buildWizardViewModel,
  saveWizardProgress,
  getWizardProgress,
  WIZARD_STEPS,
  getStepReadiness,
} from '../services/operationalContractWizardService.js';
import {
  QUEUE_SHORTCUTS,
  applyQueueFilters,
  listOperationalContractQueue,
} from '../services/operationalContractQueueService.js';
import {
  buildPublicSigningSummaryFromV1Contract,
  resetConsentAcceptanceMap,
} from '../contracts/publicSigningSummary.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const FICTIONAL = {
  patientId: 'pat-beta-1017',
  patientName: 'Paciente Fictício Beta',
  appointmentId: 'apt-beta-1017',
  budgetId: 'bud-beta-1017',
  professional: 'Dra. Teste Interna',
};

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
  await initDb();
  withDb((db) => {
    db.tenants = [{ id: 'tenant-beta-1017', name: 'Clínica Staging Beta', status: 'active' }];
    db.clinicProfile = {
      ...(db.clinicProfile || {}),
      id: 'clinic-beta',
      nomeFantasia: 'Clínica Staging Beta',
      razaoSocial: 'Clinica Staging Beta LTDA',
    };
    db.patients = [
      {
        id: FICTIONAL.patientId,
        tenant_id: 'tenant-beta-1017',
        full_name: FICTIONAL.patientName,
        guardian_name: null,
      },
    ];
    db.clinicalAppointments = [
      {
        id: 'clinical-beta-1017',
        appointmentId: FICTIONAL.appointmentId,
        patientId: FICTIONAL.patientId,
        budget: {
          id: FICTIONAL.budgetId,
          planName: 'Implante unitário fictício',
          status: BUDGET_STATUS.APROVADO,
          totalValue: 10000,
          budgetNumber: 'ORC-BETA-1',
          procedures: [
            { name: 'Implante unitário', tooth: '16', quantity: 1 },
            { name: 'Coroa sobre implante', tooth: '16', quantity: 1 },
          ],
        },
        budgetHistory: [],
      },
    ];
    db.generatedContracts = [];
    db.contractSignatures = [];
    db.contractSignLinks = [];
    db.operationalContractWizardProgress = [];
    return db;
  });
});

describe('Phase 10.17 — geração / continuação / anti-duplicata', () => {
  it('geração via orçamento elegível', () => {
    const check = validateBudgetContractGeneration({
      patientId: FICTIONAL.patientId,
      budgetId: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
    });
    expect(check.ok).toBe(true);
    expect(check.duplicateBlocked).toBe(false);
    const cta = resolveBudgetContractCta({ contractId: null, budgetStatus: BUDGET_STATUS.APROVADO });
    expect(cta.label).toBe('Gerar contrato');
  });

  it('continuação de rascunho', () => {
    const cta = resolveBudgetContractCta({ contractId: 'c-draft', contractStatus: 'draft' });
    expect(cta.action).toBe('continue');
    expect(cta.label).toMatch(/Continuar/i);
  });

  it('anti-duplicata com mensagem profissional', () => {
    withDb((db) => {
      db.generatedContracts = [
        ...(db.generatedContracts || []),
        {
          id: 'ctr-dup-1017',
          clinicId: 'clinic-beta',
          quoteId: FICTIONAL.appointmentId,
          quoteSource: 'clinical_budget',
          budgetId: FICTIONAL.budgetId,
          patientId: FICTIONAL.patientId,
          status: 'draft',
          contractNumber: 'CTR-BETA-DUP',
          totalValueSnapshot: 10000,
          financialSnapshotJson: { budgetId: FICTIONAL.budgetId, valorTotal: 10000 },
        },
      ];
      return db;
    });
    const check = validateBudgetContractGeneration({
      patientId: FICTIONAL.patientId,
      budgetId: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
      allowExisting: false,
    });
    expect(check.duplicateBlocked).toBe(true);
    expect(check.errors[0]).toContain(UX_MESSAGES.CONTRACT_ALREADY_EXISTS.title);
  });
});

describe('Phase 10.17 — wizard + package', () => {
  it('wizard tem 7 etapas e mantém progresso', () => {
    expect(WIZARD_STEPS).toHaveLength(7);
    saveWizardProgress({
      budgetId: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
      patientId: FICTIONAL.patientId,
      stepId: 'documentos',
    });
    expect(getWizardProgress(FICTIONAL.budgetId)?.stepId).toBe('documentos');
  });

  it('view model sem IDs técnicos e com tratamento/financeiro', () => {
    const view = buildWizardViewModel({
      id: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
      patientId: FICTIONAL.patientId,
      patientName: FICTIONAL.patientName,
      planName: 'Implante unitário fictício',
      totalValue: 10000,
      budgetNumber: 'ORC-BETA-1',
      professionalName: FICTIONAL.professional,
      patientPhone: '(11) 90000-0000',
    });
    expect(view.clinicName).toMatch(/Staging Beta/i);
    expect(view.procedures.length).toBeGreaterThan(0);
    expect(view.financial.totalLabel).toMatch(/R\$/);
    expect(JSON.stringify(view)).not.toMatch(/CONTRACT_SERVICES|artifact|envelope|hash/i);
  });

  it('package contém contrato + TCLE + LGPD com labels amigáveis', () => {
    const pkg = buildDocumentPackageForBudget({
      appointmentId: FICTIONAL.appointmentId,
      budgetId: FICTIONAL.budgetId,
      patientId: FICTIONAL.patientId,
    });
    expect(pkg.items.map((i) => i.documentType)).toEqual(
      expect.arrayContaining(['CONTRACT_SERVICES', 'TCLE', 'LGPD']),
    );
    expect(labelDocumentType('CONTRACT_SERVICES')).toBe('Contrato');
    expect(labelDocumentType('TCLE')).toBe('TCLE');
    expect(getStepReadiness('tratamento', {
      budget: { planName: 'Implante', procedures: [] },
    }).ready).toBe(true);
  });
});

describe('Phase 10.17 — fila / filtros / status', () => {
  it('atalhos incluem Com pendência', () => {
    expect(QUEUE_SHORTCUTS.find((s) => s.id === 'problems')?.label).toBe('Com pendência');
  });

  it('filtros e status UX em português', () => {
    const rows = [
      {
        id: '1',
        patientName: FICTIONAL.patientName,
        contractNumber: 'CTR-1',
        rawContractNumber: 'CTR-1',
        budgetId: FICTIONAL.budgetId,
        patientPhone: '(11) 90000-0000',
        professionalName: FICTIONAL.professional,
        treatmentSummary: 'Implante',
        uxStatus: OPERATIONAL_UX_STATUS.AWAITING_SIGNATURE,
        status: 'sent',
        unitName: 'Clínica Staging Beta',
        documentType: 'servicos',
        origin: 'clinical_budget',
        pendingSignature: true,
        updatedAt: '2026-08-10T12:00:00.000Z',
      },
    ];
    expect(applyQueueFilters(rows, { query: 'fictício' })).toHaveLength(1);
    expect(applyQueueFilters(rows, { shortcut: 'awaiting' })).toHaveLength(1);
    expect(resolveOperationalUxStatus({ status: 'signed' })).toBe(OPERATIONAL_UX_STATUS.SIGNED);
  });

  it('fila lista contratos da clínica sem enums crus no label', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'ctr-fila-1017',
        clinicId: 'clinic-beta',
        quoteId: FICTIONAL.appointmentId,
        quoteSource: 'clinical_budget',
        patientId: FICTIONAL.patientId,
        status: 'sent',
        contractNumber: 'CTR-FILA-1',
        title: 'Contrato fictício',
        totalValueSnapshot: 10000,
        patientSnapshotJson: { full_name: FICTIONAL.patientName },
        clinicalSnapshotJson: { procedimentos: ['Implante unitário'] },
        financialSnapshotJson: { valorTotal: 10000, budgetId: FICTIONAL.budgetId },
        professionalSnapshotJson: { name: FICTIONAL.professional },
        generatedAt: new Date().toISOString(),
      }];
      db.contractSignatures = [];
      db.contractSignLinks = [{
        id: 'link-1',
        contractId: 'ctr-fila-1017',
        status: 'pending',
        signerName: FICTIONAL.patientName,
      }];
      return db;
    });
    const list = listOperationalContractQueue({});
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].uxStatusLabel).not.toMatch(/SENT|DRAFT|PENDING_/);
    expect(list[0].whoPending).toBeTruthy();
  });
});

describe('Phase 10.17 — assinatura pública / mobile / LGPD / PDF', () => {
  it('resumo público com tratamento, parcelas e LGPD sem pré-marcar', () => {
    const summary = buildPublicSigningSummaryFromV1Contract({
      title: 'Contrato fictício',
      totalValueSnapshot: 10000,
      clinicalSnapshotJson: { procedimentos: ['Implante'], dentes: ['16'] },
      professionalSnapshotJson: { name: FICTIONAL.professional },
      financialSnapshotJson: {
        valorTotal: 10000,
        entrada: 1000,
        formaPagamento: 'Cartão',
        parcelas: [{ due_date: '2026-09-01', net_amount: 900, total_installments: 10 }],
        financiamentos: [{ installments_count: 10 }],
      },
    });
    expect(summary.treatment.procedures).toContain('Implante');
    expect(summary.financial.installmentCount).toBe(10);
    const map = resetConsentAcceptanceMap(summary.privacy);
    expect(Object.values(map).every((v) => v === false)).toBe(true);
    expect(summary.privacy.lgpdNotice).toMatch(/LGPD/i);
  });

  it('CTA PDF e ausência de linguagem interna na UI pública', () => {
    const v1 = fs.readFileSync(path.join(ROOT, 'src/pages/contratos/ContractSignPublicPage.jsx'), 'utf8');
    const v2 = fs.readFileSync(path.join(ROOT, 'src/pages/contratos/ContractSignPublicV2Page.jsx'), 'utf8');
    const cta = fs.readFileSync(path.join(ROOT, 'src/components/contracts/public/PublicSigningSummarySections.jsx'), 'utf8');
    expect(cta).toContain('Visualizar documento completo');
    expect(v1).toContain('ctr-public-sign--v2ux');
    expect(v2).not.toContain('evidências técnicas');
    expect(v2).not.toContain('metadados técnicos');
    expect(v2).not.toContain('Referência:');
  });

  it('estados mobile e mensagens profissionais', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('ctr-public-sign--v2ux');
    expect(formatUxMessage('LINK_EXPIRED')).toMatch(/clínica|link/i);
    expect(UX_MESSAGES.DOCUMENT_UNAVAILABLE.body).toMatch(/clínica|instantes/i);
    expect(labelSignerRole('patient')).toBe('Paciente');
  });
});

describe('Phase 10.17 — harness isolation + regressão V1', () => {
  it('harness bloqueado em produção', () => {
    expect(isContractsV2TechnicalHarnessProductionBlocked({ projectRef: PRODUCTION_REF })).toBe(true);
    expect(isContractsV2TechnicalHarnessEnabled({
      projectRef: PRODUCTION_REF,
      user: { role: 'admin' },
      technicalFlagOverride: true,
      forceAllowInTest: true,
    })).toBe(false);
  });

  it('rotas técnicas marcadas e fila operacional presente', () => {
    const v2 = contractsShellNavItems.filter((i) => String(i.route).includes('-v2'));
    expect(v2.every((i) => i.surface === 'TECHNICAL_HARNESS')).toBe(true);
    expect(contractsShellNavItems.some((i) => i.id === 'fila')).toBe(true);
  });

  it('regressão V1: hub, pendentes e IndexedDB path preservados', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/pages/BudgetsHubPage.jsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/pages/contratos/ContractsPendentesPage.jsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/pages/contratos/ContractSignPublicPage.jsx'))).toBe(true);
    const hub = fs.readFileSync(path.join(ROOT, 'src/pages/BudgetsHubPage.jsx'), 'utf8');
    expect(hub).toContain('OperationalContractWizard');
    expect(hub).toContain('Central de Orçamentos');
  });

  it('relatório 10.17 existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/reports/PHASE_10_17_INTERNAL_UX_BETA.md'))).toBe(true);
  });
});
