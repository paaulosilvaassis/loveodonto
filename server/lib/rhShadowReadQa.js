/**
 * RH Shadow Read QA — Sprint 1C Ticket 1.10 / 1.11.
 * Somente leitura / diagnóstico. Zero writes Supabase ou IDB.
 */

import { classifyShadowCompareResult } from './rhShadowDiffClassification.js';
import { isAgendaProfessional } from '../../src/constants/collaboratorRhCatalog.js';

/** @readonly */
export const STAGING_SHADOW_QA_TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';

/** Flags seguras para shadow QA em staging/dev (Ticket 1.10). */
export const STAGING_SHADOW_QA_FLAGS = {
  RH_SUPABASE_READ: true,
  RH_SHADOW_READ: true,
  RH_COMPARE_IDB_SUPABASE: true,
  RH_SUPABASE_READ_PRIMARY: false,
  RH_SUPABASE_WRITE: false,
  RH_IDB_WRITE_DISABLED: false,
  RH_ALLOW_SYNTHETIC_STUBS: true,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_RE = /^col(-saas)?-/i;

const SHADOW_FIELDS = [
  ['uuid', (c) => c.uuid],
  ['legacy_id', (c) => c.legacyId],
  ['tenant_id', (c) => c.tenantId],
  ['email', (c) => c.email ?? null],
  ['nome', (c) => c.nomeCompleto],
  ['status', (c) => c.status],
  ['cargo', (c) => c.cargo],
  ['categoria', (c) => c.rhCategoria],
  ['agenda_enabled', (c) => c.agendaEnabled],
  ['updated_at', (c) => c.updatedAt],
];

function norm(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value).trim();
}

function isUuid(ref) {
  return UUID_RE.test(String(ref || '').trim());
}

function isLegacy(ref) {
  return LEGACY_RE.test(String(ref || '').trim());
}

/**
 * Paridade com resolveCollaboratorAgendaEnabled (collaboratorMapper.ts).
 * @param {Record<string, unknown>} row
 */
export function resolveCollaboratorAgendaEnabled(row) {
  if (typeof row?.agendaEnabled === 'boolean') return row.agendaEnabled;
  if (typeof row?.agenda_enabled === 'boolean') return row.agenda_enabled;
  return isAgendaProfessional({
    rhCategoria: String(row?.rhCategoria ?? row?.rh_categoria ?? '').trim(),
    cargo: String(row?.cargo ?? '').trim(),
  });
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} fallbackTenantId
 */
export function mapIdbExportRowToCore(row, fallbackTenantId) {
  const tenantId = String(row.tenant_id || row.tenantId || fallbackTenantId || '').trim();
  const legacyId = String(row.id ?? '').trim();
  const uuid = String(row.uuid ?? '').trim() || legacyId;
  return {
    uuid,
    legacyId,
    tenantId,
    status: row.status ?? 'ativo',
    apelido: row.apelido ?? '',
    nomeCompleto: row.nomeCompleto ?? '',
    email: row.email ?? null,
    rhCategoria: row.rhCategoria ?? '',
    cargo: row.cargo ?? '',
    agendaEnabled: resolveCollaboratorAgendaEnabled(row),
    updatedAt: row.updatedAt ?? row.updated_at ?? '',
  };
}

/** @param {Record<string, unknown>} row */
export function mapSupabaseRowToCore(row) {
  return {
    uuid: String(row.id ?? '').trim(),
    legacyId: String(row.legacy_id ?? row.id ?? '').trim(),
    tenantId: String(row.tenant_id ?? '').trim(),
    status: row.status ?? 'ativo',
    apelido: row.apelido ?? '',
    nomeCompleto: row.nome_completo ?? '',
    email: row.email ?? null,
    rhCategoria: row.rh_categoria ?? '',
    cargo: row.cargo ?? '',
    agendaEnabled: Boolean(row.agenda_enabled ?? false),
    updatedAt: row.updated_at ?? '',
  };
}

function toRef(item) {
  return { legacyId: item.legacyId, uuid: item.uuid, tenantId: item.tenantId };
}

function compareFields(local, remote) {
  const diffs = [];
  for (const [field, read] of SHADOW_FIELDS) {
    const lv = read(local);
    const rv = read(remote);
    if (norm(lv) !== norm(rv)) {
      diffs.push({ field, localValue: lv, remoteValue: rv });
    }
  }
  return diffs;
}

/**
 * @param {string} tenantId
 * @param {ReturnType<typeof mapIdbExportRowToCore>[]} localItems
 * @param {ReturnType<typeof mapSupabaseRowToCore>[]} remoteItems
 */
