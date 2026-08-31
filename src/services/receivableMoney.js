/**
 * Cálculo monetário canônico para CR/pagamento (storage continua FLOAT_BRL).
 * Não altera splitInCents do PATH B nem o schema de persistência.
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

export function assertFiniteMoney(value, label = 'valor') {
  const cents = toCents(value);
  if (!Number.isFinite(cents)) {
    throw new Error(`${label} inválido.`);
  }
  return cents;
}
