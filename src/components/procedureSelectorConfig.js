/** Filtros rápidos por especialidade (chips). */
export const QUICK_SPECIALTY_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'Clínica Geral', label: 'Clínica Geral' },
  { id: 'Ortodontia', label: 'Ortodontia' },
  { id: 'Implantodontia', label: 'Implantodontia' },
  { id: 'Prótese', label: 'Prótese' },
  { id: 'Cirurgia', label: 'Cirurgia' },
  { id: 'Endodontia', label: 'Endodontia' },
  { id: 'Periodontia', label: 'Periodontia' },
  { id: 'Odontopediatria', label: 'Odontopediatria' },
  { id: 'Estética', label: 'Estética' },
];

export const SORT_OPTIONS = [
  { value: 'usage', label: 'Mais utilizados' },
  { value: 'price_asc', label: 'Menor valor' },
  { value: 'price_desc', label: 'Maior valor' },
  { value: 'name', label: 'Ordem alfabética' },
];

export const LIST_TABS = [
  { id: 'all', label: 'Todos' },
  { id: 'favorites', label: 'Favoritos' },
  { id: 'recent', label: 'Recentes' },
  { id: 'popular', label: 'Mais utilizados' },
  { id: 'combos', label: 'Combos prontos' },
];

/** Combos: buscam procedimentos por palavras-chave no catálogo. */
export const PROCEDURE_COMBOS = [
  {
    id: 'protocolo-total-sup',
    label: 'Protocolo Total Superior',
    emoji: '🦷',
    description: 'Implantes, componentes e prótese protocolo',
    keywords: ['protocolo', 'implante', 'prótese', 'componente'],
  },
  {
    id: 'ortodontia-completo',
    label: 'Tratamento Ortodôntico Completo',
    emoji: '🦷',
    description: 'Documentação, instalação e manutenções',
    keywords: ['ortodont', 'documentação', 'instalação', 'manutenção', 'aparelho'],
  },
  {
    id: 'lente-resina',
    label: 'Lente em Resina',
    emoji: '🦷',
    description: 'Sequência estética padrão',
    keywords: ['lente', 'resina', 'estética', 'faceta'],
  },
];

const FAVORITES_KEY = 'loveodonto.procedureFavorites';
const RECENT_KEY = 'loveodonto.procedureRecent';
const USAGE_KEY = 'loveodonto.procedureUsage';

function storageKey(base, priceTableId) {
  return `${base}.${priceTableId || 'default'}`;
}

export function getFavoriteIds(priceTableId) {
  try {
    const raw = localStorage.getItem(storageKey(FAVORITES_KEY, priceTableId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(priceTableId, procedureId) {
  const ids = getFavoriteIds(priceTableId);
  const next = ids.includes(procedureId)
    ? ids.filter((id) => id !== procedureId)
    : [...ids, procedureId];
  localStorage.setItem(storageKey(FAVORITES_KEY, priceTableId), JSON.stringify(next));
  return next;
}

export function getRecentIds(priceTableId) {
  try {
    const raw = localStorage.getItem(storageKey(RECENT_KEY, priceTableId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function pushRecent(priceTableId, procedureIds) {
  const prev = getRecentIds(priceTableId);
  const merged = [...procedureIds, ...prev.filter((id) => !procedureIds.includes(id))].slice(0, 20);
  localStorage.setItem(storageKey(RECENT_KEY, priceTableId), JSON.stringify(merged));
}

export function getUsageCounts(priceTableId) {
  try {
    const raw = localStorage.getItem(storageKey(USAGE_KEY, priceTableId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordUsage(priceTableId, procedureIds) {
  const counts = getUsageCounts(priceTableId);
  procedureIds.forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });
  localStorage.setItem(storageKey(USAGE_KEY, priceTableId), JSON.stringify(counts));
}

export function resolveComboProcedures(combo, procedures) {
  const scored = procedures.map((proc) => {
    const hay = `${proc.title} ${proc.specialty} ${proc.internalCode || ''} ${proc.notes || ''}`.toLowerCase();
    const score = combo.keywords.reduce(
      (sum, kw) => (hay.includes(kw.toLowerCase()) ? sum + 1 : sum),
      0
    );
    return { proc, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((s) => s.proc);
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function getProcedureCode(proc) {
  return proc.internalCode || proc.tussCode || '—';
}

export function getEstimatedDuration(proc) {
  if (proc.durationMinutes) return `${proc.durationMinutes} min`;
  const notes = String(proc.notes || '').toLowerCase();
  const match = notes.match(/(\d+)\s*min/);
  if (match) return `${match[1]} min`;
  return '30 min';
}