export function compareCollaboratorsForQa(tenantId, localItems, remoteItems) {
  const normalizedTenant = String(tenantId || '').trim();
  const local = localItems.filter((i) => norm(i.tenantId) === normalizedTenant);
  const remote = remoteItems.filter((i) => norm(i.tenantId) === normalizedTenant);

  const duplicate = [];
  for (const side of ['local', 'remote']) {
    const items = side === 'local' ? local : remote;
    for (const key of ['uuid', 'legacy_id']) {
      const buckets = new Map();
      for (const item of items) {
        const value = norm(key === 'uuid' ? item.uuid : item.legacyId);
        if (!value) continue;
        const list = buckets.get(value) ?? [];
        list.push(item.legacyId);
        buckets.set(value, list);
      }
      for (const [value, legacyIds] of buckets) {
        if (legacyIds.length > 1) duplicate.push({ side, key, value, legacyIds });
      }
    }
  }

  const duplicateLegacyIds = new Set(duplicate.flatMap((d) => d.legacyIds));
  const localMap = new Map();
  const remoteMap = new Map();
  for (const item of local) {
    if (!item.legacyId || duplicateLegacyIds.has(item.legacyId)) continue;
    localMap.set(item.legacyId, item);
  }
  for (const item of remote) {
    if (!item.legacyId || duplicateLegacyIds.has(item.legacyId)) continue;
    remoteMap.set(item.legacyId, item);
  }

  const match = [];
  const missing_local = [];
  const missing_remote = [];
  const field_diff = [];
  const invalid_uuid = [];
  const invalid_legacy = [];

  for (const item of local) {
    if (!isUuid(item.uuid)) invalid_uuid.push({ side: 'local', legacyId: item.legacyId, uuid: item.uuid });
    if (!isLegacy(item.legacyId)) invalid_legacy.push({ side: 'local', uuid: item.uuid, legacyId: item.legacyId });
  }
  for (const item of remote) {
    if (!isUuid(item.uuid)) invalid_uuid.push({ side: 'remote', legacyId: item.legacyId, uuid: item.uuid });
    if (!isLegacy(item.legacyId)) invalid_legacy.push({ side: 'remote', uuid: item.uuid, legacyId: item.legacyId });
  }

  for (const legacyId of new Set([...localMap.keys(), ...remoteMap.keys()])) {
    const l = localMap.get(legacyId);
    const r = remoteMap.get(legacyId);
    if (l && !r) {
      missing_remote.push({ ref: toRef(l) });
      continue;
    }
    if (r && !l) {
      missing_local.push({ ref: toRef(r) });
      continue;
    }
    if (!l || !r) continue;
    const diffs = compareFields(l, r);
    if (diffs.length === 0) match.push({ ref: toRef(l) });
    else field_diff.push({ ref: toRef(l), diffs });
  }

  return {
    tenantId: normalizedTenant,
    comparedAt: new Date().toISOString(),
    counts: { local: local.length, remote: remote.length },
    match,
    missing_local,
    missing_remote,
    field_diff,
    duplicate,
    invalid_uuid,
    invalid_legacy,
  };
}

/** @param {ReturnType<typeof compareCollaboratorsForQa>} details */
export function generateRhShadowQaReport(details, durationMs = 0) {
  const diffCount =
    details.missing_local.length
    + details.missing_remote.length
    + details.field_diff.length
    + details.duplicate.length
    + details.invalid_uuid.length
    + details.invalid_legacy.length
    + (details.counts.local !== details.counts.remote ? 1 : 0);

  const classification = classifyShadowCompareResult(details);
  const denominator = Math.max(details.counts.local, details.counts.remote, 1);
  const matchPercent = Math.round((details.match.length / denominator) * 10000) / 100;

  return {
    tag: '[RH_SHADOW]',
    tenant: details.tenantId,
    comparedAt: details.comparedAt,
    durationMs,
    matchPercent,
    diffCount,
    blockingDiffCount: classification.blockingDiffCount,
    transitionalDiffCount: classification.transitionalDiffCount,
    informationalDiffCount: classification.informationalDiffCount,
    canPromoteReadPrimary: classification.canPromoteReadPrimary,
    promotionBlockers: classification.promotionBlockers,
    localCount: details.counts.local,
    remoteCount: details.counts.remote,
    summary: {
      localCount: details.counts.local,
      remoteCount: details.counts.remote,
      matchCount: details.match.length,
      missingLocalCount: details.missing_local.length,
      missingRemoteCount: details.missing_remote.length,
      fieldDiffCount: details.field_diff.length,
      duplicateCount: details.duplicate.length,
      invalidUuidCount: details.invalid_uuid.length,
      invalidLegacyCount: details.invalid_legacy.length,
      countMismatch: details.counts.local !== details.counts.remote,
      blockingDiffCount: classification.blockingDiffCount,
      transitionalDiffCount: classification.transitionalDiffCount,
      informationalDiffCount: classification.informationalDiffCount,
      canPromoteReadPrimary: classification.canPromoteReadPrimary,
    },
    classification,
    flags: STAGING_SHADOW_QA_FLAGS,
    writesExecuted: false,
    productionTouched: false,
    details,
  };
}

/** @param {ReturnType<typeof generateRhShadowQaReport>} report */
export function formatRhShadowQaConsole(report) {
  const lines = [
    '[RH_SHADOW] QA Report',
    `tenant: ${report.tenant}`,
    `localCount: ${report.localCount}`,
    `remoteCount: ${report.remoteCount}`,
    `matchPercent: ${report.matchPercent}`,
    `diffCount: ${report.diffCount}`,
    `blockingDiffCount: ${report.blockingDiffCount}`,
    `transitionalDiffCount: ${report.transitionalDiffCount}`,
    `informationalDiffCount: ${report.informationalDiffCount}`,
    `canPromoteReadPrimary: ${report.canPromoteReadPrimary}`,
    `durationMs: ${report.durationMs}`,
    `missing_local: ${report.summary.missingLocalCount}`,
    `missing_remote: ${report.summary.missingRemoteCount}`,
    `field_diff: ${report.summary.fieldDiffCount}`,
    `invalid_uuid: ${report.summary.invalidUuidCount}`,
    `invalid_legacy: ${report.summary.invalidLegacyCount}`,
    `writesExecuted: ${report.writesExecuted}`,
  ];
  if (report.promotionBlockers?.length) {
    lines.push(`promotionBlockers: ${report.promotionBlockers.length}`);
    for (const blocker of report.promotionBlockers) {
      lines.push(`  - ${blocker}`);
    }
  }
  return lines.join('\n');
}
