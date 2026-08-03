/**
 * @module domain-events/staging-activation/stagingTenantSelection
 * @description Tenant Selection Contract — Phase 8.6.
 * Sem IDs remotos inventados. Sem seleção automática all-tenants.
 */

import type { StagingTenantSelectionContract } from './stagingActivationTypes.js';

export interface StagingTenantSelectionInput {
  pilotTenantIds?: readonly string[];
  controlTenantIds?: readonly string[];
  excludedTenantIds?: readonly string[];
  /** Tenant IDs explicitamente permitidos pelo ambiente (opcional). */
  allowedTenantIds?: readonly string[];
  /** Proíbe marcadores óbvios de produção. */
  rejectProductionMarkers?: boolean;
}

const PROD_MARKERS = [/prod/i, /production/i];

function hasDupes(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

function hasProductionMarker(id: string): boolean {
  return PROD_MARKERS.some((re) => re.test(id));
}

/**
 * Seleção controlada. Lista vazia de piloto = inválido para execução futura,
 * mas contrato estrutural pode ser montado vazio com valid=false.
 */
export function buildStagingTenantSelection(
  input: StagingTenantSelectionInput = {},
): StagingTenantSelectionContract {
  const pilot = [...(input.pilotTenantIds || [])];
  const control = [...(input.controlTenantIds || [])];
  const excluded = [...(input.excludedTenantIds || [])];
  const all = [...pilot, ...control];
  const rejectProd = input.rejectProductionMarkers !== false;

  let valid = true;
  let reason: string | null = null;

  if (pilot.length === 0) {
    valid = false;
    reason = 'pilotTenantIds vazio — mínimo de um tenant piloto para ativação futura';
  } else if (hasDupes(all) || hasDupes(pilot) || hasDupes(control)) {
    valid = false;
    reason = 'tenant duplicado na seleção';
  } else if (pilot.some((id) => control.includes(id))) {
    valid = false;
    reason = 'tenant não pode ser piloto e controle simultaneamente';
  } else if (rejectProd && all.some(hasProductionMarker)) {
    valid = false;
    reason = 'tenant com marcador de produção proibido';
  } else if (input.allowedTenantIds && input.allowedTenantIds.length > 0) {
    const allowed = new Set(input.allowedTenantIds);
    if (all.some((id) => !allowed.has(id))) {
      valid = false;
      reason = 'tenant não autorizado pelo environment.allowedTenantIds';
    }
  }

  // Isolamento contratual: excluded não pode estar em pilot/control
  if (valid && excluded.some((id) => all.includes(id))) {
    valid = false;
    reason = 'tenant excluído presente em piloto/controle';
  }

  return Object.freeze({
    pilotTenantIds: Object.freeze(pilot),
    controlTenantIds: Object.freeze(control),
    excludedTenantIds: Object.freeze(excluded),
    valid,
    reason,
  });
}

/** Seleção estrutural vazia (Phase 8.6 — sem IDs reais). */
export function buildEmptyStructuralTenantSelection(): StagingTenantSelectionContract {
  return buildStagingTenantSelection({});
}
