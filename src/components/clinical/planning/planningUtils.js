import { formatCurrencyBRL } from '../../../utils/currency.js';

export const PLANNING_STAGE_OPTIONS = [
  { value: 'inicial', label: 'Inicial', tone: 'blue' },
  { value: 'intermediario', label: 'Intermediário', tone: 'amber' },
  { value: 'finalizacao', label: 'Finalização', tone: 'green' },
  { value: 'manutencao', label: 'Manutenção', tone: 'violet' },
];

export const REGION_TYPE_OPTIONS = [
  { value: 'tooth', label: 'Dente' },
  { value: 'arcada_superior', label: 'Arcada superior' },
  { value: 'arcada_inferior', label: 'Arcada inferior' },
  { value: 'quadrante', label: 'Quadrante' },
  { value: 'livre', label: 'Região livre' },
];

export const QUADRANT_OPTIONS = [
  { value: 'Q1', label: 'Q1 — Superior direito' },
  { value: 'Q2', label: 'Q2 — Superior esquerdo' },
  { value: 'Q3', label: 'Q3 — Inferior esquerdo' },
  { value: 'Q4', label: 'Q4 — Inferior direito' },
];

export function calcItemDiscount(item) {
  const qty = Number(item.quantity || 1);
  const unit = Number(item.unitValue || 0);
  const base = qty * unit;
  if (item.discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(item.discount || 0)));
    return base * (pct / 100);
  }
  return Math.min(base, Math.max(0, Number(item.discount || 0)));
}

export function calcItemTotal(item) {
  const qty = Number(item.quantity || 1);
  const unit = Number(item.unitValue || 0);
  return Math.max(0, qty * unit - calcItemDiscount(item));
}

export function formatPlanningMoney(value) {
  return formatCurrencyBRL(value);
}

export function getRegionDisplay(item) {
  const type = item.regionType || inferRegionType(item);
  if (type === 'arcada_superior') return 'Arcada superior';
  if (type === 'arcada_inferior') return 'Arcada inferior';
  if (type === 'quadrante') return item.region || item.tooth || 'Quadrante';
  if (type === 'tooth') return item.tooth ? `Dente ${item.tooth}` : '—';
  return item.region || item.tooth || '—';
}

function inferRegionType(item) {
  if (item.regionType) return item.regionType;
  if (item.tooth && /^Q[1-4]$/i.test(String(item.tooth))) return 'quadrante';
  if (item.tooth) return 'tooth';
  if (item.region?.toLowerCase().includes('superior')) return 'arcada_superior';
  if (item.region?.toLowerCase().includes('inferior')) return 'arcada_inferior';
  return item.region ? 'livre' : 'tooth';
}

export function buildPlanningSummary(items) {
  const count = items.length;
  const subtotal = items.reduce(
    (sum, p) => sum + Number(p.quantity || 1) * Number(p.unitValue || 0),
    0
  );
  const discounts = items.reduce((sum, p) => sum + calcItemDiscount(p), 0);
  const total = items.reduce((sum, p) => sum + calcItemTotal(p), 0);
  const average = count > 0 ? total / count : 0;
  return { count, subtotal, discounts, total, average };
}
