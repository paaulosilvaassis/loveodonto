/**
 * Monta contexto e substitui hashtags (#tag) em HTML de contratos.
 */
import {
  resolveContractVariables,
  applyContractHashtags,
} from '../contracts/contractVariableResolver.js';
import { freezeProcedureRows } from '../contracts/procedureSnapshotRows.js';

export { applyContractHashtags as applyHashtags };
export { resolveContractVariables, validateResolvedVariables, findUnresolvedTagsInHtml } from '../contracts/contractVariableResolver.js';

/** @deprecated Use resolveContractVariables — mantido para compatibilidade */
export function buildContractContext(params) {
  const { map, meta, procedures, planName } = resolveContractVariables(params);
  return {
    ...map,
    __meta: {
      includeOrthodontics: meta.includeOrthodontics,
      hasFinancialResponsible: meta.partyModel === 'with_responsible',
      partyModel: meta.partyModel,
      treatmentTypes: meta.treatmentTypes,
      missing: meta.missing,
      procedureRows: freezeProcedureRows(procedures || []),
      planName: planName || '',
    },
  };
}

/** Filtra blocos por conditionType e paciente/orçamento */
export function filterBlocksForRender(blocks, contextMap) {
  const meta = contextMap.__meta || {};
  const withResponsible = meta.partyModel === 'with_responsible' || Boolean(meta.hasFinancialResponsible);
  const ortho = Boolean(meta.includeOrthodontics);
  const list = [...(blocks || [])].filter((b) => b.isActive !== false);
  return list.filter((b) => {
    const c = b.conditionType || 'always';
    if (c === 'always') return true;
    if (c === 'parties_no_financial') return !withResponsible;
    if (c === 'parties_with_financial') return withResponsible;
    if (c === 'optional_orthodontics') return ortho;
    return true;
  }).sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
}
