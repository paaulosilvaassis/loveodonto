import { getToothMetadata } from './identifiers.js';
import { isValidConditionCode } from './conditions.js';
import { getApplicableSurfaces } from './surfaces.js';

export const MAPPING_STATUS = Object.freeze({
  exact: 'exact',
  normalized: 'normalized',
  ambiguous: 'ambiguous',
  unsupported: 'unsupported',
});

const V1_CONDITION_MAP = Object.freeze({
  higido: 'healthy',
  carie: 'caries',
  restauracao: 'restoration',
  ausente: 'missing',
  extracao_indicada: 'extraction_indicated',
  endodontia: 'endodontic_treatment',
  coroa_protese: 'crown_or_prosthesis',
  implante: 'implant',
  fratura: 'fracture',
});

const V2_STATUS_MAP = Object.freeze({
  HIGIDO: 'healthy',
  CARIE: 'caries',
  RESTAURACAO: 'restoration',
  AUSENTE: 'missing',
  SELANTE: 'sealant',
  EXTRACAO: 'extraction_indicated',
});

const V1_SURFACE_CODES = Object.freeze(['M', 'D', 'V', 'L', 'O']);
const V2_SURFACE_CODES = Object.freeze(['O', 'M', 'D', 'V', 'L', 'P']);
const V2_IMPLANT_TOKENS = Object.freeze(['implant', 'implante', 'IMPLANTE']);

function freezeResult(value, status, warnings) {
  return Object.freeze({
    value,
    status,
    warnings: Object.freeze(warnings.map((item) => Object.freeze({ ...item }))),
  });
}

function asToken(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function mapConditionFromTable(value, table, exactKey) {
  const token = asToken(value);
  if (!token) return freezeResult(null, MAPPING_STATUS.unsupported, [{
    code: 'UNKNOWN_LEGACY_CONDITION',
    message: 'Valor de condição legado inválido.',
  }]);
  const lookupKey = exactKey(token);
  const canonical = table[lookupKey];
  if (!canonical || !isValidConditionCode(canonical)) {
    return freezeResult(null, MAPPING_STATUS.unsupported, [{
      code: 'UNKNOWN_LEGACY_CONDITION',
      message: 'Condição legada sem mapeamento canônico.',
      received: token,
    }]);
  }
  const status = token === lookupKey ? MAPPING_STATUS.exact : MAPPING_STATUS.normalized;
  return freezeResult(canonical, status, []);
}

export function mapLegacyV1ConditionToCanonical(value) {
  return mapConditionFromTable(value, V1_CONDITION_MAP, (token) => token.toLowerCase());
}

export function mapLegacyV2ConditionToCanonical(value) {
  if (value === true || (typeof value === 'string' && V2_IMPLANT_TOKENS.includes(value.trim()))) {
    const warnings = [{
      code: 'LEGACY_V2_IMPLANT_FLAG',
      message: 'Flag de implante do v2 mapeada para a condição canônica implant.',
    }];
    return freezeResult('implant', MAPPING_STATUS.normalized, warnings);
  }
  const token = asToken(value);
  if (!token) {
    return freezeResult(null, MAPPING_STATUS.unsupported, [{
      code: 'UNKNOWN_LEGACY_CONDITION',
      message: 'Valor de condição legado inválido.',
    }]);
  }
  const lookupKey = token.toUpperCase();
  const canonical = V2_STATUS_MAP[lookupKey];
  if (!canonical) {
    return freezeResult(null, MAPPING_STATUS.unsupported, [{
      code: 'UNKNOWN_LEGACY_CONDITION',
      message: 'Condição legada sem mapeamento canônico.',
      received: token,
    }]);
  }
  if (lookupKey === 'EXTRACAO') {
    return freezeResult(canonical, MAPPING_STATUS.ambiguous, [{
      code: 'LEGACY_V2_EXTRACTION_AMBIGUOUS',
      message: 'EXTRACAO no v2 é ambígua entre extração indicada e extração já concluída; não foi interpretada como ausente.',
      received: token,
    }]);
  }
  const status = token === lookupKey ? MAPPING_STATUS.exact : MAPPING_STATUS.normalized;
  return freezeResult(canonical, status, []);
}

function matchLegacySurface(value, allowed) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const code = trimmed.toUpperCase();
  if (!allowed.includes(code)) return null;
  return { code, exact: trimmed === value && trimmed === code };
}

