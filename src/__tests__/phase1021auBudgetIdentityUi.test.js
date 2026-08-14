/**
 * PHASE_10.21AU — identidade visual do orçamento ativo no atendimento.
 * Sem criar/renumerar budget. Sem mutar ORC-001 / CTR-2026-00001.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

globalThis.React = React;

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { getBudget, updateBudgetStatus } from '../services/clinicalService.js';
import { getActiveClinicalBudget } from '../services/budgetNavigationService.js';
import { resolveClinicalBudgetIdentity } from '../services/clinicalBudgetLockService.js';
import { BudgetPremiumHeader } from '../components/clinical/budget/BudgetPremiumHeader.jsx';
import { BudgetSummaryPanel } from '../components/clinical/budget/BudgetSummaryPanel.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OTHER_PATIENT = 'patient-other-au';
const OLD_APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const NEW_APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const OLD_CLINICAL = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const NEW_CLINICAL = 'clinical-au-new';
const OLD_BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const NEW_BUDGET = 'budget-au-orc-002';
const OTHER_BUDGET = 'budget-au-other-patient';
const OLD_CONTRACT = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const USER = { id: 'user-au', role: 'admin', tenant_id: TENANT, tenantId: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function legalSnapshot() {
  const db = loadDb();
  const legacy = db.clinicalAppointments.find((c) => c.appointmentId === OLD_APPT);
  const contract = (db.generatedContracts || []).find((c) => c.id === OLD_CONTRACT);
  return JSON.stringify({
    legacyBudgetId: legacy?.budget?.id,
    legacyBudgetNumber: legacy?.budget?.budgetNumber ?? null,
    legacyStatus: legacy?.budget?.status,
    contractId: contract?.id,
    contractNumber: contract?.contractNumber,
    contractStatus: contract?.status,
    signatures: db.contractSignatures,
    manifest: contract?.metadata,
  });
}

function seedPilot() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.patients = [
      { id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT },
      { id: OTHER_PATIENT, full_name: 'Outro Paciente', tenant_id: TENANT },
    ];
    db.appointments = [
      {
        id: OLD_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.FINALIZADO,
        tenant_id: TENANT,
      },
      {
        id: NEW_APPT,
        patientId: PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      },
      {
        id: 'appt-other-au',
        patientId: OTHER_PATIENT,
        professionalId: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      },
    ];
    db.clinicalAppointments = [
      {
        id: OLD_CLINICAL,
        appointmentId: OLD_APPT,
        patientId: PATIENT,
        budget: {
          id: OLD_BUDGET,
          budgetNumber: null,
          status: BUDGET_STATUS.CONTRATO_GERADO,
          totalValue: 150,
          createdAt: '2026-08-13T20:00:00.000Z',
        },
      },
      {
        id: NEW_CLINICAL,
        appointmentId: NEW_APPT,
        patientId: PATIENT,
        budget: {
          id: NEW_BUDGET,
          budgetNumber: 'ORC-002',
          status: BUDGET_STATUS.NEGOCIACAO,
          totalValue: 150,
          planName: 'Aplicação topica de fluor',
          createdAt: '2026-08-14T15:40:00.000Z',
        },
      },
      {
        id: 'clinical-other-au',
        appointmentId: 'appt-other-au',
        patientId: OTHER_PATIENT,
        budget: {
          id: OTHER_BUDGET,
          budgetNumber: 'ORC-009',
          status: BUDGET_STATUS.NEGOCIACAO,
          totalValue: 999,
          createdAt: '2026-08-14T16:00:00.000Z',
        },
      },
    ];
    db.generatedContracts = [{
      id: OLD_CONTRACT,
      contractNumber: 'CTR-2026-00001',
      status: CONTRACT_STATUS.SIGNED,
      budgetId: OLD_BUDGET,
      quoteId: OLD_APPT,
      quoteSource: 'clinical_budget',
      metadata: { packageManifestId: 'manifest-legacy-au', frozenAt: '2026-08-13T21:00:00.000Z' },
    }];
    db.contractSignatures = [{
      id: 'sig-legacy-au',
      contractId: OLD_CONTRACT,
      signerRole: 'patient',
    }];
  });
}

describe('PHASE_10.21AU — identidade do orçamento ativo', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPilot();
  });

  it('A) budget persistido ORC-002 no atendimento novo → display ORC-002', () => {
    const identity = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    expect(identity.appointmentId).toBe(NEW_APPT);
    expect(identity.clinicalAppointmentId).toBe(NEW_CLINICAL);
    expect(identity.budgetId).toBe(NEW_BUDGET);
    expect(identity.persistedBudgetNumber).toBe('ORC-002');
    expect(identity.displayNumber).toBe('ORC-002');
    expect(identity.status).toBe(BUDGET_STATUS.NEGOCIACAO);
    expect(identity.patientId).toBe(PATIENT);
    expect(identity.value).toBe(150);
    expect(getActiveClinicalBudget(NEW_APPT).id).toBe(NEW_BUDGET);
  });

  it('B) ORC-001 legado unlabeled → display ORC-001 sem mutation', () => {
    const before = legalSnapshot();
    const identity = resolveClinicalBudgetIdentity({ appointmentId: OLD_APPT });
    expect(identity.budgetId).toBe(OLD_BUDGET);
    expect(identity.persistedBudgetNumber).toBeNull();
    expect(identity.displayNumber).toBe('ORC-001');
    expect(legalSnapshot()).toBe(before);
    expect(getBudget(OLD_APPT).budgetNumber == null).toBe(true);
  });

  it('C) atendimento mostra só o budget vinculado ao próprio clinicalAppointment', () => {
    const neu = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    const old = resolveClinicalBudgetIdentity({ appointmentId: OLD_APPT });
    expect(neu.budgetId).toBe(NEW_BUDGET);
    expect(neu.displayNumber).toBe('ORC-002');
    expect(old.budgetId).toBe(OLD_BUDGET);
    expect(old.displayNumber).toBe('ORC-001');
    expect(neu.budgetId).not.toBe(old.budgetId);
  });

  it('D) nunca escolhe o último orçamento do paciente / de outro appointment', () => {
    const byWrongBudgetOnNewAppt = resolveClinicalBudgetIdentity({
      appointmentId: NEW_APPT,
      budgetId: OTHER_BUDGET,
    });
    expect(byWrongBudgetOnNewAppt).toBeNull();

    const byLegacyIdOnNewAppt = resolveClinicalBudgetIdentity({
      appointmentId: NEW_APPT,
      budgetId: OLD_BUDGET,
    });
    expect(byLegacyIdOnNewAppt).toBeNull();

    const active = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    expect(active.budgetId).toBe(NEW_BUDGET);
    expect(active.displayNumber).not.toBe('ORC-009');
  });

  it('E) resolver identidade não cria budget novo', () => {
    const beforeIds = (loadDb().clinicalAppointments || []).map((c) => c.budget?.id);
    resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    const afterIds = (loadDb().clinicalAppointments || []).map((c) => c.budget?.id);
    expect(afterIds).toEqual(beforeIds);
    expect(loadDb().clinicalAppointments).toHaveLength(3);
  });

  it('F) refresh não altera o número', () => {
    const first = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    const second = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    expect(second.displayNumber).toBe(first.displayNumber);
    expect(second.budgetId).toBe(first.budgetId);
    expect(second.persistedBudgetNumber).toBe('ORC-002');
  });

  it('G) aprovação não renumera o budget', () => {
    const before = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    updateBudgetStatus(USER, NEW_APPT, BUDGET_STATUS.APROVADO);
    const after = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    expect(after.budgetId).toBe(before.budgetId);
    expect(after.displayNumber).toBe('ORC-002');
    expect(after.persistedBudgetNumber).toBe('ORC-002');
    expect(after.status).toBe(BUDGET_STATUS.APROVADO);
  });

  it('H/I/J) legado, contrato, assinatura e manifest permanecem intactos', () => {
    const before = legalSnapshot();
    resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    resolveClinicalBudgetIdentity({ appointmentId: OLD_APPT, budgetId: OLD_BUDGET });
    expect(legalSnapshot()).toBe(before);
    expect((loadDb().generatedContracts || []).map((c) => c.contractNumber)).toEqual(['CTR-2026-00001']);
    expect(loadDb().contractSignatures).toHaveLength(1);
  });

  it('UI header e resumo mostram o displayNumber do SSOT, sem hardcode', () => {
    const identity = resolveClinicalBudgetIdentity({ appointmentId: NEW_APPT });
    const header = renderToStaticMarkup(
      React.createElement(BudgetPremiumHeader, {
        displayNumber: identity.displayNumber,
        statusLabel: 'Em negociação',
        budgetStatus: identity.status,
        isEditBlocked: false,
        isLocked: false,
        hasDocuments: false,
        hasActiveContract: false,
        saving: false,
        onSave() {},
        onSend() {},
        onReject() {},
        onGeneratePdf() {},
        onPrint() {},
        onViewContract() {},
        onCreateNew() {},
        onApprove() {},
      }),
    );
    expect(header).toContain('ORC-002');
    expect(header).toContain('Em negociação');
    expect(header).toContain('data-testid="budget-active-identity"');

    const summary = renderToStaticMarkup(
      React.createElement(BudgetSummaryPanel, {
        displayNumber: identity.displayNumber,
        patientName: 'Paulo Henrique Silva de Assis',
        planName: 'Aplicação topica de fluor',
        professionalName: 'Juliana de Oliveira Freire',
        procedureCount: 1,
        originalValue: 150,
        discount: 0,
        finalValue: 150,
        validityDate: '',
        status: identity.status,
      }),
    );
    expect(summary).toContain('ORC-002');
    expect(summary).toContain('data-testid="budget-summary-identity"');
    expect(summary).toContain('Paulo Henrique Silva de Assis');
  });

  it('UI legado mostra ORC-001 a partir do SSOT, sem backfill', () => {
    const identity = resolveClinicalBudgetIdentity({ appointmentId: OLD_APPT });
    const header = renderToStaticMarkup(
      React.createElement(BudgetPremiumHeader, {
        displayNumber: identity.displayNumber,
        statusLabel: 'Contrato gerado',
        budgetStatus: identity.status,
        isEditBlocked: true,
        isLocked: true,
        hasDocuments: false,
        hasActiveContract: true,
        saving: false,
        onSave() {},
        onSend() {},
        onReject() {},
        onGeneratePdf() {},
        onPrint() {},
        onViewContract() {},
        onCreateNew() {},
        onApprove() {},
      }),
    );
    expect(header).toContain('ORC-001');
    expect(getBudget(OLD_APPT).budgetNumber == null).toBe(true);
  });

  it('seção clínica consome o resolver de identidade, não índice visual', () => {
    const section = readSrc('src/components/clinical/ClinicalBudgetSection.jsx');
    expect(section).toContain('resolveClinicalBudgetIdentity');
    expect(section).not.toContain('index + 1');
    expect(section).not.toContain('listPatientBudgetHistory');
    expect(section).not.toMatch(/ORC-002/);
    expect(section).not.toContain('getLatestApprovedBudget');
    expect(readSrc('src/services/clinicalBudgetLockService.js')).toContain('resolveClinicalBudgetIdentity');
  });
});
