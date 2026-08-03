import { loadDb } from '../db/index.js';
import {
  listReceivables,
  RECEIVABLE_STATUS,
  RECEIVABLE_PAYMENT_METHODS,
  RECEIVABLE_ORIGIN_TYPE,
  getReceivablePayments,
} from './receivablesService.js';
import { listBoletoCharges, BOLETO_CHARGE_STATUS } from './boletoChargesService.js';
import { listFinancings } from './financingsService.js';
import { listFinancingInstallments } from './financingInstallmentsService.js';
import { listPatientContracts } from './contractModuleService.js';
import { listPatientBudgetHistory } from './clinicalBudgetLockService.js';
import { formatFriendlyBudgetNumber, formatFriendlyContractNumber, formatFriendlyFinancialNumber } from '../utils/friendlyNumbers.js';
import { formatCurrencyBRL } from '../utils/currency.js';

const TODAY = () => new Date().toISOString().slice(0, 10);

const OPEN_RECEIVABLE_STATUSES = new Set([
  RECEIVABLE_STATUS.PENDING,
  RECEIVABLE_STATUS.DUE_TODAY,
  RECEIVABLE_STATUS.UPCOMING,
  RECEIVABLE_STATUS.OVERDUE,
  RECEIVABLE_STATUS.PARTIALLY_PAID,
]);

const ORIGIN_LABELS = {
  [RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN]: 'Orçamento',
  [RECEIVABLE_ORIGIN_TYPE.CONTRACT]: 'Contrato',
  [RECEIVABLE_ORIGIN_TYPE.FINANCING]: 'Financiamento',
  [RECEIVABLE_ORIGIN_TYPE.MANUAL_ENTRY]: 'Lançamento manual',
  [RECEIVABLE_ORIGIN_TYPE.RENEGOTIATION]: 'Renegociação',
  [RECEIVABLE_ORIGIN_TYPE.RECURRING_CHARGE]: 'Cobrança recorrente',
};

function resolvePaymentMethodLabel(method) {
  return RECEIVABLE_PAYMENT_METHODS.find((m) => m.value === method)?.label || method || '—';
}

function buildFinancialOriginContext(patientId) {
  const budgets = [...listPatientBudgetHistory(patientId)].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  const budgetById = new Map();
  budgets.forEach((budget, index) => {
    const label = formatFriendlyBudgetNumber(budget.budgetNumber, index + 1);
    budgetById.set(budget.id, label);
    if (budget.appointmentId) budgetById.set(budget.appointmentId, label);
  });

  const contracts = [...listPatientContracts(patientId)].sort(
    (a, b) => new Date(a.generatedAt || a.createdAt || 0) - new Date(b.createdAt || 0),
  );
  const contractById = new Map();
  contracts.forEach((contract, index) => {
    contractById.set(contract.id, formatFriendlyContractNumber(contract.contractNumber, index + 1));
  });

  const financings = listFinancings({ patient_id: patientId });
  const financingById = new Map();
  financings.forEach((financing, index) => {
    financingById.set(financing.id, {
      label: formatFriendlyFinancialNumber(financing.financing_number || financing.number, index + 1),
      budgetId: financing.budget_id || null,
    });
  });

  return { budgetById, contractById, financingById, financings };
}

function resolveOriginDetail(recv, ctx) {
  if (recv.contract_id && ctx.contractById.has(recv.contract_id)) {
    return `Contrato ${ctx.contractById.get(recv.contract_id)}`;
  }
  if (recv.origin_type === RECEIVABLE_ORIGIN_TYPE.CONTRACT) {
    const contractId = recv.contract_id || recv.origin_id;
    if (contractId && ctx.contractById.has(contractId)) {
      return `Contrato ${ctx.contractById.get(contractId)}`;
    }
    return 'Contrato';
  }
  if (recv.financing_id && ctx.financingById.has(recv.financing_id)) {
    const fin = ctx.financingById.get(recv.financing_id);
    if (fin.budgetId && ctx.budgetById.has(fin.budgetId)) {
      return `Orçamento ${ctx.budgetById.get(fin.budgetId)}`;
    }
    return fin.label;
  }
  const originKeys = [recv.origin_id, recv.treatment_plan_id, recv.budget_id].filter(Boolean);
  for (const key of originKeys) {
    if (ctx.budgetById.has(key)) return `Orçamento ${ctx.budgetById.get(key)}`;
  }
  if (recv.origin_type === RECEIVABLE_ORIGIN_TYPE.TREATMENT_PLAN) return 'Orçamento';
  if (recv.origin_type === RECEIVABLE_ORIGIN_TYPE.FINANCING) return 'Financiamento';
  return ORIGIN_LABELS[recv.origin_type] || 'Lançamento manual';
}

