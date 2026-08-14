import { getToothMetadata } from './identifiers.js';

export const SURFACE_CODES = Object.freeze(['M', 'D', 'V', 'L', 'P', 'O', 'I']);

export const SURFACE_NAMES = Object.freeze({
  M: 'mesial',
  D: 'distal',
  V: 'vestibular',
  L: 'lingual',
  P: 'palatal',
  O: 'occlusal',
  I: 'incisal',
});

export const SURFACE_LABELS = Object.freeze({
  M: 'Mesial',
  D: 'Distal',
  V: 'Vestibular',
  L: 'Lingual',
  P: 'Palatina',
  O: 'Oclusal',
  I: 'Incisal',
});

const SURFACE_CODE_SET = new Set(SURFACE_CODES);

function freezeWarning(warning) {
  return Object.freeze({ ...warning });
}

export function normalizeSurfaceCode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (!SURFACE_CODE_SET.has(normalized)) return null;
  return normalized;
}

export function isValidSurfaceCode(value) {
  return normalizeSurfaceCode(value) !== null;
}

export function getApplicableSurfaces(toothId) {
  const meta = getToothMetadata(toothId);
  if (!meta) return null;
  const inner = meta.arch === 'maxillary' ? 'P' : 'L';
  const biting = meta.positionFromMidline <= 3 ? 'I' : 'O';
  return Object.freeze(['M', 'D', 'V', inner, biting]);
}

export function validateSurfaceForTooth(toothId, surface) {
  const meta = getToothMetadata(toothId);
  const code = normalizeSurfaceCode(surface);
  if (!meta) {
    return Object.freeze({
      valid: false,
      code,
      warnings: Object.freeze([
        freezeWarning({ code: 'INVALID_TOOTH_ID', message: 'Identificador FDI inválido.' }),
      ]),
    });
  }
  if (!code) {
    return Object.freeze({
      valid: false,
      code: null,
      warnings: Object.freeze([
        freezeWarning({ code: 'INVALID_SURFACE_CODE', message: 'Código de superfície inválido.' }),
      ]),
    });
  }
  const applicable = getApplicableSurfaces(meta.fdi);
  if (!applicable.includes(code)) {
    return Object.freeze({
      valid: false,
      code,
      warnings: Object.freeze([
        freezeWarning({
          code: 'SURFACE_NOT_APPLICABLE',
          message: `Superfície ${code} não se aplica ao dente ${meta.fdi}.`,
          toothId: meta.fdi,
          surface: code,
        }),
      ]),
    });
  }
  return Object.freeze({ valid: true, code, warnings: Object.freeze([]) });
}

function listStatus({ hadInvalid, hadDuplicate, hadReorder, hadCodeNormalize, keptCount, inputLength }) {
  if (hadInvalid && keptCount === 0 && inputLength > 0) return 'unsupported';
  if (hadInvalid || hadDuplicate || hadReorder || hadCodeNormalize) return 'normalized';
  return 'exact';
}

function collectSurfaceCodes(toothId, surfaces, applicableSet) {
  const warnings = [];
  const seen = new Set();
  const firstSeenOrder = [];
  let hadInvalid = false;
  let hadDuplicate = false;
  let hadCodeNormalize = false;

  for (const item of surfaces) {
    const code = normalizeSurfaceCode(item);
    if (typeof item === 'string' && code && item !== code) hadCodeNormalize = true;
    if (!code || !applicableSet.has(code)) {
      hadInvalid = true;
      warnings.push(freezeWarning({
        code: code ? 'SURFACE_NOT_APPLICABLE' : 'INVALID_SURFACE_CODE',
        message: code
          ? `Superfície ${code} não se aplica ao dente ${toothId} e não foi convertida.`
          : 'Código de superfície rejeitado.',
        received: item,
        toothId,
        surface: code || undefined,
      }));
      continue;
    }
    if (seen.has(code)) {
      hadDuplicate = true;
      continue;
    }
    seen.add(code);
    firstSeenOrder.push(code);
  }

  return { warnings, seen, firstSeenOrder, hadInvalid, hadDuplicate, hadCodeNormalize };
}

export function normalizeSurfaceList(toothId, surfaces) {
  const meta = getToothMetadata(toothId);
  if (!meta) {
    return Object.freeze({
      value: null,
      status: 'unsupported',
      warnings: Object.freeze([
        freezeWarning({ code: 'INVALID_TOOTH_ID', message: 'Identificador FDI inválido.' }),
      ]),
    });
  }
  if (!Array.isArray(surfaces)) {
    return Object.freeze({
      value: null,
      status: 'unsupported',
      warnings: Object.freeze([
        freezeWarning({ code: 'INVALID_SURFACE_LIST', message: 'Lista de superfícies inválida.' }),
      ]),
    });
  }

  const applicable = getApplicableSurfaces(meta.fdi);
  const collected = collectSurfaceCodes(meta.fdi, surfaces, new Set(applicable));
  const value = applicable.filter((code) => collected.seen.has(code));
  const hadReorder = collected.firstSeenOrder.some((code, index) => value[index] !== code);

  return Object.freeze({
    value: Object.freeze(value),
    status: listStatus({
      hadInvalid: collected.hadInvalid,
      hadDuplicate: collected.hadDuplicate,
      hadReorder,
      hadCodeNormalize: collected.hadCodeNormalize,
      keptCount: value.length,
      inputLength: surfaces.length,
    }),
    warnings: Object.freeze(collected.warnings),
  });
}
