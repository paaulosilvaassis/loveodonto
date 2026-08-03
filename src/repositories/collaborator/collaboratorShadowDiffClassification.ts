/**
 * @module repositories/collaborator/collaboratorShadowDiffClassification
 * @description Classificação de divergências shadow — Sprint 1C Ticket 1.11.
 * LEGACY_RC01: promoção read-primary RC-01; remoção planejada RC-03.
 * Somente observabilidade; não altera leitura/escrita funcional.
 */

import { isCollaboratorLegacyId, isCollaboratorUuid } from './collaboratorMapper.js';
import type {
  CollaboratorShadowCompareResult,
  CollaboratorShadowFieldDiff,
  CollaboratorShadowRef,
} from './collaboratorShadowValidation.js';

export type ShadowDiffTier = 'blocking_diff' | 'transitional_diff' | 'informational_diff';

export interface ClassifiedShadowFieldDiff extends CollaboratorShadowFieldDiff {
  tier: ShadowDiffTier;
  reason: string;
}

export interface ClassifiedShadowStructuralDiff {
  tier: ShadowDiffTier;
  kind: string;
  reason: string;
  ref?: CollaboratorShadowRef;
  side?: 'local' | 'remote';
  legacyId?: string;
  uuid?: string;
  field?: string;
  localValue?: unknown;
  remoteValue?: unknown;
}

export interface ClassifiedShadowFieldDiffEntry {
  ref: CollaboratorShadowRef;
  diffs: ClassifiedShadowFieldDiff[];
  highestTier: ShadowDiffTier;
}

export interface ShadowDiffClassification {
  blockingDiffCount: number;
  transitionalDiffCount: number;
  informationalDiffCount: number;
  canPromoteReadPrimary: boolean;
  promotionBlockers: string[];
  blocking_diff: ClassifiedShadowFieldDiffEntry[];
  transitional_diff: ClassifiedShadowFieldDiffEntry[];
  informational_diff: ClassifiedShadowFieldDiffEntry[];
  structural: ClassifiedShadowStructuralDiff[];
}

const TIER_RANK: Record<ShadowDiffTier, number> = {
  informational_diff: 0,
  transitional_diff: 1,
  blocking_diff: 2,
};

function maxTier(a: ShadowDiffTier, b: ShadowDiffTier): ShadowDiffTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/**
 * UUID local ausente ou legacy usado como fallback → transição (Ticket 1.11).
 */
export function isLocalUuidTransitional(localUuid: string, localLegacyId: string): boolean {
  const uuid = String(localUuid || '').trim();
  const legacyId = String(localLegacyId || '').trim();
  if (!uuid) return true;
  if (isCollaboratorUuid(uuid)) return false;
  if (uuid === legacyId) return true;
  return isCollaboratorLegacyId(uuid);
}

/** Campos cuja divergência não impede promoção read-primary (RC-01.4 / RC-03.1). */
export const INFORMATIONAL_SHADOW_FIELDS = new Set(['updated_at']);

/**
 * Classifica um field_diff individual conforme regras Ticket 1.11 / RC-03.1.
 */
export function classifyShadowFieldDiff(
  diff: CollaboratorShadowFieldDiff,
  context: { localUuid: string; localLegacyId: string },
): ClassifiedShadowFieldDiff {
  const { field, localValue, remoteValue } = diff;
  const localUuid = context.localUuid;
  const localLegacyId = context.localLegacyId;

  switch (field) {
    case 'uuid':
      if (isLocalUuidTransitional(localUuid, localLegacyId)) {
        return {
          field,
          localValue,
          remoteValue,
          tier: 'transitional_diff',
          reason: 'UUID local ausente ou legacy_id usado como fallback — IDB ainda não espelha collaborator_uuid.',
        };
      }
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'UUID local inválido ou divergente do remoto após espelhamento esperado.',
      };

    case 'legacy_id':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'legacy_id divergente — quebra chave de correlação IDB/Supabase.',
      };

    case 'tenant_id':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'tenant_id divergente — risco de isolamento multi-tenant.',
      };

    case 'email':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'email divergente — impacta identidade e acesso.',
      };

    case 'status':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'status divergente — impacta visibilidade e permissões RH.',
      };

    case 'agenda_enabled':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'agenda_enabled divergente — impacta agenda clínica.',
      };

    case 'nome':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'nome divergente — integridade de ficha RH (pode ser transição se seed staging renomeou).',
      };

    case 'cargo':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'cargo divergente — integridade de ficha RH.',
      };

    case 'categoria':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: 'categoria divergente — integridade de ficha RH.',
      };

    case 'updated_at':
      return {
        field,
        localValue,
        remoteValue,
        tier: 'informational_diff',
        reason:
          'updated_at divergente — metadado de sync; não bloqueia promoção (RC-01.4).',
      };

    default:
      return {
        field,
        localValue,
        remoteValue,
        tier: 'blocking_diff',
        reason: `campo "${field}" divergente — classificado como bloqueio por precaução.`,
      };
  }
}

function groupByTier(
  entries: ClassifiedShadowFieldDiffEntry[],
): Pick<ShadowDiffClassification, 'blocking_diff' | 'transitional_diff' | 'informational_diff'> {
  const blocking_diff: ClassifiedShadowFieldDiffEntry[] = [];
  const transitional_diff: ClassifiedShadowFieldDiffEntry[] = [];
  const informational_diff: ClassifiedShadowFieldDiffEntry[] = [];

  for (const entry of entries) {
    if (entry.highestTier === 'blocking_diff') blocking_diff.push(entry);
    else if (entry.highestTier === 'transitional_diff') transitional_diff.push(entry);
    else informational_diff.push(entry);
  }

  return { blocking_diff, transitional_diff, informational_diff };
}

