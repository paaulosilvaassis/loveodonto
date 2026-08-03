const toNumber = (value) => Number(value || 0);

const roundToCents = (value) => Math.round(toNumber(value) * 100) / 100;

const splitInCents = (totalValue, parts) => {
  const safeParts = Math.max(1, Number(parts || 1));
  const totalCents = Math.round(roundToCents(totalValue) * 100);
  const base = Math.floor(totalCents / safeParts);
  const remainder = totalCents - base * safeParts;
  const result = [];
  for (let i = 0; i < safeParts; i += 1) {
    result.push((base + (i < remainder ? 1 : 0)) / 100);
  }
  return result;
};

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

export const calculateFinancingSummary = (payload) => {
  const totalAmount = roundToCents(payload.total_amount);
  const entryAmount = roundToCents(payload.entry_amount);
  const installmentsCount = Math.max(1, Number(payload.installments_count || 1));
  const interestType = payload.interest_type || FINANCING_INTEREST_TYPES.NONE;
  const interestRate = roundToCents(payload.interest_rate);
  const discountAmount = roundToCents(payload.discount_amount);
  const adminFeeAmountInput = roundToCents(payload.admin_fee_amount);
  const adminFeeRate = roundToCents(payload.admin_fee_rate);

  if (totalAmount <= 0) throw new Error('Valor total deve ser maior que zero.');
  if (entryAmount < 0) throw new Error('Entrada não pode ser negativa.');
  if (entryAmount > totalAmount) throw new Error('Entrada não pode ser maior que o valor total.');
  if (interestRate < 0) throw new Error('Taxa de juros não pode ser negativa.');

  const financedAmount = roundToCents(totalAmount - entryAmount);
  let totalInterest = 0;
  if (interestType === FINANCING_INTEREST_TYPES.SIMPLE && financedAmount > 0) {
    totalInterest = roundToCents((financedAmount * (interestRate / 100)) * installmentsCount);
  } else if (interestType === FINANCING_INTEREST_TYPES.COMPOUND && financedAmount > 0) {
    const compounded = financedAmount * ((1 + (interestRate / 100)) ** installmentsCount);
    totalInterest = roundToCents(compounded - financedAmount);
  } else if (interestType === FINANCING_INTEREST_TYPES.FIXED_PERCENT && financedAmount > 0) {
    totalInterest = roundToCents(financedAmount * (interestRate / 100));
  }

  const adminFee = adminFeeAmountInput > 0
    ? adminFeeAmountInput
    : roundToCents(financedAmount * (adminFeeRate / 100));

  const netFinancedAmount = roundToCents(financedAmount + totalInterest + adminFee - discountAmount);
  const totalPayableAmount = roundToCents(entryAmount + netFinancedAmount);
  const installmentParts = splitInCents(netFinancedAmount, installmentsCount);
  const installmentAmount = installmentParts[0] || 0;

  return {
    totalAmount,
    entryAmount,
    financedAmount,
    installmentsCount,
    interestType,
    interestRate,
    totalInterest,
    adminFee,
    adminFeeRate,
    adminFeeAmount: adminFeeAmountInput,
    discountAmount,
    netFinancedAmount,
    installmentAmount,
    installmentParts,
    totalPayableAmount,
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
