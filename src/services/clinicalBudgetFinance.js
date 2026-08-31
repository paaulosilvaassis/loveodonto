import { loadDb, withDb } from '../db/index.js';
import { createId } from './helpers.js';
import { BUDGET_STATUS, saveBudget, updateBudgetStatus } from './clinicalService.js';
import {
  createReceivable,
  findPathAObligationReceivable,
  RECEIVABLE_ORIGIN_TYPE,
} from './receivablesService.js';
import { FINANCIAL_PAYMENT_METHOD } from './auditEventCatalog.js';
import { calcOptionFinalValue, calcPlannedValue } from '../components/clinical/budget/budgetUtils.js';
import { createFinancingFromApprovedBudget } from './clinicalBudgetFinancingIntegration.js';
import { assertSameTenant, requireSessionTenantId } from './tenantWriteGuard.js';

const METHOD_MAP = {
  pix: FINANCIAL_PAYMENT_METHOD.PIX,
  dinheiro: FINANCIAL_PAYMENT_METHOD.CASH,
  cartao_debito: FINANCIAL_PAYMENT_METHOD.DEBIT_CARD,
  cartao_credito: FINANCIAL_PAYMENT_METHOD.CREDIT_CARD,
  transferencia: FINANCIAL_PAYMENT_METHOD.TRANSFER,
  boleto: FINANCIAL_PAYMENT_METHOD.BOLETO,
};

function resolvePaymentMethod(method) {
  return METHOD_MAP[method] || FINANCIAL_PAYMENT_METHOD.PIX;
}

function normalizeTenant(value) {
  return String(value || '').trim();
}

/**
 * Identidade PATH A: tenant + origin treatment_plan + budget.id + installment_number.
 * installment_number 0 = entrada; 1..N = parcelas. Não usa valor nem patientId como chave.
 */
export function buildPathAObligationIdentity({ tenantId, budgetId, installmentNumber }) {
  return `${normalizeTenant(tenantId)}::treatment_plan::${String(budgetId || '').trim()}::${Number(installmentNumber)}`;
}

export function resolveBudgetFinanceTenantId(appointmentId, patientId, budget, dbSnapshot = null) {
  const db = dbSnapshot || loadDb();
  const fromBudget = normalizeTenant(budget?.tenant_id || budget?.tenantId);
  if (fromBudget) return fromBudget;
  const apt = (db.appointments || []).find((row) => row.id === appointmentId);
  const fromApt = normalizeTenant(apt?.tenant_id || apt?.tenantId);
  if (fromApt) return fromApt;
  const patient = (db.patients || []).find((row) => row.id === patientId);
  return normalizeTenant(patient?.tenant_id || patient?.tenantId) || null;
}

export function assertBudgetFinanceTenantBinding(user, { appointmentId, patientId, budget }) {
  const sessionTenantId = requireSessionTenantId(user);
  const budgetTenantId = resolveBudgetFinanceTenantId(appointmentId, patientId, budget);
  if (budgetTenantId) {
    assertSameTenant(user, budgetTenantId, { action: 'write' });
  }
  return sessionTenantId;
}

function getAcceptedOption(budget) {
  return (budget?.paymentOptions || []).find((option) => option.accepted) || null;
}

function isPathARequired(accepted) {
  return Boolean(accepted) && accepted.type !== 'financiamento';
}

function buildPathAReceivableSpecs({ patientId, budget, tenantId }) {
  const accepted = getAcceptedOption(budget);
  const original = calcPlannedValue(budget.procedures || []);
  const total = calcOptionFinalValue(accepted, original);
  const down = Number(accepted.downPayment || 0);
  const installments = Math.max(1, Number(accepted.installments || 1));
  const remainder = Math.max(0, total - down);
  const installmentValue = installments > 0 ? remainder / installments : remainder;
  const originId = budget.id;
  const paymentMethod = resolvePaymentMethod(accepted.method);
  const specs = [];

  if (down > 0) {
    specs.push({
      patient_id: patientId,
      description: `Entrada — Orçamento ${originId}`,
      original_amount: down,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: originId,
      budget_id: originId,
      treatment_plan_id: originId,
      installment_number: 0,
      total_installments: installments,
      due_date: accepted.firstDueDate || new Date().toISOString().slice(0, 10),
      payment_method_expected: paymentMethod,
      tenant_id: tenantId,
    });
  }

  for (let i = 0; i < installments; i += 1) {
    const amount = Number(installmentValue.toFixed(2));
    if (!(amount > 0)) continue;
    const due = accepted.firstDueDate ? new Date(accepted.firstDueDate) : new Date();
    due.setMonth(due.getMonth() + i);
    specs.push({
      patient_id: patientId,
      description: `Parcela ${i + 1}/${installments} — Orçamento ${originId}`,
      original_amount: amount,
      origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,
      origin_id: originId,
      budget_id: originId,
      treatment_plan_id: originId,
      installment_number: i + 1,
      total_installments: installments,
      due_date: due.toISOString().slice(0, 10),
      payment_method_expected: paymentMethod,
      tenant_id: tenantId,
    });
  }

  return specs;
}

