/**
 * @module repositories/crm/crmActivityWritePipeline
 * @description Activity Write Pipeline — Phase 6.7 dual-write + Phase 6.8 Primary Write.
 *
 * Dual (WRITE_PRIMARY=false):
 *   Activity → Write Toolkit → remote shadow → descarta
 *
 * Primary (WRITE_PRIMARY=true, staging):
 *   Activity → Write Toolkit → remote SSOT → hydrate IDB pontual → soak
 */

import type { CrmActivity, CrmActivitySource, CrmActivityType } from './crmActivityTypes.js';
import { compareCrmActivities } from './crmActivityMapper.js';
import {
  getCrmActivityFlags,
  shouldCompareCrmActivityWrite,
  type CrmActivityFlagsInput,
} from './crmActivityFlags.js';
import {
  hydrateCrmActivityIdbFromRemote,
  projectCrmActivityStreamAfterHydrate,
} from './crmActivityHydrate.js';
import {
  recordCrmActivityWriteSoakCompareDiff,
  recordCrmActivityWriteSoakHydrateFailed,
  recordCrmActivityWriteSoakHydrateOk,
  recordCrmActivityWriteSoakPrimaryFailed,
  recordCrmActivityWriteSoakPrimaryOk,
  recordCrmActivityWriteSoakShadowFailed,
  recordCrmActivityWriteSoakShadowOk,
  recordCrmActivityWriteSoakSkipped,
  recordCrmActivityWriteSoakTotalWrite,
  logCrmActivityWriteSoakDev,
} from './crmActivityWriteSoak.js';
import { runRepositoryWritePipeline } from '../shared/repositoryV3WritePipeline.js';
import { logRepositoryDev } from '../shared/repositoryV3SyncHelpers.js';
import type { RepositoryWriteMeta } from '../shared/repositoryV3Idempotency.js';

export type CrmActivityWriteOperation =
  | 'create'
  | 'update'
  | 'delete'
  | 'complete';

export interface CrmActivityWriteInput {
  activity: CrmActivity;
  operation: CrmActivityWriteOperation;
  partialMeta?: RepositoryWriteMeta;
  /** Remote executor — stub até Admin API Wave B existir. */
  executeRemote?: (
    activity: CrmActivity,
    operation: CrmActivityWriteOperation,
    meta: ReturnType<typeof import('../shared/repositoryV3Idempotency.js').resolveRepositoryWriteMeta>,
  ) => Promise<CrmActivity | null | void>;
}

export interface CrmActivityWriteResult {
  skipped: boolean;
  syncResult: 'ok' | 'failed' | 'skipped' | 'shadow';
  remoteId: string | null;
  sourceStore: CrmActivitySource;
  activityType: CrmActivityType;
  projection?: Record<string, unknown> | null;
}

/** Roteamento Activity.type → store canônica (sem alterar comportamento legado). */
export function resolveActivitySourceStore(activity: CrmActivity): CrmActivitySource {
  if (activity.source) return activity.source;
  switch (activity.type) {
    case 'TASK':
      return 'crmTasks';
    case 'FOLLOW_UP':
      return activity.payload?.originType || activity.payload?.dueDate
        ? 'followUps'
        : 'crmFollowUps';
    case 'CALL':
    case 'EMAIL':
    case 'MOVE_STAGE':
    case 'NOTE':
    case 'WHATSAPP':
    case 'AUTOMATION':
    case 'SYSTEM':
    default:
      return 'crmLeadEvents';
  }
}

function domainForSource(source: CrmActivitySource): string {
  switch (source) {
    case 'crmLeadEvents':
      return 'lead-event';
    case 'crmFollowUps':
      return 'crm-legacy-followup';
    case 'crmTasks':
      return 'crm-task';
    case 'followUps':
      return 'strategic-followup';
    default:
      return 'activity';
  }
}

async function defaultRemoteActivity(
  activity: CrmActivity,
  _operation: CrmActivityWriteOperation,
): Promise<CrmActivity> {
  /** Stub de SSOT remoto — ecoa activity (Admin API Wave B ainda não existe). */
  return {
    ...activity,
    payload: {
      ...activity.payload,
      remotePrimary: true,
      syncedAt: new Date().toISOString(),
    },
  };
}

