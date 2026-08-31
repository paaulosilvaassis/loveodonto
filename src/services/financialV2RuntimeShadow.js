/**
 * PHASE 11.M — runtime V2 shadow após writer canônico.
 * Non-authoritative. Default OFF. Allowlist fail-closed. Staging only.
 */
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  isFinancialV2TenantId,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { FINANCIAL_REPOSITORY_FLAG_DEFAULTS } from '../repositories/financial/financialRepositoryFlags.ts';
import { peekDb } from '../db/index.js';
import {
  PHASE_11M_DEFAULT_ALLOWLIST,
  PHASE_11M_SOURCE_PREFIX,
  PHASE_11M_TENANT_A,
} from './financialV2Phase11mFixtures.js';
import {
  compareStagingReadback,
  buildFinancialV2InsertSql,
  buildFinancialV2SelectSql,
} from './financialV2StagingShadowPersist.js';
import { buildFinancialV2LifecycleUpdateSql } from './financialV2AuthenticatedSql.js';
import {
  SHADOW_WRITE_DECISION,
  createMemoryFinancialV2Store,
  registerFinancialV2RuntimeShadowEnqueue,
  shadowWriteFinancialRecord,
} from './financialV2ShadowWrite.js';

export const PHASE_11M_GATE = 'FINANCIAL_V2_APP_WRITER_SHADOW_WIRING_VALIDATED';
export const FINANCIAL_V2_RUNTIME_SHADOW_FLAG = 'FINANCIAL_V2_RUNTIME_SHADOW';

export const PHASE_11M_RUNTIME = {
  TARGET_DB_ENVIRONMENT: 'STAGING',
  SHADOW_TARGET_PROJECT_REF: STAGING_SUPABASE_PROJECT_REF,
  V2_RUNTIME_SHADOW_FLAG: FINANCIAL_V2_RUNTIME_SHADOW_FLAG,
  V2_RUNTIME_SHADOW_DEFAULT: false,
  APP_WRITERS_STAGING_WIRED: true,
  SHADOW_NON_AUTHORITATIVE: true,
  TENANT_ALLOWLIST_MODE: 'EXPLICIT_FAIL_CLOSED',
  DUAL_WRITE_ENABLED: false,
  FINANCIAL_SERVER_READ_ENABLED: false,
  FINANCIAL_SERVER_WRITE_ENABLED: false,
  FINANCIAL_SERVER_WRITE_AUTHORITY: false,
  TENANT_CUTOVER: false,
  PRODUCTION_DATABASE_CHANGED: false,
  BACKFILL_APPLIED: false,
  HISTORICAL_SHADOW_SCAN: false,
  REAL_USER_RUNTIME_SHADOW: false,
  SYNTHETIC_PREFIX: PHASE_11M_SOURCE_PREFIX,
  SHADOW_OPERATIONAL_AUTH: 'TENANT_SCOPED',
};

export const RUNTIME_SHADOW_RESULT = {
  MATCH: 'MATCH',
  MISMATCH: 'MISMATCH',
  NOT_COMPARABLE: 'NOT_COMPARABLE',
  QUARANTINED: 'QUARANTINED',
  WRITE_FAILED: 'WRITE_FAILED',
  DISABLED: 'DISABLED',
};

const ENTITY_TABLE = {
  receivable: 'receivables',
  payment: 'payments',
  financing: 'financings',
  charge: 'charges',
};

const state = {
  enabled: false,
  allowlist: [],
  projectRef: '',
  executor: null,
  store: createImmutableAwareFinancialV2Store(),
  telemetry: [],
  chain: Promise.resolve(),
};

function emptyCounters() {
  const zero = () => ({
    attempted: 0, match: 0, mismatch: 0, not_comparable: 0, quarantined: 0, write_failed: 0, disabled: 0,
  });
  return {
    receivable: zero(), payment: zero(), financing: zero(), charge: zero(),
  };
}

state.counters = emptyCounters();

function bump(entityType, key) {
  const bag = state.counters[entityType] || state.counters.receivable;
  bag.attempted += 1;
  bag[key] += 1;
}

function pushTelemetry(entry) {
  state.telemetry.push({
    tenant_id: entry.tenant_id || null,
    entity_type: entry.entity_type,
    source_id: entry.source_id || null,
    operation: entry.operation,
    result: entry.result,
    reason_code: entry.reason_code || null,
    duration_ms: entry.duration_ms ?? 0,
    timestamp: entry.timestamp || new Date().toISOString(),
  });
}

export function assertRuntimeShadowEnvironmentAllowed(projectRef) {
  if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_RUNTIME_SHADOW_PRODUCTION_FORBIDDEN');
  }
  if (!projectRef) throw new Error('FINANCIAL_V2_RUNTIME_SHADOW_ENV_REQUIRED');
  if (String(projectRef) !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_RUNTIME_SHADOW_UNKNOWN_TARGET');
  }
  return true;
}

