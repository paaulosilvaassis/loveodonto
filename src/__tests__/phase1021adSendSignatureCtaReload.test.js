/**
 * PHASE_10.21AD — CTA "Enviar para assinatura" permanece após reload / route change.
 * SEND_SIGNATURE_CTA_RELOAD
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { canSendContractForSignature, resolveBudgetForContractSend } from '../services/contractSignatureFlowService.js';
import { getContractStatusForQuote } from '../services/contractModuleService.js';
import { canAccessContract } from '../components/clinical/contract/contractAccessUtils.js';
import { getClinicalWorkflowState, canAccessClinicalSection } from '../components/clinical/clinicalAppointmentConfig.js';
import { getBudgetLockContext } from '../services/clinicalBudgetLockService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';

const APPT = 'appt-ad-cta';
const PATIENT = 'patient-ad-cta';
const BUDGET = 'budget-ad-cta';
const CONTRACT = 'gctr-ad-cta';
const TENANT = 'tenant-ad-cta';

function seedEligibleGeneratedContract({
  budgetId = BUDGET,
  contractBudgetId = BUDGET,
  paymentAccepted = true,
  budgetStatus = BUDGET_STATUS.CONTRATO_GERADO,
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'AD Clinic' }];
    db.clinicProfile = { id: 'clinic-1', nomeFantasia: 'AD', tenant_id: TENANT };
    db.patients = [{
      id: PATIENT,
      full_name: 'Paciente AD CTA',
      status: 'active',
      tenant_id: TENANT,
    }];
    db.appointments = [{
      id: APPT,
      patientId: PATIENT,
      status: 'em_atendimento',
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      appointmentId: APPT,
      patientId: PATIENT,
      budget: {
        id: budgetId,
        status: budgetStatus,
        paymentOptions: paymentAccepted
          ? [{ id: 'pay-1', accepted: true, type: 'a_vista', presentationStatus: 'escolhida' }]
          : [{ id: 'pay-1', accepted: false, type: 'a_vista' }],
        procedures: [{ id: 'proc-1', name: 'Implante', price: 1000 }],
        totalValue: 1000,
      },
      plannedProcedures: [{ id: 'proc-1' }],
    }];
    db.generatedContracts = [{
      id: CONTRACT,
      clinicId: 'clinic-1',
      patientId: PATIENT,
      quoteId: APPT,
      quoteSource: 'clinical_budget',
      budgetId: contractBudgetId,
      status: CONTRACT_STATUS.GENERATED,
      contractNumber: 'CTR-AD-001',
      generatedAt: new Date().toISOString(),
      finalContent: '<p>contrato</p>',
      renderedHtml: '<p>contrato</p>',
    }];
    return db;
  });
}

describe('PHASE_10.21AD — SEND_SIGNATURE_CTA_RELOAD', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    await initDb();
  });

  afterEach(() => {
    resetDb();
  });

  it('contrato GENERATED + orçamento elegível → canSend true', () => {
    seedEligibleGeneratedContract();
    const contract = getContractStatusForQuote(APPT, 'clinical_budget', BUDGET, PATIENT);
    const budget = loadDb().clinicalAppointments[0].budget;
    expect(contract?.status).toBe(CONTRACT_STATUS.GENERATED);
    expect(canSendContractForSignature({ contract, budget })).toBe(true);
  });

  it('após “reload” sem budget prop: resolveBudget + canSend permanecem true', () => {
    seedEligibleGeneratedContract();
    const contract = getContractStatusForQuote(APPT, 'clinical_budget', null, PATIENT);
    expect(contract?.id).toBe(CONTRACT);
    const resolved = resolveBudgetForContractSend(contract, null);
    expect(resolved?.id).toBe(BUDGET);
    expect(canSendContractForSignature({ contract, budget: null })).toBe(true);
  });

  it('budgetId órfão no contrato não é reutilizado como contrato de outro orçamento', () => {
    seedEligibleGeneratedContract({ contractBudgetId: 'budget-orphan-other' });
    const contract = getContractStatusForQuote(APPT, 'clinical_budget', BUDGET, PATIENT);
    expect(contract).toBeNull();
  });

  it('workflow após reload mantém aba Contratos acessível e CTA elegível', () => {
    seedEligibleGeneratedContract({ paymentAccepted: false, budgetStatus: BUDGET_STATUS.CONTRATO_GERADO });
    const workflow = getClinicalWorkflowState(APPT, null);
    expect(canAccessClinicalSection('contratos', workflow)).toBe(true);

    const lockCtx = getBudgetLockContext(APPT);
    expect(canAccessContract(null, lockCtx) || canAccessContract(workflow.budget, lockCtx)).toBe(true);

    const contract = getContractStatusForQuote(APPT, 'clinical_budget', workflow.budget?.id || null, PATIENT);
    expect(canSendContractForSignature({ contract, budget: workflow.budget })).toBe(true);
  });

  it('contrato SENT não exibe CTA de envio', () => {
    seedEligibleGeneratedContract();
    withDb((db) => {
      const row = (db.generatedContracts || []).find((c) => c.id === CONTRACT);
      if (row) row.status = CONTRACT_STATUS.SENT;
      return db;
    });
    const contract = getContractStatusForQuote(APPT, 'clinical_budget', BUDGET, PATIENT);
    expect(canSendContractForSignature({ contract, budget: null })).toBe(false);
  });
});