/**
 * Cria contas a receber conforme opção de pagamento aceita no orçamento.
 * PATH A only. Financiamento é PATH B e retorna [].
 * Idempotente: retry do mesmo budget+tenant+installment_number não cria título novo.
 */
export function createReceivablesFromApprovedBudget(user, appointmentId, patientId, budget) {
  if (!budget || budget.status !== BUDGET_STATUS.APROVADO) return [];
  const accepted = getAcceptedOption(budget);
  if (!accepted) return [];
  if (accepted.type === 'financiamento') return [];
  if (!patientId) {
    throw new Error('Paciente é obrigatório para materializar a obrigação financeira.');
  }

  const tenantId = assertBudgetFinanceTenantBinding(user, { appointmentId, patientId, budget });
  const specs = buildPathAReceivableSpecs({ patientId, budget, tenantId });
  if (!specs.length) {
    throw new Error('Obrigação financeira obrigatória não pôde ser derivada do orçamento aprovado.');
  }

  return withDb((db) => {
    if (!Array.isArray(db.accountsReceivable)) db.accountsReceivable = [];
    const created = [];
    for (const spec of specs) {
      const existing = findPathAObligationReceivable(db.accountsReceivable, {
        tenantId,
        originId: spec.origin_id,
        installmentNumber: spec.installment_number,
      });
      if (existing) {
        created.push(existing);
        continue;
      }
      created.push(createReceivable(user, spec));
    }
    return created;
  });
}

/**
 * Processa integração financeira após aprovação do orçamento.
 * PATH A: receivables imediatos. PATH B: proposta de financiamento. Não mistura.
 */
export function processApprovedBudgetFinance(user, {
  appointmentId,
  patientId,
  patient,
  budget,
  professional,
}) {
  const accepted = getAcceptedOption(budget);
  if (!accepted) {
    return { receivables: [], financing: null };
  }

  assertBudgetFinanceTenantBinding(user, { appointmentId, patientId, budget });

  if (accepted.type === 'financiamento') {
    const financing = createFinancingFromApprovedBudget(user, {
      appointmentId,
      patientId,
      patient,
      budget,
      professional,
    });
    return { receivables: [], financing };
  }

  const receivables = createReceivablesFromApprovedBudget(
    user,
    appointmentId,
    patientId,
    budget,
  );
  if (!receivables.length) {
    throw new Error('Materialização financeira obrigatória não gerou títulos.');
  }
  return { receivables, financing: null };
}

/**
 * Atomicidade lógica PATH A/B: materializa financeiro ANTES de consolidar APROVADO.
 * Se a materialização obrigatória falhar, o status não é persistido como APROVADO.
 */
export function approveClinicalBudgetWithFinance(user, {
  appointmentId,
  patientId,
  patient,
  budget,
  professional,
}) {
  if (!user) {
    const error = new Error('Permissão insuficiente.');
    error.code = 'PERMISSION_DENIED';
    throw error;
  }

  const budgetToSave = {
    ...budget,
    professionalId: budget?.professionalId || professional?.id || null,
    id: budget?.id || createId('budget'),
  };
  saveBudget(user, appointmentId, budgetToSave);

  const approvedBudget = {
    ...budgetToSave,
    status: BUDGET_STATUS.APROVADO,
    approvedAt: new Date().toISOString(),
    approvedBy: user.id,
  };

  const result = processApprovedBudgetFinance(user, {
    appointmentId,
    patientId,
    patient,
    budget: approvedBudget,
    professional,
  });

  const accepted = getAcceptedOption(approvedBudget);
  if (isPathARequired(accepted) && !result.receivables?.length) {
    throw new Error('Materialização financeira obrigatória não gerou títulos.');
  }
  if (accepted?.type === 'financiamento' && !result.financing?.id) {
    throw new Error('Materialização de financiamento obrigatória falhou.');
  }

  updateBudgetStatus(user, appointmentId, BUDGET_STATUS.APROVADO);
  let nextBudget = approvedBudget;
  if (result.financing?.id) {
    nextBudget = { ...approvedBudget, financingId: result.financing.id };
  }
  saveBudget(user, appointmentId, nextBudget, { skipLockCheck: true });
  return { ...result, budget: nextBudget };
}
