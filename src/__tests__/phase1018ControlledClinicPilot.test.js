/**
 * Phase 10.18 — Controlled Clinic Pilot
 * Cobertura dos bugs/fricções corrigidos no piloto assistido.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb } from '../db/index.js';

import {
  UX_MESSAGES,
  resolvePendencyFixHint,
  labelDocumentType,
} from '../contracts/operationalUxMessages.js';
import {
  buildDocumentPackageForBudget,
  buildWizardViewModel,
  saveWizardProgress,
  getWizardProgress,
  validateBudgetContractGeneration,
  WIZARD_STEPS,
} from '../services/operationalContractWizardService.js';
import { QUEUE_SHORTCUTS } from '../services/operationalContractQueueService.js';
import { isContractsV2TechnicalHarnessEnabled } from '../domain/contracts/contracts-v2-technical-harness.ts';
import { PRODUCTION_REF } from '../domain/contracts/staging/contracts-v2-staging-pilot.ts';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const FICTIONAL = {
  patientId: 'pat-pilot-1018',
  patientName: 'Paciente Fictício Piloto',
  appointmentId: 'apt-pilot-1018',
  budgetId: 'bud-pilot-1018',
};

beforeEach(async () => {
  localStorage.clear();
  await resetDb();
  await initDb();
  withDb((db) => {
    db.tenants = [{ id: 'tenant-pilot-1018', name: 'Clínica Piloto', status: 'active' }];
    db.clinicProfile = {
      ...(db.clinicProfile || {}),
      id: 'clinic-pilot',
      nomeFantasia: 'Clínica Piloto Staging',
    };
    db.patients = [{
      id: FICTIONAL.patientId,
      tenant_id: 'tenant-pilot-1018',
      full_name: FICTIONAL.patientName,
      guardian_name: 'Responsável Fictício',
    }];
    db.patientPhones = [];
    db.clinicalAppointments = [{
      id: 'clinical-pilot-1018',
      appointmentId: FICTIONAL.appointmentId,
      patientId: FICTIONAL.patientId,
      budget: {
        id: FICTIONAL.budgetId,
        planName: 'Protocolo fictício',
        status: BUDGET_STATUS.APROVADO,
        totalValue: 15000,
        budgetNumber: 'ORC-PILOT-1',
        procedures: [{ name: 'Implante', tooth: '26', quantity: 1 }],
      },
      budgetHistory: [],
    }];
    db.generatedContracts = [];
    db.operationalContractWizardProgress = [];
    return db;
  });
});

describe('Phase 10.18 — fluxo operacional piloto', () => {
  it('CTA hub prioriza Gerar/Continuar contrato', () => {
    const card = fs.readFileSync(path.join(ROOT, 'src/components/budgets/BudgetHubCard.jsx'), 'utf8');
    expect(card.indexOf('budget-generate-contract')).toBeLessThan(card.indexOf('Abrir orçamento'));
    expect(card).toContain('bhub-btn--primary bhub-btn--accent');
  });

  it('wizard final leva à fila de assinaturas', () => {
    const wiz = fs.readFileSync(
      path.join(ROOT, 'src/components/contracts/operational/OperationalContractWizard.jsx'),
      'utf8',
    );
    expect(wiz).toContain('Ir para fila de assinaturas');
    expect(wiz).toContain('onGoToQueue');
    expect(wiz).toContain('ocw-step-btn');
    expect(WIZARD_STEPS).toHaveLength(7);
  });

  it('progresso do wizard preservado (continuar contrato)', () => {
    saveWizardProgress({
      budgetId: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
      patientId: FICTIONAL.patientId,
      stepId: 'signatarios',
    });
    expect(getWizardProgress(FICTIONAL.budgetId)?.stepId).toBe('signatarios');
  });

  it('package único com Contrato + TCLE + LGPD', () => {
    const pkg = buildDocumentPackageForBudget({
      appointmentId: FICTIONAL.appointmentId,
      budgetId: FICTIONAL.budgetId,
      patientId: FICTIONAL.patientId,
    });
    expect(pkg.items.map((i) => i.documentType)).toEqual(
      expect.arrayContaining(['CONTRACT_SERVICES', 'TCLE', 'LGPD']),
    );
    expect(labelDocumentType('CONTRACT_SERVICES')).toBe('Contrato');
  });

  it('pendência sem contato tem dica de correção', () => {
    const hint = resolvePendencyFixHint('Signatário sem contato.');
    expect(hint.title).toBe('Como resolver');
    expect(hint.body).toMatch(/cadastro|telefone|e-mail/i);
    const view = buildWizardViewModel({
      id: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
      patientId: FICTIONAL.patientId,
      patientName: FICTIONAL.patientName,
      planName: 'Protocolo fictício',
      totalValue: 15000,
      budgetNumber: 'ORC-PILOT-1',
      patientPhone: '—',
    });
    expect(view.guardianName).toBe('Responsável Fictício');
    expect(view.patientPhone === '—' || !view.patientPhone).toBe(true);
  });

  it('fila atalho Com pendência e painel clínico existem', () => {
    expect(QUEUE_SHORTCUTS.find((s) => s.id === 'problems')?.label).toBe('Com pendência');
    expect(fs.existsSync(path.join(ROOT, 'src/components/contracts/operational/ClinicalDocumentPackagePanel.jsx'))).toBe(true);
    const clinical = fs.readFileSync(path.join(ROOT, 'src/components/clinical/ClinicalContractSection.jsx'), 'utf8');
    const patientTab = fs.readFileSync(path.join(ROOT, 'src/components/budgets/PatientBudgetsContractsTab.jsx'), 'utf8');
    expect(clinical).toContain('ClinicalDocumentPackagePanel');
    expect(patientTab).toContain('ClinicalDocumentPackagePanel');
    expect(patientTab).toContain('patient-treatment-documents');
  });

  it('anti-duplicata e geração elegível', () => {
    const ok = validateBudgetContractGeneration({
      patientId: FICTIONAL.patientId,
      budgetId: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
    });
    expect(ok.ok).toBe(true);
    withDb((db) => {
      db.generatedContracts = [{
        id: 'ctr-pilot-dup',
        clinicId: 'clinic-pilot',
        quoteId: FICTIONAL.appointmentId,
        quoteSource: 'clinical_budget',
        budgetId: FICTIONAL.budgetId,
        patientId: FICTIONAL.patientId,
        status: 'draft',
        contractNumber: 'CTR-PILOT-DUP',
        totalValueSnapshot: 15000,
      }];
      return db;
    });
    const dup = validateBudgetContractGeneration({
      patientId: FICTIONAL.patientId,
      budgetId: FICTIONAL.budgetId,
      appointmentId: FICTIONAL.appointmentId,
      allowExisting: false,
    });
    expect(dup.duplicateBlocked).toBe(true);
    expect(dup.errors[0]).toContain(UX_MESSAGES.CONTRACT_ALREADY_EXISTS.title);
  });
});

describe('Phase 10.18 — assinatura pública / mobile / regressão', () => {
  it('assinatura pública sem jargão técnico', () => {
    const v2 = fs.readFileSync(path.join(ROOT, 'src/pages/contratos/ContractSignPublicV2Page.jsx'), 'utf8');
    const cta = fs.readFileSync(path.join(ROOT, 'src/components/contracts/public/PublicSigningSummarySections.jsx'), 'utf8');
    expect(cta).toContain('Visualizar documento completo');
    expect(v2).not.toContain('evidências técnicas');
    expect(v2).not.toContain('metadados técnicos');
  });

  it('CSS mobile e package clínico', () => {
    const css = fs.readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');
    expect(css).toContain('ocw-clinical-package');
    expect(css).toContain('ctr-fila-fix-hint');
    expect(css).toContain('@media (max-width: 640px)');
  });

  it('harness isolado e V1 preservado', () => {
    expect(isContractsV2TechnicalHarnessEnabled({
      projectRef: PRODUCTION_REF,
      user: { role: 'admin' },
      technicalFlagOverride: true,
      forceAllowInTest: true,
    })).toBe(false);
    expect(contractsShellNavItems.some((i) => i.id === 'fila')).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/pages/BudgetsHubPage.jsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/pages/contratos/ContractsPendentesPage.jsx'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'src/pages/contratos/ContractSignPublicPage.jsx'))).toBe(true);
  });

  it('hub navega para fila após wizard', () => {
    const hub = fs.readFileSync(path.join(ROOT, 'src/pages/BudgetsHubPage.jsx'), 'utf8');
    expect(hub).toContain('onGoToQueue');
    expect(hub).toContain('/gestao/contratos/fila');
    expect(hub).toContain('Gerar contrato');
  });

  it('relatório 10.18 existe', () => {
    expect(fs.existsSync(path.join(ROOT, 'docs/reports/PHASE_10_18_CONTROLLED_CLINIC_PILOT.md'))).toBe(true);
  });
});