function buildInstallmentLabel(installmentNumber, totalInstallments) {
  const num = Number(installmentNumber || 1);
  const total = Number(totalInstallments || 1);
  if (total <= 1) return 'Parcela única';
  return `Parcela ${num}/${total}`;
}

function getStatusCategory(status) {
  if (status === RECEIVABLE_STATUS.OVERDUE || status === BOLETO_CHARGE_STATUS.OVERDUE) return 'overdue';
  if (status === RECEIVABLE_STATUS.PAID || status === BOLETO_CHARGE_STATUS.PAID) return 'paid';
  if (
    status === RECEIVABLE_STATUS.CANCELED
    || status === BOLETO_CHARGE_STATUS.CANCELED
    || status === RECEIVABLE_STATUS.RENEGOTIATED
  ) return 'canceled';
  return 'open';
}

export function getCompactFinancialStatusLabel(status) {
  const category = getStatusCategory(status);
  if (category === 'overdue') return 'Vencido';
  if (category === 'paid') return 'Pago';
  if (category === 'canceled') return 'Cancelado';
  return 'Em aberto';
}

function buildReceivableDisplayItem(recv, ctx, boletos) {
  const linkedBoleto = boletos.find((b) => b.receivable_id === recv.id);
  const installmentLabel = buildInstallmentLabel(recv.installment_number, recv.total_installments);
  const originDetail = resolveOriginDetail(recv, ctx);
  const description = `${installmentLabel} — ${originDetail}`;
  const status = recv.status;

  return {
    id: recv.id,
    kind: 'receivable',
    dueDate: recv.due_date,
    installmentLabel,
    originDetail,
    description,
    origin: originDetail.replace(/^Orçamento |^Contrato /, ''),
    amount: Number(recv.net_amount || 0),
    remaining: Number(recv.remaining_amount || 0),
    status,
    statusCategory: getStatusCategory(status),
    statusLabel: getCompactFinancialStatusLabel(status),
    paymentMethod: resolvePaymentMethodLabel(recv.payment_method_expected),
    financingId: recv.financing_id || null,
    contractId: recv.contract_id || null,
    boletoUrl: linkedBoleto?.boleto_url || recv.boleto_url || '',
    boletoId: linkedBoleto?.id || null,
    receivableId: recv.id,
    searchText: `${installmentLabel} ${originDetail} ${resolvePaymentMethodLabel(recv.payment_method_expected)}`.toLowerCase(),
  };
}

function buildBoletoDisplayItem(boleto, ctx, financings) {
  const financing = financings.find((f) => f.id === boleto.financing_id);
  const installment = financing
    ? listFinancingInstallments({ financing_id: financing.id }).find((i) => i.id === boleto.installment_id)
    : null;
  const installmentLabel = installment
    ? buildInstallmentLabel(installment.installment_number, financing?.installments_count)
    : 'Boleto';
  let originDetail = 'Boleto';
  if (financing?.budget_id && ctx.budgetById.has(financing.budget_id)) {
    originDetail = `Orçamento ${ctx.budgetById.get(financing.budget_id)}`;
  } else if (boleto.financing_id && ctx.financingById.has(boleto.financing_id)) {
    originDetail = ctx.financingById.get(boleto.financing_id).label;
  }
  const status = isBoletoOverdue(boleto) ? BOLETO_CHARGE_STATUS.OVERDUE : boleto.status;

  return {
    id: boleto.id,
    kind: 'boleto',
    dueDate: boleto.due_date,
    installmentLabel,
    originDetail,
    description: `${installmentLabel} — ${originDetail}`,
    origin: originDetail.replace(/^Orçamento /, ''),
    amount: Number(boleto.amount || 0),
    remaining: Number(boleto.amount || 0),
    status,
    statusCategory: getStatusCategory(status),
    statusLabel: getCompactFinancialStatusLabel(status),
    paymentMethod: 'Boleto',
    financingId: boleto.financing_id || null,
    contractId: null,
    boletoUrl: boleto.boleto_url || '',
    boletoId: boleto.id,
    receivableId: boleto.receivable_id || null,
    searchText: `${installmentLabel} ${originDetail} boleto`.toLowerCase(),
  };
}

function isBoletoOverdue(boleto, today = TODAY()) {
  if (!boleto) return false;
  if (boleto.status === BOLETO_CHARGE_STATUS.PAID || boleto.status === BOLETO_CHARGE_STATUS.CANCELED) {
    return false;
  }
  return boleto.status === BOLETO_CHARGE_STATUS.OVERDUE
    || Boolean(boleto.due_date && boleto.due_date < today);
}