function mapLegacySurface(toothId, value, allowed) {
  const meta = getToothMetadata(toothId);
  if (!meta) {
    return freezeResult(null, MAPPING_STATUS.unsupported, [{
      code: 'INVALID_TOOTH_ID',
      message: 'Identificador FDI inválido.',
    }]);
  }
  const matched = matchLegacySurface(value, allowed);
  if (!matched) {
    return freezeResult(null, MAPPING_STATUS.unsupported, [{
      code: 'INVALID_SURFACE_CODE',
      message: 'Superfície legada fora do catálogo de origem.',
      received: value,
    }]);
  }
  return { meta, matched };
}

function applyAnteriorOcclusal(meta, code, warnings) {
  if (code !== 'O' || meta.positionFromMidline > 3) return code;
  warnings.push({
    code: 'LEGACY_O_TO_I',
    message: `Oclusal/incisal legado convertido para I no dente anterior ${meta.fdi}.`,
    toothId: meta.fdi,
    from: 'O',
    to: 'I',
  });
  return 'I';
}

export function mapLegacyV1SurfaceToCanonical(toothId, value) {
  const resolved = mapLegacySurface(toothId, value, V1_SURFACE_CODES);
  if (resolved.value === null && resolved.status) return resolved;
  const { meta, matched } = resolved;
  const warnings = [];
  let code = matched.code;
  if (code === 'L' && meta.arch === 'maxillary') {
    warnings.push({
      code: 'LEGACY_L_TO_P',
      message: `L do v1 no dente maxilar ${meta.fdi} convertido para palatina P.`,
      toothId: meta.fdi,
      from: 'L',
      to: 'P',
    });
    code = 'P';
  }
  code = applyAnteriorOcclusal(meta, code, warnings);
  const applicable = getApplicableSurfaces(meta.fdi);
  if (!applicable.includes(code)) {
    return freezeResult(null, MAPPING_STATUS.unsupported, [{
      code: 'SURFACE_NOT_APPLICABLE',
      message: `Superfície ${matched.code} do v1 não é aplicável ao dente ${meta.fdi}.`,
      toothId: meta.fdi,
      from: matched.code,
    }]);
  }
  const status = warnings.length > 0 || !matched.exact
    ? MAPPING_STATUS.normalized
    : MAPPING_STATUS.exact;
  return freezeResult(code, status, warnings);
}

export function mapLegacyV2SurfaceToCanonical(toothId, value) {
  const resolved = mapLegacySurface(toothId, value, V2_SURFACE_CODES);
  if (resolved.value === null && resolved.status) return resolved;
  const { meta, matched } = resolved;
  const warnings = [];
  if (matched.code === 'L' && meta.arch === 'maxillary') {
    return freezeResult(null, MAPPING_STATUS.ambiguous, [{
      code: 'LEGACY_V2_LINGUAL_ON_MAXILLA',
      message: `L no v2 permanece distinto de P; o dente maxilar ${meta.fdi} não permite conversão silenciosa.`,
      toothId: meta.fdi,
      from: 'L',
    }]);
  }
  if (matched.code === 'P' && meta.arch === 'mandibular') {
    return freezeResult(null, MAPPING_STATUS.ambiguous, [{
      code: 'LEGACY_V2_PALATAL_ON_MANDIBLE',
      message: `P no v2 permanece distinto de L; o dente mandibular ${meta.fdi} não permite conversão silenciosa.`,
      toothId: meta.fdi,
      from: 'P',
    }]);
  }
  const code = applyAnteriorOcclusal(meta, matched.code, warnings);
  const applicable = getApplicableSurfaces(meta.fdi);
  if (!applicable.includes(code)) {
    return freezeResult(null, MAPPING_STATUS.unsupported, [{
      code: 'SURFACE_NOT_APPLICABLE',
      message: `Superfície ${matched.code} do v2 não é aplicável ao dente ${meta.fdi}.`,
      toothId: meta.fdi,
      from: matched.code,
    }]);
  }
  const status = warnings.length > 0
    ? MAPPING_STATUS.normalized
    : (matched.exact ? MAPPING_STATUS.exact : MAPPING_STATUS.normalized);
  return freezeResult(code, status, warnings);
}