export function parseFinancialV2ShadowAllowlist(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parseFinancialV2ShadowAllowlist(parsed);
  } catch {
    /* csv */
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function resolveRuntimeShadowDecision({ record, projectRef, enabled, allowlist } = {}) {
  const ref = projectRef ?? state.projectRef;
  if (String(ref || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
    return { result: RUNTIME_SHADOW_RESULT.DISABLED, reason_code: 'PRODUCTION_FORBIDDEN' };
  }
  if (ref && String(ref) !== STAGING_SUPABASE_PROJECT_REF) {
    return { result: RUNTIME_SHADOW_RESULT.DISABLED, reason_code: 'UNKNOWN_TARGET' };
  }
  if (!ref) {
    return { result: RUNTIME_SHADOW_RESULT.DISABLED, reason_code: 'MISSING_TARGET' };
  }
  const on = enabled ?? state.enabled;
  if (!on) return { result: RUNTIME_SHADOW_RESULT.DISABLED, reason_code: 'FLAG_OFF' };
  const list = allowlist ?? state.allowlist;
  if (!Array.isArray(list) || list.length === 0) {
    return { result: RUNTIME_SHADOW_RESULT.DISABLED, reason_code: 'ALLOWLIST_MISSING' };
  }
  if (list.includes('*') || list.includes('all')) {
    return { result: RUNTIME_SHADOW_RESULT.DISABLED, reason_code: 'ALLOWLIST_ALL_FORBIDDEN' };
  }
  const tenantId = record?.tenant_id || record?.tenantId;
  if (!isFinancialV2TenantId(tenantId)) {
    return { result: RUNTIME_SHADOW_RESULT.QUARANTINED, reason_code: 'TENANT_NOT_UUID' };
  }
  if (!list.includes(String(tenantId))) {
    return { result: RUNTIME_SHADOW_RESULT.DISABLED, reason_code: 'ALLOWLIST_DENIED' };
  }
  return { result: 'ALLOWED', tenant_id: tenantId };
}

export function isFinancialV2RuntimeShadowEnabled() {
  return state.enabled === true;
}

export function __setFinancialV2RuntimeShadowForTest({
  enabled = false,
  allowlist = PHASE_11M_DEFAULT_ALLOWLIST,
  projectRef = STAGING_SUPABASE_PROJECT_REF,
  executor = null,
} = {}) {
  state.enabled = Boolean(enabled);
  state.allowlist = parseFinancialV2ShadowAllowlist(allowlist);
  state.projectRef = projectRef || '';
  state.executor = executor;
  state.store = createImmutableAwareFinancialV2Store();
}

export function __resetFinancialV2RuntimeShadowForTest() {
  state.enabled = false;
  state.allowlist = [];
  state.projectRef = '';
  state.executor = null;
  state.store = createImmutableAwareFinancialV2Store();
  state.telemetry = [];
  state.counters = emptyCounters();
  state.chain = Promise.resolve();
}

export function getRuntimeShadowTelemetry() {
  return state.telemetry.slice();
}

export function getRuntimeShadowCounters() {
  return JSON.parse(JSON.stringify(state.counters));
}

export function __getFinancialV2RuntimeStoreForTest() {
  return state.store;
}

export function createTenantScopedRuntimeExecutor({ bags = state.store, fail } = {}) {
  return async (sql) => {
    if (typeof fail === 'function') fail(sql);
    const text = String(sql);
    if (text.startsWith('SELECT')) {
      const source = text.match(/source_id = '([^']+)'/)?.[1];
      const tenant = text.match(/tenant_id = '([^']+)'::uuid/)?.[1];
      const table = Object.keys(bags.bags).find((name) => text.includes(`financial_v2_${name}`));
      const row = table ? bags.get(table, tenant, source) : null;
      return row ? [row] : [];
    }
    return [];
  };
}

function factsConflict(existing, incoming, table) {
  if (!existing) return false;
  if (table === 'payments') {
    return Number(existing.amount_cents) !== Number(incoming.amount_cents)
      || String(existing.kind) !== String(incoming.kind)
      || String(existing.operation_id) !== String(incoming.operation_id)
      || String(existing.receivable_id) !== String(incoming.receivable_id);
  }
  if (table === 'receivables') {
    return Number(existing.total_cents) !== Number(incoming.total_cents)
      || Number(existing.original_cents) !== Number(incoming.original_cents);
  }
  if (table === 'financings') {
    return Number(existing.total_cents) !== Number(incoming.total_cents);
  }
  return false;
}

export function createImmutableAwareFinancialV2Store() {
  const memory = createMemoryFinancialV2Store();
  return {
    bags: memory.bags,
    get: memory.get.bind(memory),
    upsert(table, row) {
      const existing = memory.get(table, row.tenant_id, row.source_id);
      if (existing && factsConflict(existing, row, table)) {
        const error = new Error('IMMUTABLE_FACT_CONFLICT');
        error.code = 'IMMUTABLE_FACT_CONFLICT';
        throw error;
      }
      if (existing) {
        existing.status = row.status ?? existing.status;
        if (row.approved_at) existing.approved_at = row.approved_at;
        return { replayed: true, row: existing };
      }
      return memory.upsert(table, row);
    },
  };
}

