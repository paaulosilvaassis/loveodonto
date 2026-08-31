import { toCents, fromCents, splitInCents } from './receivableMoney.js';

const roundToCents = (value) => fromCents(toCents(value));

export const FINANCING_INTEREST_TYPES = {
  NONE: 'none',
  SIMPLE: 'simple',
  COMPOUND: 'compound',
  FIXED_PERCENT: 'fixed_percent',
};

export const FINANCING_FREQUENCIES = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  BIMONTHLY: 'bimonthly',
};

export const addFrequencyDate = (startIsoDate, index, frequency) => {
  if (!startIsoDate) return '';
  const date = new Date(`${startIsoDate}T12:00:00`);
  const i = Number(index || 0);
  if (frequency === FINANCING_FREQUENCIES.WEEKLY) {
    date.setDate(date.getDate() + i * 7);
  } else if (frequency === FINANCING_FREQUENCIES.BIWEEKLY) {
    date.setDate(date.getDate() + i * 14);
  } else if (frequency === FINANCING_FREQUENCIES.BIMONTHLY) {
    date.setMonth(date.getMonth() + i * 2);
  } else {
    date.setMonth(date.getMonth() + i);
  }
  return date.toISOString().slice(0, 10);
};

function percentOfCents(amountCents, rate) {
  return Math.round((amountCents * Number(rate || 0)) / 100);
}

export const calculateFinancingSummary = (payload) => {
  const totalCents = toCents(payload.total_amount);
  const entryCents = toCents(payload.entry_amount);
  const installmentsCount = Math.max(1, Number(payload.installments_count || 1));
  const interestType = payload.interest_type || FINANCING_INTEREST_TYPES.NONE;
  const interestRate = roundToCents(payload.interest_rate);
  const discountCents = toCents(payload.discount_amount);
  const adminFeeAmountInputCents = toCents(payload.admin_fee_amount);
  const adminFeeRate = roundToCents(payload.admin_fee_rate);

  if (totalCents <= 0) throw new Error('Valor total deve ser maior que zero.');
  if (entryCents < 0) throw new Error('Entrada não pode ser negativa.');
  if (entryCents > totalCents) throw new Error('Entrada não pode ser maior que o valor total.');
  if (interestRate < 0) throw new Error('Taxa de juros não pode ser negativa.');

  const financedCents = totalCents - entryCents;
  let interestCents = 0;
  if (interestType === FINANCING_INTEREST_TYPES.SIMPLE && financedCents > 0) {
    interestCents = Math.round((financedCents * (interestRate / 100)) * installmentsCount);
  } else if (interestType === FINANCING_INTEREST_TYPES.COMPOUND && financedCents > 0) {
    const compounded = financedCents * ((1 + (interestRate / 100)) ** installmentsCount);
    interestCents = Math.round(compounded - financedCents);
  } else if (interestType === FINANCING_INTEREST_TYPES.FIXED_PERCENT && financedCents > 0) {
    interestCents = percentOfCents(financedCents, interestRate);
  }

  const adminFeeCents = adminFeeAmountInputCents > 0
    ? adminFeeAmountInputCents
    : percentOfCents(financedCents, adminFeeRate);

  const netFinancedCents = financedCents + interestCents + adminFeeCents - discountCents;
  const totalPayableCents = entryCents + netFinancedCents;
  const installmentParts = splitInCents(fromCents(netFinancedCents), installmentsCount);

  return {
    totalAmount: fromCents(totalCents),
    entryAmount: fromCents(entryCents),
    financedAmount: fromCents(financedCents),
    installmentsCount,
    interestType,
    interestRate,
    totalInterest: fromCents(interestCents),
    adminFee: fromCents(adminFeeCents),
    adminFeeRate,
    adminFeeAmount: fromCents(adminFeeAmountInputCents),
    discountAmount: fromCents(discountCents),
    netFinancedAmount: fromCents(netFinancedCents),
    installmentAmount: installmentParts[0] || 0,
    installmentParts,
    totalPayableAmount: fromCents(totalPayableCents),
  };
};

export const buildInstallmentsSchedule = ({
  amountParts,
  firstDueDate,
  frequency,
}) => {
  const list = Array.isArray(amountParts) ? amountParts : [];
  return list.map((value, index) => ({
    installment_number: index + 1,
    due_date: addFrequencyDate(firstDueDate, index, frequency),
    original_amount: roundToCents(value),
  }));
};

export const normalizeFinancingFrequency = (value) => {
  if (!value) return FINANCING_FREQUENCIES.MONTHLY;
  const map = {
    semanal: FINANCING_FREQUENCIES.WEEKLY,
    quinzenal: FINANCING_FREQUENCIES.BIWEEKLY,
    mensal: FINANCING_FREQUENCIES.MONTHLY,
    bimestral: FINANCING_FREQUENCIES.BIMONTHLY,
    weekly: FINANCING_FREQUENCIES.WEEKLY,
    biweekly: FINANCING_FREQUENCIES.BIWEEKLY,
    monthly: FINANCING_FREQUENCIES.MONTHLY,
    bimonthly: FINANCING_FREQUENCIES.BIMONTHLY,
  };
  return map[value] || FINANCING_FREQUENCIES.MONTHLY;
};

export const isFinancingFrequencyInput = (value) => {
  if (!value) return true;
  const allowedInputs = new Set([
    'semanal',
    'quinzenal',
    'mensal',
    'bimestral',
    FINANCING_FREQUENCIES.WEEKLY,
    FINANCING_FREQUENCIES.BIWEEKLY,
    FINANCING_FREQUENCIES.MONTHLY,
    FINANCING_FREQUENCIES.BIMONTHLY,
  ]);
  return allowedInputs.has(value);
};

export { splitInCents };
