/**
 * Ferramentas internas RH QA — RC-01.1A.
 * LEGACY_RC01: remoção planejada RC-03 após cutover read-primary estável.
 * Reutiliza repository, shadow validation e uuid mirror. Zero escrita Supabase.
 */
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import {
  assertQaToolsAllowed,
  getQaToolsEnvironment,
  PROD_PROJECT_REF,
} from '../config/qaToolsGuard.js';
import { collaboratorRepository } from '../repositories/collaborator/collaboratorRepository.ts';
import { collaboratorIndexedDbRepository } from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';
import { buildCollaboratorCompareResult } from '../repositories/collaborator/collaboratorRepositoryCompare.ts';
import { mapSupabaseRowToCore } from '../repositories/collaborator/collaboratorMapper.ts';
import {
  generateShadowReport,
  runWithShadowTimeout,
  RH_SHADOW_DEFAULT_TIMEOUT_MS,
} from '../repositories/collaborator/collaboratorShadowValidation.ts';
import {
  mergeUuidMirrorPlanIntoReport,
  buildCollaboratorUuidMirrorPlan,
  normalizeRemoteCollaboratorRows,
} from '../repositories/collaborator/collaboratorUuidMirror.ts';
import { requireRepositoryTenantId } from '../repositories/collaborator/collaboratorRepositoryGuards.ts';
import {
  applyCollaboratorIdbHydratePlan,
  buildCollaboratorIdbHydratePlan,
} from '../repositories/collaborator/collaboratorQaIdbHydrate.ts';

const HISTORY_KEY = 'love-odonto.qa-tools.history';
const MAX_HISTORY = 20;

const QA_REPOSITORY_FLAGS = {
  RH_SUPABASE_READ: true,
  RH_SHADOW_READ: true,
  RH_COMPARE_IDB_SUPABASE: true,
  RH_SUPABASE_READ_PRIMARY: false,
  RH_SUPABASE_WRITE: false,
  RH_IDB_WRITE_DISABLED: false,
  RH_ALLOW_SYNTHETIC_STUBS: true,
};

function assertStagingSupabaseHost(client) {
  const hostRef = (() => {
    try {
      return new URL(client.supabaseUrl).hostname.split('.')[0];
    } catch {
      return '';
    }
  })();
  if (hostRef === PROD_PROJECT_REF) {
    throw new Error(`Produção detectada (${PROD_PROJECT_REF}). Operação QA abortada.`);
  }
}

/**
 * Leituras Supabase nos QA Tools usam o client da sessão SaaS (authenticated).
 * supabaseAppClient não recebe o JWT do login — consultas caem em anon → permission denied.
 */
async function getAuthenticatedQaSupabaseClient() {
  if (!supabasePlatformClient) {
    throw new Error('Cliente Supabase Plataforma indisponível. Verifique VITE_SUPABASE_PLATFORM_URL.');
  }
  assertStagingSupabaseHost(supabasePlatformClient);

  const { data: { session } } = await supabasePlatformClient.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessão SaaS ausente. Faça login novamente antes de executar QA Tools.');
  }
  return supabasePlatformClient;
}

function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendHistory(entry) {
  const next = [entry, ...readHistory()].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

async function fetchRemoteMirrorRows(tenantId) {
  const client = await getAuthenticatedQaSupabaseClient();

  const { data, error } = await client
    .from('collaborators')
    .select('id, legacy_id, tenant_id')
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message || 'Falha ao ler colaboradores remotos.');
  return data || [];
}

async function fetchRemoteCollaboratorsForShadow(tenantId) {
  const client = await getAuthenticatedQaSupabaseClient();

  const { data, error } = await client
    .from('collaborators')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) throw new Error(error.message || 'Falha ao ler colaboradores remotos (shadow).');
  return (data || []).map((row) => mapSupabaseRowToCore(row));
}

