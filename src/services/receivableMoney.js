/**
 * Contrato canônico de cálculo monetário do Core Financeiro.
 * Storage permanece FLOAT_BRL. Matemática crítica ocorre em centavos inteiros.
 *
 * LEGACY_FLOAT_READ_POLICY = NORMALIZE_TO_CENTS_FOR_CALCULATION
 * ROUNDING_UNIT = 1 CENT
 * PATH split: resto de 1 centavo nas primeiras parcelas (mesmo contrato PATH B).
 */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

export function fromCents(cents) {
  if (!Number.isFinite(cents)) return 0;
  return cents / 100;
}

export function normalizeMoney(value) {
  return fromCents(toCents(value));
}

export function assertFiniteMoney(value, label = 'valor') {
  const cents = toCents(value);
  if (!Number.isFinite(cents)) {
    throw new Error(`${label} inválido.`);
  }
  return cents;
}

export function addCents(...values) {
  return values.reduce((sum, value) => sum + toCents(value), 0);
}

export function subtractCents(left, right) {
  return toCents(left) - toCents(right);
}

export function sumCents(values = []) {
  return (Array.isArray(values) ? values : []).reduce((sum, value) => sum + toCents(value), 0);
}

export function compareCents(left, right) {
  return toCents(left) - toCents(right);
}

export function isZeroCents(value) {
  return toCents(value) === 0;
}

export function clampNonNegativeCents(cents) {
  if (!Number.isFinite(cents)) return 0;
  return Math.max(0, cents);
}

/**
 * Divide um total em N partes de centavos.
 * As primeiras `remainder` parcelas recebem +1 centavo.
 * Ex.: 1000.00 / 3 → 333.34, 333.33, 333.33
 */
export function splitInCents(totalValue, parts) {
  const safeParts = Math.max(1, Number(parts || 1));
  const totalCents = toCents(totalValue);
  if (!Number.isFinite(totalCents)) {
    throw new Error('Valor inválido para rateio monetário.');
  }
  const base = Math.floor(totalCents / safeParts);
  const remainder = totalCents - base * safeParts;
  const result = [];
  for (let i = 0; i < safeParts; i += 1) {
    result.push(fromCents(base + (i < remainder ? 1 : 0)));
  }
  return result;
}

export function applyPercentDiscountCents(total, percent) {
  const totalCents = toCents(total);
  const pct = Number(percent || 0);
  if (!Number.isFinite(totalCents) || !Number.isFinite(pct)) {
    throw new Error('Desconto percentual inválido.');
  }
  const discountCents = Math.round((totalCents * pct) / 100);
  return {
    totalCents,
    discountCents,
    netCents: clampNonNegativeCents(totalCents - discountCents),
  };
}

export function netFromComponentsCents({
  original_amount = 0,
  discount_amount = 0,
  interest_amount = 0,
  fine_amount = 0,
} = {}) {
  return toCents(original_amount) - toCents(discount_amount) + toCents(interest_amount) + toCents(fine_amount);
}
