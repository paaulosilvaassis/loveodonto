/**
 * @module domain/contracts/runtime/contracts-v2-observability
 * @description Métricas Contracts V2 sem labels de alta cardinalidade — Phase 10.12.
 */

export const CONTRACTS_V2_METRIC_NAMES = [
  'contracts_v2_runtime_ready',
  'contracts_v2_runtime_not_ready_total',
  'contracts_v2_configuration_error_total',
  'contracts_v2_public_request_total',
  'contracts_v2_public_request_duration',
  'contracts_v2_public_rate_limited_total',
  'contracts_v2_public_access_denied_total',
  'contracts_v2_database_operation_total',
  'contracts_v2_database_error_total',
  'contracts_v2_transaction_rollback_total',
  'contracts_v2_storage_upload_total',
  'contracts_v2_storage_verification_failed_total',
  'contracts_v2_storage_reconciliation_required_total',
  'contracts_v2_signature_completed_total',
  'contracts_v2_signature_declined_total',
  'contracts_v2_signature_expired_total',
] as const;

export type ContractsV2MetricName = (typeof CONTRACTS_V2_METRIC_NAMES)[number];

export interface ContractsV2Metrics {
  gauge(name: ContractsV2MetricName, value: number, labels?: Record<string, string>): void;
  increment(name: ContractsV2MetricName, labels?: Record<string, string>): void;
  observe(name: ContractsV2MetricName, valueMs: number, labels?: Record<string, string>): void;
  snapshot(): Record<string, number>;
}

const ALLOWED_LABEL_KEYS = new Set([
  'operation',
  'result',
  'component',
  'mode',
  'status',
]);

function sanitizeLabels(labels?: Record<string, string>): Record<string, string> {
  if (!labels) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) {
    if (!ALLOWED_LABEL_KEYS.has(k)) continue;
    out[k] = String(v).slice(0, 64);
  }
  return out;
}

export function createInMemoryContractsV2Metrics(): ContractsV2Metrics {
  const counters = new Map<string, number>();
  const keyOf = (name: string, labels?: Record<string, string>) =>
    `${name}|${JSON.stringify(sanitizeLabels(labels))}`;

  return {
    gauge(name, value, labels) {
      counters.set(keyOf(name, labels), value);
    },
    increment(name, labels) {
      const k = keyOf(name, labels);
      counters.set(k, (counters.get(k) || 0) + 1);
    },
    observe(name, valueMs, labels) {
      const k = keyOf(name, { ...sanitizeLabels(labels), status: 'observed' });
      const prev = counters.get(k) || 0;
      counters.set(k, prev + valueMs);
      const countKey = keyOf(name, { ...sanitizeLabels(labels), status: 'count' });
      counters.set(countKey, (counters.get(countKey) || 0) + 1);
    },
    snapshot() {
      return Object.fromEntries(counters.entries());
    },
  };
}