export function getPatientDelinquencyInfo(patientId) {
  if (!patientId) {
    return {
      isDelinquent: false,
      hasPending: false,
      overdueCount: 0,
      overdueTotal: 0,
      openCount: 0,
      openTotal: 0,
      statusLabel: 'Em dia',
      message: null,
    };
  }

  const receivables = listReceivables({ patientId });
  const boletos = listBoletoCharges({ patient_id: patientId });

  const overdueReceivables = receivables.filter((r) => r.status === RECEIVABLE_STATUS.OVERDUE);
  const overdueBoletos = boletos.filter((b) => isBoletoOverdue(b));
  const openReceivables = receivables.filter((r) => OPEN_RECEIVABLE_STATUSES.has(r.status));

  const overdueReceivableIds = new Set(overdueReceivables.map((r) => r.id));
  const boletoOnlyOverdue = overdueBoletos.filter(
    (b) => !b.receivable_id || !overdueReceivableIds.has(b.receivable_id),
  );

  const overdueCount = overdueReceivables.length + boletoOnlyOverdue.length;
  const overdueTotal = overdueReceivables.reduce(
    (sum, r) => sum + Number(r.remaining_amount ?? r.net_amount ?? 0),
    0,
  ) + boletoOnlyOverdue.reduce((sum, b) => sum + Number(b.amount || 0), 0);

  const openCount = openReceivables.length + overdueBoletos.filter((b) => !b.receivable_id).length;
  const openTotal = openReceivables.reduce((sum, r) => sum + Number(r.remaining_amount || 0), 0);

  const isDelinquent = overdueCount > 0;
  const hasPending = !isDelinquent && openCount > 0;

  let statusLabel = 'Em dia';
  if (isDelinquent) statusLabel = 'Inadimplente';
  else if (hasPending) statusLabel = 'Pendência financeira';

  return {
    isDelinquent,
    hasPending,
    overdueCount,
    overdueTotal,
    openCount,
    openTotal,
    statusLabel,
    message: isDelinquent
      ? `Este paciente possui ${overdueCount} parcela(s) vencida(s), totalizando ${formatCurrencyBRL(overdueTotal)}.`
      : null,
  };
}

export function getPatientFinancialSummary(patientId) {
  const receivables = listReceivables({ patientId });
  const boletos = listBoletoCharges({ patient_id: patientId });
  const delinquency = getPatientDelinquencyInfo(patientId);
  const ctx = buildFinancialOriginContext(patientId);

  const openItems = receivables.filter((r) => OPEN_RECEIVABLE_STATUSES.has(r.status));
  const paidItems = receivables.filter((r) => r.status === RECEIVABLE_STATUS.PAID);

  const totalOpen = openItems.reduce((sum, r) => sum + Number(r.remaining_amount || 0), 0);
  const totalOverdue = receivables
    .filter((r) => r.status === RECEIVABLE_STATUS.OVERDUE)
    .reduce((sum, r) => sum + Number(r.remaining_amount || 0), 0);
  const totalPaid = paidItems.reduce((sum, r) => sum + Number(r.net_amount || 0), 0);

  const nextDue = [...openItems]
    .filter((r) => r.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0];

  const items = receivables.map((recv) => buildReceivableDisplayItem(recv, ctx, boletos));

  for (const boleto of boletos) {
    if (boleto.receivable_id && items.some((item) => item.receivableId === boleto.receivable_id)) continue;
    items.push(buildBoletoDisplayItem(boleto, ctx, ctx.financings));
  }

  items.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));

  return {
    summary: {
      totalOpen,
      totalOverdue,
      totalPaid,
      nextDueDate: nextDue?.due_date || null,
      openInstallmentsCount: openItems.length,
      totalInstallmentsCount: items.length,
      overdueCount: delinquency.overdueCount,
      financialStatus: delinquency.statusLabel,
    },
    items,
    delinquency,
  };
}

