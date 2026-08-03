/**
 * @module domain-events/staging-activation/authorization-intake/stagingAuthorizationInputSchema
 */

export const AUTHORIZATION_INPUT_SOURCES = Object.freeze([
  'manual-form',
  'approved-json',
  'approved-document',
  'local-config',
] as const);

export const DANGEROUS_INPUT_KEYS = Object.freeze([
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'serviceRole',
  'service_role',
  'privateKey',
  'private_key',
  'cookie',
  'authorization',
  'connectionString',
  'connection_string',
  'anonKey',
  'anon_key',
] as const);

export const REQUIRED_EVIDENCE_ACK_TYPES = Object.freeze([
  'environment',
  'authorization',
  'tenants',
  'flag-baseline',
  'observability-metrics',
  'diagnostics',
  'health',
  'event-audit',
  'correlation',
  'causation',
  'rejected-events',
  'tenant-mismatch',
  'rollback',
  'manual-review',
] as const);

export const REQUIRED_RISK_IDS = Object.freeze([
  'rejected_events',
  'broken_correlation',
  'inconsistent_causation',
  'tenant_mismatch',
  'memory_growth',
  'process_local_metrics',
  'inmemory_loss',
  'wrong_host',
  'out_of_scope_activation',
  'manual_rollback_failure',
] as const);
