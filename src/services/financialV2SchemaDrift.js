/**
 * PHASE 11.J — inspeção pura do SQL financial_v2 para schema drift.
 * Não conecta no banco. Não escreve.
 */
import { V2_MONEY_COLUMNS, V2_TABLES } from '../contracts/financialV2RemoteSchemaContract.js';

function stripSqlComments(sql) {
  return String(sql || '')
    .replace(/--[^\n]*/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '\n');
}

function tableBody(sql, tableName) {
  const re = new RegExp(`create table if not exists public\\.${tableName}\\s*\\(`, 'i');
  const start = sql.search(re);
  if (start < 0) return '';
  const open = sql.indexOf('(', start);
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === '(') depth += 1;
    if (sql[i] === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return '';
}

export function inspectFinancialV2MigrationSql(rawSql) {
  const sql = stripSqlComments(rawSql);
  const findings = [];
  const tablesFound = V2_TABLES.filter((name) => new RegExp(`create table if not exists public\\.${name}\\b`, 'i').test(sql));

  const moneyTypes = {};
  let floatMoneyColumns = 0;
  for (const [table, cols] of Object.entries(V2_MONEY_COLUMNS)) {
    const body = tableBody(sql, table);
    moneyTypes[table] = {};
    for (const col of cols) {
      const match = body.match(new RegExp(`${col}\\s+([a-z0-9() ,]+)`, 'i'));
      const type = String(match?.[1] || '').trim().split(/\s+/)[0].toLowerCase();
      moneyTypes[table][col] = type;
      if (type && type !== 'bigint') {
        floatMoneyColumns += 1;
        findings.push(`${table}.${col} type=${type}`);
      }
    }
  }

  const hasOpenDefault = /default\s+'open'/i.test(sql);
  const hasNumericMoney = /numeric\s*\(\s*14\s*,\s*2/i.test(sql);
  const hasDouble = /double precision|\breal\b/i.test(sql);

  const fkClauses = [...sql.matchAll(/references[\s\S]{0,120}?on delete\s+(\w+)/gi)].map((m) => m[1].toLowerCase());
  const destructiveCascades = fkClauses.filter((action) => action === 'cascade');

  const hasDeletePolicy = /for delete\b/i.test(sql);
  const rlsEnabled = /enable row level security/i.test(sql);
  const deleteRevoked = /revoke all on table public\.%I from public, anon, authenticated/i.test(sql)
    || /revoke all on table public\.financial_v2_/i.test(sql)
    || /revoke all on table public\.%I from public, anon, authenticated/i.test(sql);

  const identities = {
    receivableSource: /fv2_recv_tenant_source_uq unique \(tenant_id, source_id\)/i.test(sql),
    receivableObligation: /fv2_recv_obligation_identity_uq[\s\S]{0,200}origin_type, origin_id, installment_number/i.test(sql),
    paymentOperation: /fv2_pay_operation_uq unique \(tenant_id, operation_id\)/i.test(sql),
    financingActive: /fv2_fin_active_budget_uq[\s\S]{0,200}status not in \('canceled', 'renegotiated'\)/i.test(sql),
    chargeOperation: /fv2_charge_operation_uq unique \(tenant_id, operation_id\)/i.test(sql),
  };

  const sourceIdText = V2_TABLES.every((name) => {
    const body = tableBody(sql, name);
    return /source_id text not null/i.test(body);
  });

  const tenantUuidNotNull = V2_TABLES.every((name) => {
    const body = tableBody(sql, name);
    return /tenant_id uuid not null/i.test(body);
  });

  return {
    tablesFound,
    missingTables: V2_TABLES.filter((name) => !tablesFound.includes(name)),
    moneyTypes,
    floatMoneyColumns,
    hasOpenDefault,
    hasNumericMoney,
    hasDouble,
    destructiveCascades,
    hasDeletePolicy,
    rlsEnabled,
    deleteRevoked,
    identities,
    sourceIdText,
    tenantUuidNotNull,
    findings,
    ok:
      tablesFound.length === V2_TABLES.length
      && floatMoneyColumns === 0
      && !hasOpenDefault
      && !hasNumericMoney
      && !hasDouble
      && destructiveCascades.length === 0
      && !hasDeletePolicy
      && rlsEnabled
      && sourceIdText
      && tenantUuidNotNull
      && Object.values(identities).every(Boolean),
  };
}

export function detectFinancialV2SchemaDrift(sql, liveIntrospection = null) {
  const inspected = inspectFinancialV2MigrationSql(sql);
  const drift = [];
  if (!inspected.ok) drift.push('migration_sql_contract_failed');
  if (liveIntrospection) {
    if (liveIntrospection.rlsEnabled === false) drift.push('rls_disabled');
    if (liveIntrospection.deletePolicies?.length) drift.push('delete_policy_added');
    if (Number(liveIntrospection.floatMoneyColumns) > 0) drift.push('money_not_bigint');
    if (liveIntrospection.uniqueIdentitiesMissing?.length) drift.push('unique_identity_missing');
    if (liveIntrospection.columnTypeChanges?.length) drift.push('column_type_changed');
    if (liveIntrospection.constraintDropped?.length) drift.push('constraint_dropped');
  }
  return { inspected, drift, ok: drift.length === 0 };
}
