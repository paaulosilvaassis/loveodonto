import {
  resolveContractVariables,
  validateResolvedVariables,
  findUnresolvedTagsInHtml,
  isEmptyVariableValue,
} from '../contracts/contractVariableResolver.js';
import { validateRequiredTcles, resolveRequiredTcles } from '../contracts/contractTcleRegistry.js';
import { getTcleDocumentHint } from './clinicalTcleAttachmentService.js';
import { getConditionalClausesForTreatments } from '../contracts/contractConditionalClauses.js';
import { PARTY_MODEL } from '../contracts/contractQualificationTemplates.js';

export function validateContractGeneration(input = {}) {
  const {
    quoteSource,
    quoteId,
    patientId,
    currentUser,
    contractNumber,
    contractDate,
    htmlPreview = '',
    attachedTcleIds = [],
    strict = false,
  } = input;

  const resolved = resolveContractVariables({
    quoteSource,
    quoteId,
    patientId,
    currentUser,
    contractNumber,
    contractDate,
  });

  const missing = [...resolved.missing];
  const warnings = [];

  if (resolved.meta.valueMismatch) {
    warnings.push('Divergência entre valor do orçamento e condição financeira escolhida.');
  }

  const unresolvedInHtml = htmlPreview ? findUnresolvedTagsInHtml(htmlPreview, resolved.map) : [];
  for (const tag of unresolvedInHtml) {
    if (!missing.some((m) => m.tag === tag)) {
      missing.push({ tag, label: `Variável não resolvida no texto: ${tag}`, group: 'template' });
    }
  }

  const tcleCheck = strict
    ? validateRequiredTcles(resolved.meta.treatmentTypes, attachedTcleIds)
    : { required: resolveRequiredTcles(resolved.meta.treatmentTypes), missing: [], ok: true };
  if (strict) {
    for (const tcle of tcleCheck.missing) {
      missing.push({
        tag: `tcle:${tcle.id}`,
        label: `TCLE obrigatório: ${tcle.title}`,
        hint: getTcleDocumentHint(tcle.id),
        group: 'tcle',
        critical: true,
      });
    }
  }

  if (strict && resolved.meta.treatmentTypes.includes('ortodontia') && isEmptyVariableValue(resolved.map['#manutencaoMeses'])) {
    missing.push({
      tag: '#manutencaoMeses',
      label: 'Meses de manutenção ortodôntica',
      group: 'contrato',
      critical: true,
    });
  }

  const conditionalClauses = getConditionalClausesForTreatments(resolved.meta.treatmentTypes);

  return {
    ok: missing.filter((m) => !m.warning).length === 0,
    missing,
    warnings,
    partyModel: resolved.party?.model || PARTY_MODEL.PATIENT_ONLY,
    partyLabel: resolved.party?.model === PARTY_MODEL.WITH_RESPONSIBLE
      ? 'Paciente com responsável'
      : 'Paciente sem responsável',
    map: resolved.map,
    meta: resolved.meta,
    conditionalClauses,
    requiredTcles: tcleCheck.required,
  };
}

export function getContractReadinessChecklist(input = {}) {
  const result = validateContractGeneration({ ...input, strict: input.strict ?? true });
  const groups = {
    clinica: [],
    paciente: [],
    dependente: [],
    responsavel: [],
    contrato: [],
    tcle: [],
    template: [],
  };

  for (const item of result.missing) {
    const key = groups[item.group] ? item.group : 'contrato';
    groups[key].push(item);
  }

  return {
    ...result,
    groups,
    canGenerate: result.ok,
  };
}

export { validateResolvedVariables, resolveContractVariables };