function recordSoakOutcome(
  isWritePrimary: boolean,
  syncResult: 'ok' | 'failed' | 'skipped' | 'shadow',
  skipped: boolean,
): void {
  recordCrmActivityWriteSoakTotalWrite();
  if (skipped) {
    recordCrmActivityWriteSoakSkipped();
    return;
  }
  if (isWritePrimary) {
    if (syncResult === 'ok') recordCrmActivityWriteSoakPrimaryOk();
    else if (syncResult === 'failed') recordCrmActivityWriteSoakPrimaryFailed();
    return;
  }
  if (syncResult === 'shadow') recordCrmActivityWriteSoakShadowOk();
  else if (syncResult === 'failed') recordCrmActivityWriteSoakShadowFailed();
}

function hydratePrimaryActivity(
  remote: CrmActivity,
  operation: CrmActivityWriteOperation,
  sourceStore: CrmActivitySource,
): Record<string, unknown> | null {
  try {
    const count = hydrateCrmActivityIdbFromRemote(remote, operation, sourceStore);
    if (count > 0) {
      recordCrmActivityWriteSoakHydrateOk();
      const projection = projectCrmActivityStreamAfterHydrate(remote, sourceStore);
      logCrmActivityWriteSoakDev('hydrate-ok', {
        activityId: remote.id,
        sourceStore,
        operation,
        projection,
      });
      return projection;
    }
    recordCrmActivityWriteSoakHydrateFailed();
    return null;
  } catch (err) {
    recordCrmActivityWriteSoakHydrateFailed(err);
    return null;
  }
}

/**
 * Executa dual-write shadow ou Primary Write + hydrate via Write Toolkit.
 * Dual: remoto descartado. Primary: hydrate pontual no IndexedDB após sucesso.
 */
export async function runCrmActivityWritePipeline(
  input: CrmActivityWriteInput,
  flagsInput: CrmActivityFlagsInput = {},
): Promise<CrmActivityWriteResult> {
  const { activity, operation, partialMeta = {}, executeRemote } = input;
  const flags = getCrmActivityFlags(flagsInput);
  const sourceStore = resolveActivitySourceStore(activity);
  const domain = domainForSource(sourceStore);
  const isWritePrimary = Boolean(flags.CRM_ACTIVITY_WRITE && flags.CRM_ACTIVITY_WRITE_PRIMARY);
  const writeCompare = shouldCompareCrmActivityWrite(flagsInput);
  let projection: Record<string, unknown> | null = null;

  const result = await runRepositoryWritePipeline({
    domain,
    tenantId: activity.tenantId,
    legacyId: activity.id,
    operation,
    partialMeta: {
      ...partialMeta,
      writeSource: isWritePrimary ? 'primary-write-hydrate' : 'legacy-dual-write',
    },
    defaultWriteSource: 'legacy-dual-write',
    isWritePrimary,
    writeCompare,
    getLegacyCore: () => activity,
    executeRemote: async (meta) => {
      const remoteFn = executeRemote ?? defaultRemoteActivity;
      return remoteFn(activity, operation, meta);
    },
    compareWrite: (legacy, remote) => {
      const comparison = compareCrmActivities(
        legacy as CrmActivity | null,
        (remote as CrmActivity) ?? null,
      );
      if (!comparison.match) {
        recordCrmActivityWriteSoakCompareDiff();
        logRepositoryDev('CRM_ACTIVITY_WRITE_COMPARE', `${sourceStore}:${operation}`, {
          activityId: activity.id,
          type: activity.type,
          leadId: activity.leadId,
          ownerId: activity.ownerId,
          timestamp: activity.timestamp,
          status: activity.status,
          diffs: comparison.diffs,
        });
      }
      return comparison;
    },
    onPrimarySuccess: (remote) => {
      projection = hydratePrimaryActivity(remote as CrmActivity, operation, sourceStore);
    },
    extractRemoteId: (remote) => {
      if (!remote || typeof remote !== 'object') return null;
      const obj = remote as CrmActivity;
      return obj.id || null;
    },
  });

  recordSoakOutcome(isWritePrimary, result.syncResult, result.skipped);

  logRepositoryDev('CRM_ACTIVITY_WRITE', `${operation}:${activity.type}`, {
    activityId: activity.id,
    activityType: activity.type,
    sourceStore,
    tenantId: activity.tenantId,
    syncResult: result.syncResult,
    primary: isWritePrimary,
    remoteDiscarded: !isWritePrimary,
    auditDomain: `${domain}|${activity.type}|${sourceStore}`,
  });

  return {
    skipped: result.skipped,
    syncResult: result.syncResult,
    remoteId: result.remoteId,
    sourceStore,
    activityType: activity.type,
    projection,
  };
}
