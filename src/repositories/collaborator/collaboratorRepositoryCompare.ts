/**

 * @module repositories/collaborator/collaboratorRepositoryCompare

 * @description Diff IDB vs Supabase para shadow read / QA.

 */



import type {

  CollaboratorCompareDiff,

  CollaboratorCompareResult,

  CollaboratorCore,

} from './collaboratorTypes.js';

import {

  compareCollaborators,

  type CollaboratorShadowCompareResult,

} from './collaboratorShadowValidation.js';



export type { CollaboratorShadowCompareResult } from './collaboratorShadowValidation.js';



function mapShadowToLegacyDiffs(

  shadow: CollaboratorShadowCompareResult,

): CollaboratorCompareDiff[] {

  const diffs: CollaboratorCompareDiff[] = [];



  for (const entry of shadow.field_diff) {

    for (const fieldDiff of entry.diffs) {

      diffs.push({

        ref: entry.ref.legacyId,

        field: fieldDiff.field,

        indexedDbValue: fieldDiff.localValue,

        supabaseValue: fieldDiff.remoteValue,

      });

    }

  }



  return diffs;

}



export function mapShadowCompareToLegacyResult(

  shadow: CollaboratorShadowCompareResult,

): CollaboratorCompareResult {

  return {

    tenantId: shadow.tenantId,

    comparedAt: shadow.comparedAt,

    matchCount: shadow.match.length,

    mismatchCount: mapShadowToLegacyDiffs(shadow).length,

    onlyInIndexedDb: shadow.missing_remote.map((e) => e.ref.legacyId),

    onlyInSupabase: shadow.missing_local.map((e) => e.ref.legacyId),

    diffs: mapShadowToLegacyDiffs(shadow),

    shadow,

  };

}



/** @deprecated Preferir compareCollaborators + mapShadowCompareToLegacyResult */

export function buildCollaboratorCompareResult(

  tenantId: string,

  idbItems: CollaboratorCore[],

  supabaseItems: CollaboratorCore[],

): CollaboratorCompareResult {

  const shadow = compareCollaborators(tenantId, idbItems, supabaseItems);

  return mapShadowCompareToLegacyResult(shadow);

}


