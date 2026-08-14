/**
 * PHASE_10.21AX — régua Contrato/Documentos segue o lifecycle jurídico.
 * Sem finalizar, assinar, freeze, comunicar ou mutar entidades de produção.
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
import { areRequiredApplicableDocumentsSatisfied } from '../contracts/treatmentDocumentRequirements.js';
import {
  isClinicalContractLegallyFinalized,
  evaluateClinicalSignatureReadiness,
  CLINICAL_SIGNATURE_STEP,
} from '../contracts/clinicalSignatureReadiness.js';
import {
  CLINICAL_NAV_ITEMS,
  getClinicalWorkflowState,
  getNavStepStatus,
  getNavStepCompletionStatus,
  STEP_STATUS,
  STEP_STATUS_LABELS,
} from '../components/clinical/clinicalAppointmentConfig.js';
import { ClinicalStepNav } from '../components/clinical/ClinicalStepNav.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OLD_APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const NEW_APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const OLD_CLINICAL = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const NEW_CLINICAL = 'clinical-ax-new';
const OLD_BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const NEW_BUDGET = 'budget-ax-orc-002';
const OLD_CONTRACT = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const NEW_CONTRACT = 'gctr-ax-ctr-00002';
const USER = { id: 'user-ax', role: 'admin', tenant_id: TENANT, tenantId: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function legalSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    appointments: db.appointments.map((a) => ({ id: a.id, status: a.status })),
    budgets: (db.clinicalAppointments || []).map((c) => ({
      appointmentId: c.appointmentId,
      budgetId: c.budget?.id,
      budgetNumber: c.budget?.budgetNumber ?? null,
      status: c.budget?.status,
      payment: (c.budget?.paymentOptions || []).map((o) => ({
        id: o.id,
        accepted: o.accepted,
      })),
    })),
    contracts: (db.generatedContracts || []).map((c) => ({
      id: c.id,
      contractNumber: c.contractNumber,
      status: c.status,
      budgetId: c.budgetId,
      quoteId: c.quoteId,
      metadata: c.metadata,
      renderedHtml: c.renderedHtml,
    })),
    signatures: db.contractSignatures,
  });
}

function seedPilot({ newContractStatus = CONTRACT_STATUS.DRAFT } = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT, nomeFantasia: 'Implanprime' };
    db.patients = [{ id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT }];
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
    ];
    db.clinicalAppointments = [
      {
        id: OLD_CLINICAL,
        appointmentId: OLD_APPT,
        patientId: PATIENT,
        plannedProcedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
        budget: {
          id: OLD_BUDGET,
          budgetNumber: null,
          status: BUDGET_STATUS.CONTRATO_GERADO,
          totalValue: 150,
          planName: 'Aplicação tópica de flúor',
          procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
          paymentOptions: [{ id: 'pay-a-vista', type: 'a_vista', accepted: true, method: 'pix' }],
        },
      },
      {
        id: NEW_CLINICAL,
        appointmentId: NEW_APPT,
        patientId: PATIENT,
        plannedProcedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
        budget: {
          id: NEW_BUDGET,
          budgetNumber: 'ORC-002',
          status: BUDGET_STATUS.APROVADO,
          totalValue: 150,
          planName: 'Aplicação tópica de flúor',
          procedures: [{ name: 'Aplicação tópica de flúor', quantity: 1, unitValue: 150 }],
          paymentOptions: [{
            id: 'pay-a-vista',
            type: 'a_vista',
            accepted: true,
            method: 'pix',
            presentationStatus: 'escolhida',
          }],
        },
      },
    ];
    db.generatedContracts = [
      {
        id: OLD_CONTRACT,
        contractNumber: 'CTR-2026-00001',
        status: CONTRACT_STATUS.SIGNED,
        budgetId: OLD_BUDGET,
        quoteId: OLD_APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        clinicId: 'clinic-1',
        tenant_id: TENANT,
        renderedHtml: '<p>legado</p>',
        metadata: { packageManifestId: 'manifest-legacy-ax', frozenAt: '2026-08-13T21:00:00.000Z' },
      },
      {
        id: NEW_CONTRACT,
        contractNumber: 'CTR-2026-00002',
        status: newContractStatus,
        budgetId: NEW_BUDGET,
        quoteId: NEW_APPT,
        quoteSource: 'clinical_budget',
        patientId: PATIENT,
        clinicId: 'clinic-1',
        tenant_id: TENANT,
        renderedHtml: '<p>rascunho</p>',
        metadata: {},
      },
    ];
    db.contractSignatures = [{
      id: 'sig-legacy-ax',
      contractId: OLD_CONTRACT,
      signerRole: 'patient',
    }];
  });
}

function ruler(appointmentId, budgetId, activeSection = 'contratos') {
  const workflow = getClinicalWorkflowState(appointmentId, budgetId);
  return {
    workflow,
    planejamento: getNavStepStatus('planejamento', workflow, activeSection),
    orcamento: getNavStepStatus('orcamento', workflow, activeSection),
    contratos: getNavStepStatus('contratos', workflow, activeSection),
    documentos: getNavStepStatus('documentos', workflow, activeSection),
    assinatura: getNavStepStatus('assinatura', workflow, activeSection),
    clinicos: getNavStepStatus('dados-clinicos', workflow, activeSection),
    observacoes: getNavStepStatus('observacoes', workflow, activeSection),
  };
}

describe('PHASE_10.21AX — régua Contrato/Documentos', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPilot();
  });

  it('root cause: existência do contrato não finaliza a etapa Contrato', () => {
    const src = readSrc('src/components/clinical/clinicalAppointmentConfig.js');
    expect(src).toContain('if (workflow.contractFinalized) return STEP_STATUS.COMPLETED');
    expect(src).toContain('if (!workflow.contractFinalized)');
    expect(src).not.toContain('hasActiveContract || workflow.lockCtx?.contractSigned');
    expect(isClinicalContractLegallyFinalized({ id: NEW_CONTRACT, status: CONTRACT_STATUS.DRAFT })).toBe(false);
    expect(isClinicalContractLegallyFinalized({ id: NEW_CONTRACT, status: CONTRACT_STATUS.GENERATED })).toBe(true);
  });

  it('CTR-2026-00002 draft: Contrato Em andamento; Documentos não Concluído; Assinatura Bloqueada', () => {
    const before = legalSnapshot();
    const view = ruler(NEW_APPT, NEW_BUDGET, 'contratos');
    expect(view.workflow.budgetId).toBe(NEW_BUDGET);
    expect(view.workflow.linkedContractStatus).toBe(CONTRACT_STATUS.DRAFT);
    expect(view.workflow.contractFinalized).toBe(false);
    expect(view.workflow.contractInEdit).toBe(true);
    expect(view.planejamento).toBe(STEP_STATUS.COMPLETED);
    expect(view.orcamento).toBe(STEP_STATUS.COMPLETED);
    expect(view.contratos).toBe(STEP_STATUS.IN_PROGRESS);
    expect(view.documentos).toBe(STEP_STATUS.PENDING);
    expect(view.assinatura).toBe(STEP_STATUS.BLOCKED);
    expect(view.clinicos).toBe(STEP_STATUS.PENDING);
    expect(view.observacoes).toBe(STEP_STATUS.PENDING);

    expect(areRequiredApplicableDocumentsSatisfied({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
    })).toBe(true);

    const html = renderToStaticMarkup(
      React.createElement(ClinicalStepNav, {
        items: CLINICAL_NAV_ITEMS,
        activeSection: 'contratos',
        workflow: view.workflow,
        onSelect() {},
      }),
    );
    expect(html).toContain(STEP_STATUS_LABELS[STEP_STATUS.IN_PROGRESS]);
    expect(html).toContain(STEP_STATUS_LABELS[STEP_STATUS.BLOCKED]);
    expect(legalSnapshot()).toBe(before);
  });

  it('Documentos permanece Pendente mesmo com a aba Documentos ativa, enquanto o contrato está em edição', () => {
    const completion = getNavStepCompletionStatus(
      'documentos',
      getClinicalWorkflowState(NEW_APPT, NEW_BUDGET),
    );
    expect(completion).toBe(STEP_STATUS.PENDING);
    const status = getNavStepStatus(
      'documentos',
      getClinicalWorkflowState(NEW_APPT, NEW_BUDGET),
      'documentos',
    );
    expect(status).not.toBe(STEP_STATUS.COMPLETED);
  });

  it('contrato GENERATED conclui Contrato; Documentos pode concluir; Assinatura continua independente', () => {
    seedPilot({ newContractStatus: CONTRACT_STATUS.GENERATED });
    const view = ruler(NEW_APPT, NEW_BUDGET, 'contratos');
    expect(view.contratos).toBe(STEP_STATUS.COMPLETED);
    expect(view.documentos).toBe(STEP_STATUS.COMPLETED);
    expect(view.assinatura).not.toBe(STEP_STATUS.COMPLETED);
    expect(evaluateClinicalSignatureReadiness({
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
      user: USER,
    }).step).not.toBe(CLINICAL_SIGNATURE_STEP.SIGNED);
  });

  it('legado CTR-2026-00001 SIGNED permanece concluído no próprio appointment', () => {
    const view = ruler(OLD_APPT, OLD_BUDGET, 'contratos');
    expect(view.workflow.budgetId).toBe(OLD_BUDGET);
    expect(view.contratos).toBe(STEP_STATUS.COMPLETED);
    expect(view.assinatura).toBe(STEP_STATUS.COMPLETED);
    expect(getClinicalWorkflowState(NEW_APPT, NEW_BUDGET).linkedContractStatus).toBe(CONTRACT_STATUS.DRAFT);
  });

  it('resolver não muta ORC-002, contratos, assinatura nem manifest', () => {
    const before = legalSnapshot();
    ruler(NEW_APPT, NEW_BUDGET, 'contratos');
    ruler(OLD_APPT, OLD_BUDGET, 'documentos');
    getNavStepCompletionStatus('contratos', getClinicalWorkflowState(NEW_APPT, NEW_BUDGET));
    expect(legalSnapshot()).toBe(before);
    const db = loadDb();
    expect(db.generatedContracts.map((c) => c.contractNumber)).toEqual([
      'CTR-2026-00001',
      'CTR-2026-00002',
    ]);
    expect(db.generatedContracts.find((c) => c.id === NEW_CONTRACT).status).toBe(CONTRACT_STATUS.DRAFT);
    expect(db.clinicalAppointments.find((c) => c.appointmentId === NEW_APPT).budget.budgetNumber).toBe('ORC-002');
    expect(db.contractSignatures).toHaveLength(1);
  });
});
