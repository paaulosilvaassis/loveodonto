/**
 * PHASE_10.21AY — CTA clínico de finalização (draft → generated).
 * Writer oficial: finalizeGeneratedContract. Sem criar contrato, assinar ou freeze.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
} from '../services/contractModuleService.js';
import { getGeneratedContract } from '../services/contractService.js';
import { isPackageManifestFrozen } from '../contracts/clinicalSignatureReadiness.js';
import {
  getClinicalWorkflowState,
  getNavStepStatus,
  STEP_STATUS,
} from '../components/clinical/clinicalAppointmentConfig.js';
import {
  canShowFinalizeClinicalContractCta,
  finalizeClinicalContractDraft,
} from '../components/clinical/contract/finalizeClinicalContractDraft.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OLD_APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const NEW_APPT = 'appt-041ca62b-5bd9-4359-8bdc-c54e175a6ff1';
const OLD_BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const NEW_BUDGET = 'budget-ay-orc-002';
const OLD_CONTRACT = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const USER = { id: 'user-ay', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin AY' };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function legalSnapshot() {
  const db = loadDb();
  return JSON.stringify({
    budgets: (db.clinicalAppointments || []).map((c) => ({
      appointmentId: c.appointmentId,
      budgetId: c.budget?.id,
      budgetNumber: c.budget?.budgetNumber ?? null,
      status: c.budget?.status,
    })),
    contracts: (db.generatedContracts || []).map((c) => ({
      id: c.id,
      contractNumber: c.contractNumber,
      status: c.status,
      budgetId: c.budgetId,
      quoteId: c.quoteId,
      metadata: c.metadata,
    })),
    signatures: db.contractSignatures,
  });
}

function seedPilot() {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = {
      id: 'clinic-1',
      razaoSocial: 'Implanprime LTDA',
      nomeFantasia: 'Implanprime',
      tenant_id: TENANT,
    };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Dra Juliana',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      id: 'addr-ay',
      principal: true,
      logradouro: 'Rua Teste',
      numero: '1',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30130-000',
    }];
    db.collaborators = [{
      id: 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8',
      nomeCompleto: 'Juliana de Oliveira Freire',
      cro: 'CRO-MG 27267',
      conselhoNumero: 'CRO-MG 27267',
      active: true,
      tenant_id: TENANT,
    }];
    db.patients = [{
      id: PATIENT,
      full_name: 'Paulo Henrique Silva de Assis',
      cpf: '39053344705',
      birth_date: '1990-01-15',
      tenant_id: TENANT,
    }];
    db.patientAddresses = [{
      id: 'paddr-ay',
      patient_id: PATIENT,
      street: 'Av Paciente',
      number: '10',
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
      cep: '30130-000',
      principal: true,
    }];
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
        id: 'clinical-legacy-ay',
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
        id: 'clinical-ay-new',
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
    db.contractSeqByClinic = { 'clinic-1': 1 };
    db.generatedContracts = [{
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
      metadata: { packageManifestId: 'manifest-legacy-ay', frozenAt: '2026-08-13T21:00:00.000Z' },
    }];
    db.contractSignatures = [{
      id: 'sig-legacy-ay',
      contractId: OLD_CONTRACT,
      signerRole: 'patient',
    }];
  });
  ensureContractsModuleSeeded();
}

function createNewDraft() {
  const tpl = loadDb().contractTemplates.find((t) => t.type === 'system_default')
    || loadDb().contractTemplates[0];
  return createContractDraft(USER, {
    quoteSource: 'clinical_budget',
    quoteId: NEW_APPT,
    patientId: PATIENT,
    budgetId: NEW_BUDGET,
    templateId: tpl.id,
    editedHtml: '<p>Contrato ORC-002 flúor</p>',
    skipHashtagValidation: true,
  });
}

describe('PHASE_10.21AY — restaurar Finalizar contrato', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedPilot();
  });

  it('writer oficial e CTA clínico existem; lifecycle draft → generated', () => {
    const writer = readSrc('src/services/contractService.js');
    expect(writer).toContain('export function finalizeGeneratedContract');
    expect(writer).toContain("status: 'generated'");
    const helper = readSrc('src/components/clinical/contract/finalizeClinicalContractDraft.js');
    expect(helper).toContain('finalizeGeneratedContract(user, contract.id)');
    expect(helper).not.toContain('markBudgetContractGenerated');
    expect(helper).not.toContain('createContractDraft');
    const clinical = readSrc('src/components/clinical/ClinicalContractSection.jsx');
    expect(clinical).toContain('finalize-clinical-contract-cta');
    expect(clinical).toContain('Finalizar contrato');
    expect(clinical).toContain('finalizeClinicalContractDraft');
  });

  it('CTA só no draft; confirmação deixa claro que a edição acaba', () => {
    const draft = createNewDraft();
    expect(canShowFinalizeClinicalContractCta(draft)).toBe(true);
    expect(draft.contractNumber).toBe('CTR-2026-00002');
    const modal = readSrc('src/components/clinical/contract/FinalizeClinicalContractModal.jsx');
    expect(modal).toContain('Finalizar contrato?');
    expect(modal).toContain('não poderá mais ser editado');
    expect(modal).toContain('Nenhuma assinatura será enviada automaticamente');
    expect(canShowFinalizeClinicalContractCta({
      ...draft,
      status: CONTRACT_STATUS.GENERATED,
    })).toBe(false);
  });

  it('finaliza o mesmo CTR-2026-00002, libera régua e não congela manifest', () => {
    const draft = createNewDraft();
    const beforeIds = (loadDb().generatedContracts || []).map((c) => c.id);
    const beforeBudget = loadDb().clinicalAppointments.find((c) => c.appointmentId === NEW_APPT).budget;
    const result = finalizeClinicalContractDraft(USER, {
      contractId: draft.id,
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
    });
    expect(result.ok).toBe(true);
    expect(result.contract.id).toBe(draft.id);
    expect(result.contract.contractNumber).toBe('CTR-2026-00002');
    expect(result.contract.status).toBe(CONTRACT_STATUS.GENERATED);
    expect(result.manifestFrozenChanged).toBe(false);
    expect(isPackageManifestFrozen(getGeneratedContract(draft.id))).toBe(false);
    expect((loadDb().generatedContracts || []).map((c) => c.id)).toEqual(beforeIds);
    expect(canShowFinalizeClinicalContractCta(result.contract)).toBe(false);

    const workflow = getClinicalWorkflowState(NEW_APPT, NEW_BUDGET);
    expect(getNavStepStatus('contratos', workflow, 'contratos')).toBe(STEP_STATUS.COMPLETED);
    expect(getNavStepStatus('documentos', workflow, 'contratos')).toBe(STEP_STATUS.COMPLETED);
    expect(getNavStepStatus('assinatura', workflow, 'contratos')).not.toBe(STEP_STATUS.COMPLETED);
    expect(loadDb().contractSignatures).toHaveLength(1);
    expect(loadDb().clinicalAppointments.find((c) => c.appointmentId === NEW_APPT).budget.status)
      .toBe(beforeBudget.status);
    expect(readSrc('src/components/clinical/ClinicalContractSection.jsx'))
      .toContain('linkedContract?.status === CONTRACT_STATUS.DRAFT');
  });

  it('fail closed: appointment/budget mismatch não muta o draft', () => {
    const draft = createNewDraft();
    const before = legalSnapshot();
    const mismatch = finalizeClinicalContractDraft(USER, {
      contractId: draft.id,
      appointmentId: OLD_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
    });
    expect(mismatch.ok).toBe(false);
    expect(getGeneratedContract(draft.id).status).toBe(CONTRACT_STATUS.DRAFT);
    expect(legalSnapshot()).toBe(before);
  });

  it('legado CTR-2026-00001 e ORC-002 permanecem intactos no mismatch; finalize não cria CTR-00003', () => {
    const draft = createNewDraft();
    const result = finalizeClinicalContractDraft(USER, {
      contractId: draft.id,
      appointmentId: NEW_APPT,
      budgetId: NEW_BUDGET,
      patientId: PATIENT,
    });
    expect(result.ok).toBe(true);
    const numbers = (loadDb().generatedContracts || []).map((c) => c.contractNumber).sort();
    expect(numbers).toEqual(['CTR-2026-00001', 'CTR-2026-00002']);
    expect(loadDb().generatedContracts.find((c) => c.id === OLD_CONTRACT).status).toBe(CONTRACT_STATUS.SIGNED);
    expect(loadDb().clinicalAppointments.find((c) => c.appointmentId === NEW_APPT).budget.budgetNumber)
      .toBe('ORC-002');
  });
});