function formatRefBlocker(ref: CollaboratorShadowRef, message: string): string {
  return `${message} (legacy_id=${ref.legacyId})`;
}

/**
 * Classifica resultado bruto de compareCollaborators para promoção RH_SUPABASE_READ_PRIMARY.
 */
export function classifyShadowCompareResult(
  details: CollaboratorShadowCompareResult,
): ShadowDiffClassification {
  const structural: ClassifiedShadowStructuralDiff[] = [];
  const promotionBlockers: string[] = [];
  let blockingDiffCount = 0;
  let transitionalDiffCount = 0;
  let informationalDiffCount = 0;

  const classifiedEntries: ClassifiedShadowFieldDiffEntry[] = [];

  const transitionalUuidLegacyIds = new Set<string>();

  for (const entry of details.field_diff) {
    const classifiedDiffs = entry.diffs.map((diff) =>
      classifyShadowFieldDiff(diff, {
        localUuid: entry.ref.uuid,
        localLegacyId: entry.ref.legacyId,
      }),
    );

    let highestTier: ShadowDiffTier = 'informational_diff';
    for (const cd of classifiedDiffs) {
      highestTier = maxTier(highestTier, cd.tier);
      if (cd.tier === 'blocking_diff') blockingDiffCount += 1;
      else if (cd.tier === 'transitional_diff') transitionalDiffCount += 1;
      else informationalDiffCount += 1;

      if (cd.field === 'uuid' && cd.tier === 'transitional_diff') {
        transitionalUuidLegacyIds.add(entry.ref.legacyId);
      }

      if (cd.tier === 'blocking_diff') {
        promotionBlockers.push(formatRefBlocker(entry.ref, cd.reason));
      }
    }

    classifiedEntries.push({
      ref: entry.ref,
      diffs: classifiedDiffs,
      highestTier,
    });
  }

  for (const entry of details.missing_local) {
    blockingDiffCount += 1;
    const reason = 'Registro ausente no IndexedDB local.';
    structural.push({
      tier: 'blocking_diff',
      kind: 'missing_local',
      reason,
      ref: entry.ref,
    });
    promotionBlockers.push(formatRefBlocker(entry.ref, reason));
  }

  for (const entry of details.missing_remote) {
    blockingDiffCount += 1;
    const reason = 'Registro ausente no Supabase remoto.';
    structural.push({
      tier: 'blocking_diff',
      kind: 'missing_remote',
      reason,
      ref: entry.ref,
    });
    promotionBlockers.push(formatRefBlocker(entry.ref, reason));
  }

  for (const entry of details.duplicate) {
    blockingDiffCount += 1;
    const reason = `Duplicata ${entry.key}=${entry.value} no lado ${entry.side}.`;
    structural.push({
      tier: 'blocking_diff',
      kind: 'duplicate',
      reason,
      side: entry.side,
    });
    promotionBlockers.push(reason);
  }

  for (const entry of details.invalid_legacy) {
    blockingDiffCount += 1;
    const reason = `legacy_id inválido no lado ${entry.side}.`;
    structural.push({
      tier: 'blocking_diff',
      kind: 'invalid_legacy',
      reason,
      side: entry.side,
      legacyId: entry.legacyId,
      uuid: entry.uuid,
    });
    promotionBlockers.push(`${reason} (legacy_id=${entry.legacyId || '?'})`);
  }

  for (const entry of details.invalid_uuid) {
    if (
      entry.side === 'local'
      && isLocalUuidTransitional(entry.uuid, entry.legacyId)
    ) {
      structural.push({
        tier: 'transitional_diff',
        kind: 'invalid_uuid_local_fallback',
        reason: 'UUID local ausente ou legacy usado como fallback — aguardando espelhamento collaborator_uuid.',
        side: entry.side,
        legacyId: entry.legacyId,
        uuid: entry.uuid,
      });
      if (!transitionalUuidLegacyIds.has(entry.legacyId)) {
        transitionalDiffCount += 1;
      }
      continue;
    }

    blockingDiffCount += 1;
    const reason = `UUID inválido no lado ${entry.side}.`;
    structural.push({
      tier: 'blocking_diff',
      kind: 'invalid_uuid',
      reason,
      side: entry.side,
      legacyId: entry.legacyId,
      uuid: entry.uuid,
    });
    promotionBlockers.push(`${reason} (legacy_id=${entry.legacyId || '?'})`);
  }

  if (details.counts.local !== details.counts.remote) {
    blockingDiffCount += 1;
    const reason = `Contagem divergente: local=${details.counts.local} remote=${details.counts.remote}.`;
    structural.push({
      tier: 'blocking_diff',
      kind: 'count_mismatch',
      reason,
    });
    promotionBlockers.push(reason);
  }

  const grouped = groupByTier(classifiedEntries);

  return {
    blockingDiffCount,
    transitionalDiffCount,
    informationalDiffCount,
    canPromoteReadPrimary: blockingDiffCount === 0,
    promotionBlockers: [...new Set(promotionBlockers)],
    ...grouped,
    structural,
  };
}
