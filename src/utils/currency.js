export const formatCurrencyBRL = (value) => {
  const number = Number.isFinite(value) ? value : Number(value || 0);
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
};

export const parseCurrencyBRL = (value) => {
  if (value == null) return 0;
  const raw = String(value)
    .replace(/\s/g, '')
    .replace(/[R$r$]/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const applyCurrencyMaskBRL = (event) => {
  const input = event.target;
  const digits = input.value.replace(/\D/g, '');
  const cents = digits === '' ? 0 : parseInt(digits, 10);
  const number = cents / 100;
  input.value = formatCurrencyBRL(number);
};