export function buildPatientFinancialTimelineEvents(patientId) {
  if (!patientId) return [];

  const db = loadDb();
  const events = [];
  const receivables = listReceivables({ patientId });
  const boletos = listBoletoCharges({ patient_id: patientId });
  const financings = listFinancings({ patient_id: patientId });
  const contracts = listPatientContracts(patientId);
  const ctx = buildFinancialOriginContext(patientId);

  for (const recv of receivables) {
    const friendlyLabel = `${buildInstallmentLabel(recv.installment_number, recv.total_installments)} — ${resolveOriginDetail(recv, ctx)}`;
    events.push({
      id: `fin-recv-created-${recv.id}`,
      type: 'financeiro',
      date: recv.created_at || recv.due_date,
      timestamp: recv.created_at || recv.due_date,
      title: 'Parcela gerada',
      professionalName: '—',
      summary: `${friendlyLabel} — ${formatCurrencyBRL(recv.net_amount || 0)}`,
      actions: [{ key: 'finance', label: 'Ver financeiro' }],
    });

    if (recv.status === RECEIVABLE_STATUS.OVERDUE) {
      events.push({
        id: `fin-recv-overdue-${recv.id}`,
        type: 'financeiro',
        date: recv.due_date,
        timestamp: recv.due_date,
        title: 'Parcela vencida',
        professionalName: '—',
        summary: `${friendlyLabel} — ${formatCurrencyBRL(recv.remaining_amount || recv.net_amount || 0)}`,
        actions: [{ key: 'finance', label: 'Ver financeiro' }],
      });
    }

    const payments = getReceivablePayments(recv.id);
    for (const payment of payments) {
      events.push({
        id: `fin-pay-${payment.id}`,
        type: 'financeiro',
        date: payment.payment_date || payment.created_at,
        timestamp: payment.created_at || payment.payment_date,
        title: 'Pagamento recebido',
        professionalName: '—',
        summary: `${friendlyLabel} — ${formatCurrencyBRL(payment.amount || 0)}`,
        actions: [{ key: 'finance', label: 'Ver financeiro' }],
      });
    }
  }

  for (const boleto of boletos) {
    events.push({
      id: `fin-boleto-${boleto.id}`,
      type: 'financeiro',
      date: boleto.created_at || boleto.due_date,
      timestamp: boleto.created_at || boleto.due_date,
      title: 'Boleto gerado',
      professionalName: '—',
      summary: `${boleto.boleto_number || 'Boleto'} — ${formatCurrencyBRL(boleto.amount || 0)}`,
      actions: [{ key: 'finance', label: 'Ver financeiro' }],
    });
  }

  for (const financing of financings) {
    events.push({
      id: `fin-financing-${financing.id}`,
      type: 'financeiro',
      date: financing.created_at || financing.issue_date,
      timestamp: financing.created_at || financing.issue_date,
      title: 'Financiamento aprovado',
      professionalName: '—',
      summary: `${formatCurrencyBRL(financing.total_amount || 0)} — ${financing.installments_count || 0} parcela(s)`,
      actions: [{ key: 'finance', label: 'Ver financeiro' }],
    });
  }

  for (const evt of db.financingEvents || []) {
    const financing = financings.find((f) => f.id === evt.financing_id);
    if (!financing) continue;
    if (String(evt.event_type || '').includes('renegotiat')) {
      events.push({
        id: `fin-reneg-${evt.id}`,
        type: 'financeiro',
        date: evt.created_at,
        timestamp: evt.created_at,
        title: 'Renegociação feita',
        professionalName: '—',
        summary: evt.description || 'Financiamento renegociado',
        actions: [{ key: 'finance', label: 'Ver financeiro' }],
      });
    }
  }

  for (const contract of contracts) {
    if (String(contract.status || '').toLowerCase().includes('cancel')) {
      events.push({
        id: `fin-contract-cancel-${contract.id}`,
        type: 'financeiro',
        date: contract.canceledAt || contract.updatedAt,
        timestamp: contract.canceledAt || contract.updatedAt,
        title: 'Contrato cancelado',
        professionalName: '—',
        summary: contract.title || formatFriendlyContractNumber(contract.contractNumber, 1) || 'Contrato',
        actions: [{ key: 'contract', label: 'Ver contrato' }],
      });
    }
  }

  for (const installment of listFinancingInstallments({})) {
    if (!financings.some((f) => f.id === installment.financing_id)) continue;
    events.push({
      id: `fin-installment-${installment.id}`,
      type: 'financeiro',
      date: installment.due_date || installment.created_at,
      timestamp: installment.created_at || installment.due_date,
      title: 'Parcela de financiamento',
      professionalName: '—',
      summary: `Parcela ${installment.number || '—'} — ${formatCurrencyBRL(installment.amount || 0)}`,
      actions: [{ key: 'finance', label: 'Ver financeiro' }],
    });
  }

  return events;
}

export function buildFinanceNavigationUrl(patientId, { tab = 'receivables', receivableId } = {}) {
  const params = new URLSearchParams();
  if (patientId) params.set('patientId', patientId);
  if (receivableId) params.set('receivableId', receivableId);
  const query = params.toString();

  if (tab === 'boletos') return `/financeiro/boletos${query ? `?${query}` : ''}`;
  if (tab === 'financing') return `/financeiro/financiamento${query ? `?${query}` : ''}`;
  return `/financeiro/contas-receber${query ? `?${query}` : ''}`;
}
