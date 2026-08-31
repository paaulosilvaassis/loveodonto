/**
 * PHASE 11.P — adapter PostgREST autenticado (supabase-js).
 * Reusa o client canônico da app. Sem chave privilegiada. Sem SQL MCP.
 */
import { STAGING_SQL_TABLE, normalizeFinancialV2Readback } from './financialV2StagingShadowPersist.js';
import {
  assertClientIsStagingOnly,
  assertMappedTenantMatchesSession,
  resolveTrustedSessionTenant,
  withTransportTimeout,
} from './financialV2ShadowTransport.js';

const INSERT_COLUMNS = {
  receivables: [
    'source_id', 'tenant_id', 'patient_id', 'origin_type', 'origin_id', 'installment_number',
    'total_installments', 'budget_id', 'financing_id', 'description', 'issue_date', 'due_date',
    'original_cents', 'discount_cents', 'interest_cents', 'fine_cents', 'total_cents', 'status',
    'payment_method_expected', 'canceled_at', 'canceled_reason', 'created_by_legacy',
  ],
  payments: [
    'source_id', 'tenant_id', 'receivable_id', 'operation_id', 'kind', 'status', 'amount_cents',
    'payment_method', 'paid_at', 'reverses_payment_id', 'reversed_at', 'reversal_reason', 'created_by_legacy',
  ],
  financings: [
    'source_id', 'tenant_id', 'patient_id', 'budget_id', 'status', 'total_cents', 'entry_cents',
    'interest_cents', 'fee_cents', 'discount_cents', 'total_payable_cents', 'installments_count',
    'approved_at', 'canceled_at', 'canceled_reason', 'created_by_legacy',
  ],
  charges: [
    'source_id', 'tenant_id', 'receivable_id', 'provider', 'provider_charge_id', 'operation_id',
    'status', 'amount_cents', 'created_by_legacy',
  ],
};

const LIFECYCLE_COLUMNS = {
  receivables: ['status', 'canceled_at', 'canceled_reason'],
  financings: ['status', 'approved_at', 'canceled_at', 'canceled_reason'],
  payments: ['status', 'reversed_at', 'reversal_reason'],
  charges: [],
};

function pick(row, keys) {
  const next = {};
  for (const key of keys) {
    if (row[key] !== undefined) next[key] = row[key];
  }
  return next;
}

function moneyConflict(table, existing, incoming) {
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

export function createFinancialV2SupabaseShadowTransport({ client, getSession } = {}) {
  if (!client || typeof client.from !== 'function') {
    throw new Error('FINANCIAL_V2_APP_RUNTIME_CLIENT_REQUIRED');
  }
  assertClientIsStagingOnly(client);

  async function loadSession() {
    if (typeof getSession === 'function') return getSession();
    if (!client.auth?.getSession) {
      const error = new Error('SESSION_MISSING');
      error.code = 'SESSION_MISSING';
      throw error;
    }
    const { data, error } = await client.auth.getSession();
    if (error) {
      const next = new Error('SESSION_INVALID');
      next.code = 'SESSION_INVALID';
      throw next;
    }
    return data?.session || null;
  }

  async function requireAuthContext(mapped) {
    const session = await loadSession();
    const trusted = resolveTrustedSessionTenant(session);
    assertMappedTenantMatchesSession(mapped, trusted.tenantId);
    return trusted;
  }

  async function selectRow(table, tenantId, sourceId) {
    const remote = STAGING_SQL_TABLE[table];
    const { data, error } = await client
      .from(remote)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('source_id', sourceId)
      .maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { code: error.code || 'SELECT_FAILED' });
    if (!data) return null;
    const entityType = table === 'receivables' ? 'receivable'
      : table === 'payments' ? 'payment'
        : table === 'financings' ? 'financing'
          : 'charge';
    return normalizeFinancialV2Readback(entityType, data);
  }

  async function persist({ table, mapped }) {
    const trusted = await requireAuthContext(mapped);
    const remote = STAGING_SQL_TABLE[table];
    if (!remote) throw new Error('UNKNOWN_V2_TABLE');
    const payload = {
      ...pick(mapped, INSERT_COLUMNS[table]),
      tenant_id: trusted.tenantId,
    };
    const work = (async () => {
      const existing = await selectRow(table, trusted.tenantId, payload.source_id);
      if (existing && moneyConflict(table, existing, payload)) {
        return existing;
      }
      if (!existing) {
        const { error } = await client
          .from(remote)
          .upsert(payload, { onConflict: 'tenant_id,source_id', ignoreDuplicates: true });
        if (error) throw Object.assign(new Error(error.message), { code: error.code || 'INSERT_FAILED' });
      }
      const lifecycleKeys = LIFECYCLE_COLUMNS[table] || [];
      if (lifecycleKeys.length) {
        const patch = pick(payload, lifecycleKeys);
        if (Object.keys(patch).length) {
          const { error } = await client
            .from(remote)
            .update(patch)
            .eq('tenant_id', trusted.tenantId)
            .eq('source_id', payload.source_id);
          if (error) throw Object.assign(new Error(error.message), { code: error.code || 'UPDATE_FAILED' });
        }
      }
      return selectRow(table, trusted.tenantId, payload.source_id);
    })();
    return withTransportTimeout(work);
  }

  return {
    kind: 'SUPABASE_JS_POSTGREST',
    persist,
    readBack: async ({ table, mapped }) => {
      const trusted = await requireAuthContext(mapped);
      return withTransportTimeout(selectRow(table, trusted.tenantId, mapped.source_id));
    },
    requireAuthContext,
  };
}
