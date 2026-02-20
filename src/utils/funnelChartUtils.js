/**
 * Utilitário para métricas do funil de vendas.
 * Ordem fixa das etapas.
 */

const FUNNEL_STAGE_ORDER = [
  'novo_lead',
  'contato_realizado',
  'avaliacao_agendada',
  'avaliacao_realizada',
  'orcamento_apresentado',
  'em_negociacao',
  'aprovado',
  'em_tratamento',
  'finalizado',
  'perdido',
];

/**
 * Constrói array para o gráfico de funil.
 * @param {Array<{ stageKey: string, label: string, totalEtapa: number }>} stagesCounts - Contagens por etapa (ordem fixa)
 * @returns {Array<{ stageKey: string, stageLabel: string, total: number, convVsPrev: number, acumulado: number, color?: string }>}
 */
export function buildFunnelMetrics(stagesCounts) {
  if (!Array.isArray(stagesCounts) || stagesCounts.length === 0) return [];

  const totalPrimeira = stagesCounts[0]?.totalEtapa ?? 0;

  return stagesCounts.map((s, i) => {
    const total = s.totalEtapa ?? 0;
    const totalAnterior = i > 0 ? (stagesCounts[i - 1]?.totalEtapa ?? 0) : total;
    const convVsPrev =
      i === 0 ? 100 : totalAnterior > 0 ? Math.round((total / totalAnterior) * 1000) / 10 : 0;
    const acumulado =
      totalPrimeira > 0 ? Math.round((total / totalPrimeira) * 1000) / 10 : 0;

    return {
      stageKey: s.stageKey,
      stageLabel: s.label || s.stageKey,
      total,
      convVsPrev,
      acumulado,
      color: s.color,
    };
  });
}

export { FUNNEL_STAGE_ORDER };