export async function persistRuntimeShadowRow({ table, mapped, executor = state.executor, store = state.store }) {
  if (executor) {
    await executor(buildFinancialV2InsertSql(table, mapped));
    let rows = await executor(buildFinancialV2SelectSql(table, mapped.tenant_id, mapped.source_id));
    let readback = (Array.isArray(rows) ? rows[0] : rows) || null;
    if (readback && factsConflict(readback, mapped, table)) {
      return readback;
    }
    const updateSql = buildFinancialV2LifecycleUpdateSql(table, mapped);
    if (updateSql && readback) {
      await executor(updateSql);
      rows = await executor(buildFinancialV2SelectSql(table, mapped.tenant_id, mapped.source_id));
      readback = (Array.isArray(rows) ? rows[0] : rows) || readback;
    }
    return readback || mapped;
  }
  const persisted = store.upsert(table, mapped);
  return persisted.row;
}

export async function runFinancialV2RuntimeShadow({ entityType, record }) {
  const started = Date.now();
  const gate = resolveRuntimeShadowDecision({ record });
  const sourceId = record?.id || null;
  const tenantId = record?.tenant_id || record?.tenantId || null;
  const finish = (result, reason_code, extra = {}) => {
    const key = result === RUNTIME_SHADOW_RESULT.MATCH ? 'match'
      : result === RUNTIME_SHADOW_RESULT.MISMATCH ? 'mismatch'
        : result === RUNTIME_SHADOW_RESULT.NOT_COMPARABLE ? 'not_comparable'
          : result === RUNTIME_SHADOW_RESULT.QUARANTINED ? 'quarantined'
            : result === RUNTIME_SHADOW_RESULT.WRITE_FAILED ? 'write_failed'
              : 'disabled';
    bump(entityType, key);
    pushTelemetry({
      tenant_id: tenantId,
      entity_type: entityType,
      source_id: sourceId,
      operation: 'runtime_shadow',
      result,
      reason_code,
      duration_ms: Date.now() - started,
    });
    return { result, reason_code, ...extra };
  };
  if (gate.result !== 'ALLOWED') {
    return finish(gate.result, gate.reason_code);
  }
  try {
    const mappedResult = shadowWriteFinancialRecord({
      entityType,
      record,
      db: peekDb(),
      store: state.store,
      enabled: true,
      projectRef: STAGING_SUPABASE_PROJECT_REF,
      fabricateDependencies: false,
    });
    if (mappedResult.decision === SHADOW_WRITE_DECISION.QUARANTINED) {
      return finish(RUNTIME_SHADOW_RESULT.QUARANTINED, mappedResult.reason_code);
    }
    if (mappedResult.decision === SHADOW_WRITE_DECISION.FAILED) {
      return finish(RUNTIME_SHADOW_RESULT.WRITE_FAILED, mappedResult.error);
    }
    if (mappedResult.decision === SHADOW_WRITE_DECISION.SKIPPED_PRODUCTION_GUARD) {
      return finish(RUNTIME_SHADOW_RESULT.DISABLED, 'PRODUCTION_FORBIDDEN');
    }
    const table = ENTITY_TABLE[entityType];
    const readback = await persistRuntimeShadowRow({
      table,
      mapped: mappedResult.mapped,
      executor: state.executor,
      store: state.store,
    });
    const comparison = compareStagingReadback({
      entityType,
      legacy: record,
      readback,
      eligibility: mappedResult.eligibility,
    });
    return finish(comparison.result, comparison.reason_code, { comparison, mapped: mappedResult.mapped, readback });
  } catch (error) {
    const code = error?.code || (error instanceof Error ? error.message : 'WRITE_FAILED');
    return finish(RUNTIME_SHADOW_RESULT.WRITE_FAILED, code);
  }
}

export function enqueueFinancialV2RuntimeShadow({ entityType, record }) {
  if (!state.enabled) return;
  state.chain = state.chain.then(() => runFinancialV2RuntimeShadow({ entityType, record })).catch(() => {});
}

export function __flushFinancialV2RuntimeShadowForTest() {
  return state.chain;
}

export function assertV3FlagsRemainOffForRuntimeShadow(flags = FINANCIAL_REPOSITORY_FLAG_DEFAULTS) {
  return Object.values(flags).every((value) => value === false);
}

export { PHASE_11M_DEFAULT_ALLOWLIST, PHASE_11M_SOURCE_PREFIX, PHASE_11M_TENANT_A };

registerFinancialV2RuntimeShadowEnqueue(enqueueFinancialV2RuntimeShadow);
