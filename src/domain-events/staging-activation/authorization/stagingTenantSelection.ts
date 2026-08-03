/**
 * @module domain-events/staging-activation/authorization/stagingTenantSelection
 * Phase 8.8 — formulário de seleção de tenants. Sem inventar IDs.
 */

import type { StagingTenantSelectionForm } from './stagingAuthorizationTypes.js';

const FORBIDDEN_ALL = /^(all|\*|everyone|tod[oa]s?)$/i;

export interface StagingTenantSelectionFormInput {
  pilotTenantIds?: readonly string[];
  controlTenantIds?: readonly string[];
  excludedTenantIds?: readonly string[];
  selectionReason?: string | null;
  selectedBy?: string | null;
  selectedAt?: string | null;
  dataSensitivityReviewed?: boolean;
  tenantOwnersNotified?: boolean;
  allowedTenantIds?: readonly string[];
}

export function buildStagingTenantSelectionForm(
  input: StagingTenantSelectionFormInput = {},
): StagingTenantSelectionForm {
  const pilot = [...(input.pilotTenantIds || [])];
  const control = [...(input.controlTenantIds || [])];
  const excluded = [...(input.excludedTenantIds || [])];
  const all = [...pilot, ...control];
  const blockers: string[] = [];

  if (pilot.length === 0) blockers.push('mínimo de um tenant piloto ausente');
  if (new Set(all).size !== all.length || new Set(pilot).size !== pilot.length) {
    blockers.push('duplicidade de tenant');
  }
  if (pilot.some((id) => control.includes(id))) {
    blockers.push('piloto e controle se sobrepõem');
  }
  if (excluded.some((id) => all.includes(id))) {
    blockers.push('excluded presente em piloto/controle');
  }
  if (all.some((id) => FORBIDDEN_ALL.test(id))) {
    blockers.push('all-tenants / * / everyone rejeitado');
  }
  if (input.allowedTenantIds && input.allowedTenantIds.length > 0) {
    const allowed = new Set(input.allowedTenantIds);
    if (all.some((id) => !allowed.has(id))) {
      blockers.push('tenant fora do escopo autorizado');
    }
  }

  return Object.freeze({
    pilotTenantIds: Object.freeze(pilot),
    controlTenantIds: Object.freeze(control),
    excludedTenantIds: Object.freeze(excluded),
    selectionReason: input.selectionReason ?? null,
    selectedBy: input.selectedBy ?? null,
    selectedAt: input.selectedAt ?? null,
    dataSensitivityReviewed: Boolean(input.dataSensitivityReviewed),
    tenantOwnersNotified: Boolean(input.tenantOwnersNotified),
    valid: blockers.length === 0,
    blockers: Object.freeze(blockers),
  });
}

export function buildEmptyStagingTenantSelectionForm(): StagingTenantSelectionForm {
  return buildStagingTenantSelectionForm({});
}
