import { withDb } from '../db/index.js';
import { can } from '../permissions/permissions.js';
import {
  createFinancingProposal,
  getFinancingById,
  linkFinancingToContract as linkContractOnFinancing,
} from './financingsService.js';
import { getBudget, saveBudget, BUDGET_STATUS } from './clinicalService.js';
import { getGeneratedContract } from './contractService.js';
import { FINANCING_INTEREST_TYPES } from './financingCalculator.js';
import { calcOptionFinalValue, calcPlannedValue } from '../components/clinical/budget/budgetUtils.js';
import {
  buildFinancingPayloadFromPaymentOption,
  getFinancingSummaryForOption,
  mapFinancingSummaryToPaymentOption,
  validateFinancingPaymentOption,
} from '../components/clinical/budget/budgetFinancingUtils.js';
import { getFinancialPartnerById } from './financialPartnersService.js';

const todayIso = () => new Date().toISOString().slice(0, 10);

function resolvePatientDocument(patient) {
  return patient?.cpf || patient?.document || patient?.profile?.cpf || '';
}

function buildTreatmentDescription(budget) {
  const plan = budget?.planName?.trim();
  const procedures = (budget?.procedures || []).map((p) => p.name).filter(Boolean);
  if (plan) return plan;
  if (procedures.length) return procedures.slice(0, 3).join(', ');
  return 'Tratamento odontológico';
}

function buildFinancingProposalPayload({
  user,
  appointmentId,
  patientId,
  patient,
  budget,
  professional,
  acceptedOption,
  originalValue,
}) {
  const summaryInput = buildFinancingPayloadFromPaymentOption(acceptedOption, originalValue);
  const summary = getFinancingSummaryForOption(acceptedOption, originalValue);
  const partnerRecord = acceptedOption.partnerId
    ? getFinancialPartnerById(acceptedOption.partnerId)
    : null;
  const partnerName = acceptedOption.customPartnerName
    || acceptedOption.partner
    || partnerRecord?.name
    || 'Financiamento';
  const description = `${buildTreatmentDescription(budget)} — ${partnerName}`;

  return {
    patient_id: patientId,
    professional_id: professional?.id || budget?.professionalId || null,
    treatment_plan_id: budget?.id || null,
    clinical_appointment_id: appointmentId,
    budget_id: budget?.id || null,
    source: 'clinical_budget',
    financial_partner_id: acceptedOption.partnerId || null,
    partner_name: partnerName,
    description,
    total_amount: summaryInput.total_amount,
    entry_amount: summaryInput.entry_amount,
    installments_count: summaryInput.installments_count,
    installment_frequency: acceptedOption.installmentFrequency || 'monthly',
    first_due_date: acceptedOption.firstDueDate || todayIso(),
    issue_date: todayIso(),
    interest_type: summaryInput.interest_type || FINANCING_INTEREST_TYPES.NONE,
    interest_rate: summaryInput.interest_rate,
    discount_amount: summaryInput.discount_amount,
    admin_fee_rate: summaryInput.admin_fee_rate,
    admin_fee_amount: summaryInput.admin_fee_amount,
    requires_credit_analysis: true,
    boleto_auto_generate: true,
    internal_notes: acceptedOption.notes || '',
    external_notes: '',
    patient_name: patient?.full_name || patient?.name || '',
    patient_document: resolvePatientDocument(patient),
    budget_approved_at: new Date().toISOString(),
    budget_approved_by: user?.id || null,
    calculation_snapshot: summary ? {
      totalAmount: summary.totalAmount,
      entryAmount: summary.entryAmount,
      financedAmount: summary.financedAmount,
      netFinancedAmount: summary.netFinancedAmount,
      installmentAmount: summary.installmentAmount,
      totalPayableAmount: summary.totalPayableAmount,
      totalInterest: summary.totalInterest,
      adminFee: summary.adminFee,
      interestType: summary.interestType,
      interestRate: summary.interestRate,
      installmentsCount: summary.installmentsCount,
      partnerId: acceptedOption.partnerId || null,
      partnerName,
    } : null,
    payer_data: {
      payer_name: patient?.full_name || patient?.name || '',
      payer_document: resolvePatientDocument(patient),
      payer_email: patient?.email || '',
      payer_phone: patient?.phone || patient?.telefone || '',
    },
  };
}

/**
 * Cria registro em Financeiro > Financiamentos a partir de orçamento aprovado.
 */
