/**
 * Tabs horizontais para navegação por status da Base de Suporte.
 */
export const SUPPORT_TAB_KEYS = {
  PENDENTES: 'pendentes',
  CONCLUIDOS: 'concluidos',
  CANCELADOS: 'cancelados',
  AVALIACOES: 'avaliacoes',
};

const TAB_LABELS = {
  [SUPPORT_TAB_KEYS.PENDENTES]: 'Pendentes',
  [SUPPORT_TAB_KEYS.CONCLUIDOS]: 'Concluídos',
  [SUPPORT_TAB_KEYS.CANCELADOS]: 'Cancelados',
  [SUPPORT_TAB_KEYS.AVALIACOES]: 'Avaliações',
};

export default function SupportTabs({ activeTab, counts, onChange, className = '' }) {
  const tabs = [
    { key: SUPPORT_TAB_KEYS.PENDENTES, count: counts.pendentes ?? 0 },
    { key: SUPPORT_TAB_KEYS.CONCLUIDOS, count: counts.concluidos ?? 0 },
    { key: SUPPORT_TAB_KEYS.CANCELADOS, count: counts.cancelados ?? 0 },
    { key: SUPPORT_TAB_KEYS.AVALIACOES, count: counts.avaliacoes ?? 0 },
  ];

  return (
    <div className={`support-tabs ${className}`.trim()} role="tablist">
      {tabs.map(({ key, count }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={activeTab === key}
          aria-controls={`support-panel-${key}`}
          id={`support-tab-${key}`}
          className={`support-tabs-tab ${activeTab === key ? 'active' : ''}`}
          onClick={() => onChange(key)}
        >
          {TAB_LABELS[key]} ({count})
        </button>
      ))}
    </div>
  );
}
