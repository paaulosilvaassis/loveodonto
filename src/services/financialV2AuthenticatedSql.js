/**
 * PHASE 11.O — SQL autenticado tenant-scoped + lifecycle update (money imutável).
 */
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  isFinancialV2TenantId,
} from '../contracts/financialV2RemoteSchemaContract.js';
import { STAGING_SQL_TABLE } from './financialV2StagingShadowPersist.js';

export function assertPilotEnvironmentAllowed(projectRef) {
  if (String(projectRef || '') === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_PILOT_PRODUCTION_FORBIDDEN');
  }
  if (!projectRef) throw new Error('FINANCIAL_V2_PILOT_ENV_REQUIRED');
  if (String(projectRef) !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error('FINANCIAL_V2_PILOT_UNKNOWN_TARGET');
  }
  return true;
}

function sqlText(value) {
  if (value == null) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlUuid(value) {
  if (!isFinancialV2TenantId(value)) throw new Error('FINANCIAL_V2_PILOT_TENANT_NOT_UUID');
  return `${sqlText(value)}::uuid`;
}

function sqlTs(value) {
  if (!value) return 'NULL';
  return `${sqlText(value)}::timestamptz`;
}

export function buildAuthenticatedJwtClaims({ userId, tenantId }) {
  return {
    sub: userId,
    role: 'authenticated',
    tenant_id: tenantId,
    app_metadata: { tenant_id: tenantId },
  };
}

export function wrapAuthenticatedTenantSql(sql, { userId, tenantId }) {
  if (!userId || !tenantId) throw new Error('FINANCIAL_V2_PILOT_AUTH_CLAIMS_REQUIRED');
  const claims = JSON.stringify(buildAuthenticatedJwtClaims({ userId, tenantId })).replace(/'/g, "''");
  return [
    `SELECT set_config('request.jwt.claim.sub', ${sqlText(userId)}, true)`,
    `SELECT set_config('request.jwt.claim.role', 'authenticated', true)`,
    `SELECT set_config('request.jwt.claim.tenant_id', ${sqlText(tenantId)}, true)`,
    `SELECT set_config('request.jwt.claims', '${claims}', true)`,
    'SET LOCAL ROLE authenticated',
    String(sql || '').trim(),
  ].join(';\n');
}

export function isServiceRoleSql(sql) {
  return /service_role|bypassrls/i.test(String(sql || ''));
}

export function buildFinancialV2LifecycleUpdateSql(table, row) {
  const qualified = `public.${STAGING_SQL_TABLE[table]}`;
  const where = `WHERE tenant_id = ${sqlUuid(row.tenant_id)} AND source_id = ${sqlText(row.source_id)}`;
  if (table === 'receivables') {
    return `UPDATE ${qualified}
      SET status = ${sqlText(row.status)},
          canceled_at = ${sqlTs(row.canceled_at)},
          canceled_reason = ${sqlText(row.canceled_reason)},
          updated_at = now()
      ${where}`;
  }
  if (table === 'financings') {
    return `UPDATE ${qualified}
      SET status = ${sqlText(row.status)},
          approved_at = ${sqlTs(row.approved_at)},
          canceled_at = ${sqlTs(row.canceled_at)},
          canceled_reason = ${sqlText(row.canceled_reason)},
          updated_at = now()
      ${where}`;
  }
  if (table === 'payments') {
    return `UPDATE ${qualified}
      SET status = ${sqlText(row.status)},
          reversed_at = ${sqlTs(row.reversed_at)},
          reversal_reason = ${sqlText(row.reversal_reason)}
      ${where}`;
  }
  return null;
}

export function createLedgerAuthenticatedExecutor({
  userId,
  tenantId,
  inner,
  ledger = [],
} = {}) {
  const executor = async (sql) => {
    const wrapped = wrapAuthenticatedTenantSql(sql, { userId, tenantId });
    if (isServiceRoleSql(wrapped)) throw new Error('FINANCIAL_V2_PILOT_SERVICE_ROLE_FORBIDDEN');
    ledger.push({
      sql: String(sql || '').trim(),
      wrappedHasAuthenticatedRole: /SET LOCAL ROLE authenticated/.test(wrapped),
      wrappedHasServiceRole: isServiceRoleSql(wrapped),
    });
    if (typeof inner !== 'function') return [];
    return inner(sql);
  };
  return { executor, ledger };
}