export function createFinancingFromApprovedBudget(user, {
  appointmentId,
  patientId,
  patient,
  budget,
  professional,
}) {
  if (!budget || budget.status !== BUDGET_STATUS.APROVADO) {
    throw new Error('Orçamento deve estar aprovado para gerar financiamento.');
  }
  if (budget.financingId) {
    const existing = getFinancingById(budget.financingId);
    if (existing) return existing;
  }

  const accepted = (budget.paymentOptions || []).find((o) => o.accepted);
  if (!accepted || accepted.type !== 'financiamento') {
    throw new Error('Condição de financiamento não encontrada no orçamento.');
  }
  if (!patientId) throw new Error('Paciente é obrigatório para financiamento.');

  const originalValue = calcPlannedValue(budget.procedures || []);
  const validationErrors = validateFinancingPaymentOption(accepted, originalValue);
  if (validationErrors.length) {
    throw new Error(validationErrors.join(' '));
  }

  const canCreate = can(user, 'prontuario_orcamentos:approve')
    || can(user, 'financeiro_financiamentos:create')
    || can(user, 'finance:write');
  if (!canCreate) {
    const error = new Error('Permissão insuficiente para criar financiamento.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }

  const payload = buildFinancingProposalPayload({
    user,
    appointmentId,
    patientId,
    patient,
    budget,
    professional,
    acceptedOption: accepted,
    originalValue,
  });

  const financing = createFinancingProposal(user, payload, { source: 'clinical_budget' });

  const summary = getFinancingSummaryForOption(accepted, originalValue);
  const nextBudget = {
    ...budget,
    financingId: financing.id,
    paymentOptions: (budget.paymentOptions || []).map((opt) => {
      if (opt.id !== accepted.id) return opt;
      return { ...opt, ...mapFinancingSummaryToPaymentOption(summary) };
    }),
  };
  saveBudget(user, appointmentId, nextBudget);

  return financing;
}

function isContractSigned(contract) {
  if (!contract) return false;
  return contract.status === 'generated' || Boolean(contract.signedAt);
}

/**
 * Sincroniza condição de financiamento do Financeiro de volta ao orçamento
 * (somente se contrato ainda não assinado/finalizado).
 */
export function syncClinicalBudgetFromFinancing(financingId, actorId = null) {
  const financing = getFinancingById(financingId);
  if (!financing || financing.source !== 'clinical_budget') return null;
  if (!financing.clinical_appointment_id || !financing.budget_id) return null;

  const appointmentId = financing.clinical_appointment_id;
  const budget = getBudget(appointmentId);
  if (!budget || budget.id !== financing.budget_id) return null;

  if (financing.contract_id) {
    const contract = getGeneratedContract(financing.contract_id);
    if (isContractSigned(contract)) return null;
  }

  const originalValue = calcPlannedValue(budget.procedures || []);
  const acceptedId = (budget.paymentOptions || []).find((o) => o.accepted)?.id;
  const nextOptions = (budget.paymentOptions || []).map((opt) => {
    if (opt.id !== acceptedId && !opt.accepted) return opt;
    if (opt.type !== 'financiamento') return opt;
    return {
      ...opt,
      accepted: true,
      downPayment: financing.entry_amount,
      installments: financing.installments_count,
      installmentValue: financing.installment_amount,
      interestType: financing.interest_type,
      interestRate: financing.interest_rate,
      firstDueDate: financing.first_due_date,
      partner: financing.partner_name || opt.partner,
      total: financing.total_amount || calcOptionFinalValue(opt, originalValue),
      financedAmount: financing.financed_amount,
      netFinancedAmount: financing.net_financed_amount,
      totalPayableAmount: financing.total_payable_amount,
    };
  });

  return withDb((db) => {
    const index = (db.clinicalAppointments || []).findIndex(
      (item) => item.appointmentId === appointmentId,
    );
    if (index < 0) return null;
    const clinical = { ...db.clinicalAppointments[index] };
    clinical.budget = {
      ...clinical.budget,
      paymentOptions: nextOptions,
      financingId: financing.id,
      updatedAt: new Date().toISOString(),
      updatedBy: actorId,
    };
    clinical.updatedAt = new Date().toISOString();
    db.clinicalAppointments[index] = clinical;
    return clinical.budget;
  });
}

/**
 * Vincula contrato gerado ao financiamento do orçamento clínico.
 */
export function linkFinancingToClinicalContract(user, appointmentId, contractId) {
  const budget = getBudget(appointmentId);
  if (!budget?.financingId) return null;
  return linkContractOnFinancing(user, budget.financingId, contractId);
}

export function getFinancingIdFromBudget(appointmentId) {
  return getBudget(appointmentId)?.financingId || null;
}