function applyUuidMirrorPlan(tenantId, plan) {
  const report = mergeUuidMirrorPlanIntoReport(tenantId, plan);

  for (const item of plan) {
    if (item.action !== 'update') continue;
    try {
      const outcome = collaboratorIndexedDbRepository.mirrorCollaboratorUuidOnly(
        tenantId,
        item.legacyId,
        item.uuid,
      );
      if (outcome === 'updated') {
        report.updated.push({
          legacyId: item.legacyId,
          uuid: item.uuid,
          previousUuid: item.previousUuid,
        });
      } else if (outcome === 'skipped') {
        report.skipped.push({ legacyId: item.legacyId, uuid: item.uuid });
      } else {
        report.notFound.push({ legacyId: item.legacyId, uuid: item.uuid });
      }
    } catch (err) {
      report.errors.push({
        legacyId: item.legacyId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return report;
}

function wrapHydrateReport(report, environment, plan) {
  return {
    tag: '[RH_IDB_HYDRATE]',
    tenant: report.tenantId,
    hydratedAt: report.hydratedAt,
    remoteCount: plan?.remoteCount ?? 0,
    localCountBefore: plan?.localCountBefore ?? 0,
    localCountAfter: report.localCountAfter ?? 0,
    inserted: report.inserted,
    updated: report.updated,
    skipped: report.skipped,
    conflicts: report.conflicts,
    errors: report.errors,
    supabaseWritesExecuted: false,
    meta: {
      method: 'ui-rh-qa-tools',
      productionTouched: false,
      environment,
    },
  };
}

function wrapMirrorReport(report, environment) {
  return {
    tag: '[RH_UUID_MIRROR]',
    tenant: report.tenantId,
    mirroredAt: report.mirroredAt,
    updated: report.updated,
    skipped: report.skipped,
    notFound: report.notFound,
    conflicts: report.conflicts,
    errors: report.errors,
    supabaseWritesExecuted: false,
    meta: {
      method: 'ui-rh-qa-tools',
      productionTouched: false,
      environment,
    },
  };
}

function wrapShadowReport(report, environment) {
  return {
    tag: '[RH_SHADOW]',
    tenant: report.tenant,
    comparedAt: report.comparedAt,
    durationMs: report.durationMs,
    localCount: report.summary?.localCount ?? 0,
    remoteCount: report.summary?.remoteCount ?? 0,
    matchPercent: report.matchPercent,
    diffCount: report.diffCount,
    blockingDiffCount: report.blockingDiffCount,
    transitionalDiffCount: report.transitionalDiffCount,
    informationalDiffCount: report.informationalDiffCount,
    canPromoteReadPrimary: report.canPromoteReadPrimary,
    promotionBlockers: report.promotionBlockers,
    summary: report.summary,
    classification: report.classification,
    details: report.details,
    error: report.error,
    writesExecuted: false,
    productionTouched: false,
    flags: QA_REPOSITORY_FLAGS,
    meta: {
      method: 'ui-rh-qa-tools',
      productionTouched: false,
      environment,
    },
  };
}

function recordRun(type, tenantId, payload, ok) {
  const entry = {
    id: `${Date.now()}-${type}`,
    type,
    tenantId,
    at: new Date().toISOString(),
    ok,
    summary: type === 'hydrate'
      ? {
        inserted: payload.inserted?.length ?? 0,
        updated: payload.updated?.length ?? 0,
        skipped: payload.skipped?.length ?? 0,
        conflicts: payload.conflicts?.length ?? 0,
        errors: payload.errors?.length ?? 0,
        localCountAfter: payload.localCountAfter ?? 0,
      }
      : type === 'mirror'
        ? {
          updated: payload.updated?.length ?? 0,
          conflicts: payload.conflicts?.length ?? 0,
          errors: payload.errors?.length ?? 0,
        }
        : {
          blockingDiffCount: payload.blockingDiffCount ?? 0,
          transitionalDiffCount: payload.transitionalDiffCount ?? 0,
          canPromoteReadPrimary: payload.canPromoteReadPrimary ?? false,
        },
  };
  appendHistory(entry);
  return entry;
}

export function getRhQaToolsHistory() {
  assertQaToolsAllowed();
  return readHistory();
}

export function clearRhQaToolsHistory() {
  assertQaToolsAllowed();
  localStorage.removeItem(HISTORY_KEY);
}

export function getRhQaToolsEnvironmentInfo(tenantId) {
  return getQaToolsEnvironment(tenantId);
}

/**
 * Hidrata IndexedDB local a partir de public.collaborators (read Supabase, write IDB only).
 * RC-01.5 — somente `collaborators[]`; não altera appointments/satellites/Supabase.
 */
export async function runRhHydrateIdbQa(tenantId) {
  assertQaToolsAllowed();
  const normalizedTenant = requireRepositoryTenantId(tenantId);
  const environment = getQaToolsEnvironment(normalizedTenant);
  const started = performance.now();

  const remoteCores = await fetchRemoteCollaboratorsForShadow(normalizedTenant);
  const localRows = collaboratorIndexedDbRepository.listCollaboratorsByTenantLegacySync(
    normalizedTenant,
  );
  const plan = buildCollaboratorIdbHydratePlan(normalizedTenant, localRows, remoteCores);
  const applyReport = applyCollaboratorIdbHydratePlan(plan);

  const payload = wrapHydrateReport(applyReport, environment, plan);
  payload.meta.durationMs = Math.round(performance.now() - started);
  recordRun(
    'hydrate',
    normalizedTenant,
    payload,
    (payload.errors?.length ?? 0) === 0 && (payload.conflicts?.length ?? 0) === 0,
  );
  return payload;
}

/**
 * Espelha collaborator_uuid → campo uuid no IDB (read Supabase, write IDB only).
 */
export async function runRhUuidMirrorQa(tenantId) {
  assertQaToolsAllowed();
  const normalizedTenant = requireRepositoryTenantId(tenantId);
  const environment = getQaToolsEnvironment(normalizedTenant);
  const started = performance.now();

  let report;

  if (import.meta.env?.DEV) {
    const remoteRows = await fetchRemoteMirrorRows(normalizedTenant);
    report = collaboratorRepository.mirrorCollaboratorUuidsToIndexedDb(
      normalizedTenant,
      remoteRows,
    );
  } else {
    const remoteRows = await fetchRemoteMirrorRows(normalizedTenant);
    const localRows = collaboratorIndexedDbRepository.listCollaboratorsByTenantLegacySync(
      normalizedTenant,
    );
    const plan = buildCollaboratorUuidMirrorPlan(
      normalizedTenant,
      localRows,
      normalizeRemoteCollaboratorRows(remoteRows),
    );
    report = applyUuidMirrorPlan(normalizedTenant, plan);
  }

  const payload = wrapMirrorReport(report, environment);
  payload.meta.durationMs = Math.round(performance.now() - started);
  recordRun('mirror', normalizedTenant, payload, (payload.errors?.length ?? 0) === 0
    && (payload.conflicts?.length ?? 0) === 0);
  return payload;
}

/**
 * Shadow QA — compareIdbVsSupabase + classificação (Ticket 1.10/1.11).
 */
export async function runRhShadowQa(tenantId) {
  assertQaToolsAllowed();
  const normalizedTenant = requireRepositoryTenantId(tenantId);
  const environment = getQaToolsEnvironment(normalizedTenant);
  const started = performance.now();

  const compareResult = await runWithShadowTimeout((async () => {
    const idbItems = collaboratorIndexedDbRepository.list(normalizedTenant);
    const sbItems = await fetchRemoteCollaboratorsForShadow(normalizedTenant);
    return buildCollaboratorCompareResult(normalizedTenant, idbItems, sbItems);
  })(), RH_SHADOW_DEFAULT_TIMEOUT_MS);

  const durationMs = Math.round(performance.now() - started);
  const shadowInput = compareResult.shadow ?? compareResult;
  const report = generateShadowReport(shadowInput, durationMs);
  const payload = wrapShadowReport(report, environment);
  recordRun(
    'shadow',
    normalizedTenant,
    payload,
    !payload.error && payload.blockingDiffCount === 0,
  );
  return payload;
}

export function downloadRhQaReport(report, filenamePrefix) {
  assertQaToolsAllowed();
  const tag = report?.tag === '[RH_UUID_MIRROR]'
    ? 'rh-mirror-uuid-idb-qa'
    : report?.tag === '[RH_IDB_HYDRATE]'
      ? 'rh-idb-hydrate-qa'
      : 'rh-shadow-read-qa';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${filenamePrefix || tag}-${ts}.json`;
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return filename;
}
