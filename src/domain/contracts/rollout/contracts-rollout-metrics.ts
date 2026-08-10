/**
 * @module domain/contracts/rollout/contracts-rollout-metrics
 * @description Métricas locais de observabilidade do rollout (Phase 10.20).
 * Sem serviço externo obrigatório. Sem PII nos eventos.
 */

export const CONTRACTS_ROLLOUT_METRIC_EVENTS = [
  'wizard_opened',
  'wizard_completed',
  'wizard_go_to_queue',
  'contract_generate_clicked',
  'contract_continue_clicked',
  'queue_search',
  'queue_filter',
  'signature_link_generated',
  'public_sign_opened',
  'public_sign_completed',
  'public_sign_failed',
  'rollback_triggered',
  'mode_changed',
  'pendency_viewed',
] as const;

export type ContractsRolloutMetricEvent = (typeof CONTRACTS_ROLLOUT_METRIC_EVENTS)[number];

export interface ContractsRolloutMetricCounters {
  since: string;
  counts: Record<string, number>;
  lastEventAt: string | null;
  lastEvent: string | null;
}

export function createEmptyMetricCounters(now = new Date().toISOString()): ContractsRolloutMetricCounters {
  const counts: Record<string, number> = {};
  for (const key of CONTRACTS_ROLLOUT_METRIC_EVENTS) counts[key] = 0;
  return { since: now, counts, lastEventAt: null, lastEvent: null };
}

export function incrementMetric(
  counters: ContractsRolloutMetricCounters,
  event: ContractsRolloutMetricEvent | string,
  amount = 1,
): ContractsRolloutMetricCounters {
  const next = {
    ...counters,
    counts: { ...counters.counts },
  };
  const key = String(event || 'unknown');
  next.counts[key] = Number(next.counts[key] || 0) + amount;
  next.lastEvent = key;
  next.lastEventAt = new Date().toISOString();
  return next;
}

/** Snapshot seguro para painel — sem tokens, sem PII. */
export function summarizeMetrics(counters: ContractsRolloutMetricCounters | null | undefined) {
  const c = counters || createEmptyMetricCounters();
  const counts = c.counts || {};
  const opened = Number(counts.wizard_opened || 0);
  const completed = Number(counts.wizard_completed || 0);
  const publicOpened = Number(counts.public_sign_opened || 0);
  const publicDone = Number(counts.public_sign_completed || 0);
  const publicFail = Number(counts.public_sign_failed || 0);
  return {
    since: c.since,
    lastEvent: c.lastEvent,
    lastEventAt: c.lastEventAt,
    wizardOpened: opened,
    wizardCompleted: completed,
    wizardCompletionRate: opened > 0 ? Math.round((completed / opened) * 100) : null,
    queueSearches: Number(counts.queue_search || 0),
    signatureLinksGenerated: Number(counts.signature_link_generated || 0),
    publicSignOpened: publicOpened,
    publicSignCompleted: publicDone,
    publicSignFailed: publicFail,
    publicSuccessRate: publicOpened > 0 ? Math.round((publicDone / publicOpened) * 100) : null,
    rollbacks: Number(counts.rollback_triggered || 0),
    modeChanges: Number(counts.mode_changed || 0),
  };
}

/** Alertas simples derivados — limiares conservadores para piloto. */
export function deriveMetricAlerts(summary: ReturnType<typeof summarizeMetrics>) {
  const alerts: Array<{ level: 'info' | 'warning' | 'critical'; message: string }> = [];
  if ((summary.rollbacks || 0) > 0) {
    alerts.push({
      level: 'warning',
      message: 'Houve rollback operacional registrado. Investigar causa antes de ampliar allowlist.',
    });
  }
  if (summary.publicSignOpened >= 5 && (summary.publicSuccessRate ?? 100) < 70) {
    alerts.push({
      level: 'critical',
      message: 'Taxa de conclusão da assinatura pública abaixo de 70%. Pausar expansão do tenant.',
    });
  }
  if (summary.wizardOpened >= 10 && (summary.wizardCompletionRate ?? 100) < 50) {
    alerts.push({
      level: 'warning',
      message: 'Muitos wizards abertos sem conclusão. Revisar fricção de UX no tenant.',
    });
  }
  if (!alerts.length) {
    alerts.push({ level: 'info', message: 'Sem alertas críticos no momento.' });
  }
  return alerts;
}
