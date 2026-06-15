import { BUDGET_STATUS } from './clinicalService.js';

import { createReceivable, RECEIVABLE_ORIGIN_TYPE } from './receivablesService.js';

import { FINANCIAL_PAYMENT_METHOD } from './auditEventCatalog.js';

import { calcOptionFinalValue, calcPlannedValue } from '../components/clinical/budget/budgetUtils.js';

import { createFinancingFromApprovedBudget } from './clinicalBudgetFinancingIntegration.js';



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



/**

 * Cria contas a receber conforme opção de pagamento aceita no orçamento.

 * Financiamento é delegado ao módulo Financeiro > Financiamentos.

 */

export function createReceivablesFromApprovedBudget(user, appointmentId, patientId, budget) {

  if (!budget || budget.status !== BUDGET_STATUS.APROVADO) return [];

  const options = budget.paymentOptions || [];

  const accepted = options.find((o) => o.accepted);

  if (!accepted || !patientId) return [];



  if (accepted.type === 'financiamento') {

    return [];

  }



  const created = [];

  const original = calcPlannedValue(budget.procedures || []);

  const total = calcOptionFinalValue(accepted, original);

  const down = Number(accepted.downPayment || 0);

  const installments = Math.max(1, Number(accepted.installments || 1));

  const remainder = Math.max(0, total - down);

  const installmentValue = installments > 0 ? remainder / installments : remainder;

  const originId = budget.id || appointmentId;



  try {

    if (down > 0) {

      created.push(createReceivable(user, {

        patient_id: patientId,

        description: `Entrada — Orçamento ${originId}`,

        original_amount: down,

        origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,

        origin_id: originId,

        due_date: accepted.firstDueDate || new Date().toISOString().slice(0, 10),

        payment_method_expected: resolvePaymentMethod(accepted.method),

      }));

    }

    for (let i = 0; i < installments; i += 1) {

      const due = accepted.firstDueDate ? new Date(accepted.firstDueDate) : new Date();

      due.setMonth(due.getMonth() + i);

      created.push(createReceivable(user, {

        patient_id: patientId,

        description: `Parcela ${i + 1}/${installments} — Orçamento ${originId}`,

        original_amount: Number(installmentValue.toFixed(2)),

        origin_type: RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN,

        origin_id: originId,

        due_date: due.toISOString().slice(0, 10),

        payment_method_expected: resolvePaymentMethod(accepted.method),

      }));

    }

  } catch (err) {

    if (import.meta.env?.DEV) console.debug('createReceivablesFromApprovedBudget:', err);

  }

  return created;

}



/**

 * Processa integração financeira após aprovação do orçamento.

 */

export function processApprovedBudgetFinance(user, {

  appointmentId,

  patientId,

  patient,

  budget,

  professional,

}) {

  const accepted = (budget?.paymentOptions || []).find((o) => o.accepted);

  if (!accepted) {

    return { receivables: [], financing: null };

  }



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

  return { receivables, financing: null };

}

