export const FINANCIAL_STATUS = {
  trial: { label: 'Trial', tone: 'trial' },
  active: { label: 'Ativo', tone: 'active' },
  due_soon: { label: 'Vencendo', tone: 'due_soon' },
  due_today: { label: 'Vence hoje', tone: 'due_today' },
  overdue: { label: 'Atrasado', tone: 'overdue' },
  block_recommended: { label: 'Bloqueio recomendado', tone: 'block_recommended' },
  blocked: { label: 'Bloqueado', tone: 'blocked' },
};

export function formatCurrency(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
}

export function formatCurrencyCompact(cents) {
  const value = Number(cents || 0) / 100;
  if (value >= 1000) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }
  return formatCurrency(cents);
}

export function formatDate(value) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

export function formatDateTime(value) {
  if (!value) return '—';
  return String(value).replace('T', ' ').slice(0, 19);
}

export function formatMonthLabel(monthKey) {
  if (!monthKey) return '—';
  const [year, month] = String(monthKey).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

export function parseAmountToCents(raw) {
  const normalized = String(raw || '').replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export function getFinancialStatusMeta(status) {
  return FINANCIAL_STATUS[status] || { label: status || '—', tone: 'neutral' };
}
