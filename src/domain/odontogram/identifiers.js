const PERMANENT_CLASS_BY_POSITION = Object.freeze({
  1: 'central_incisor',
  2: 'lateral_incisor',
  3: 'canine',
  4: 'first_premolar',
  5: 'second_premolar',
  6: 'first_molar',
  7: 'second_molar',
  8: 'third_molar',
});

const PRIMARY_CLASS_BY_POSITION = Object.freeze({
  1: 'central_incisor',
  2: 'lateral_incisor',
  3: 'canine',
  4: 'first_molar',
  5: 'second_molar',
});

const QUADRANT_META = Object.freeze({
  1: Object.freeze({ dentition: 'permanent', arch: 'maxillary', side: 'right' }),
  2: Object.freeze({ dentition: 'permanent', arch: 'maxillary', side: 'left' }),
  3: Object.freeze({ dentition: 'permanent', arch: 'mandibular', side: 'left' }),
  4: Object.freeze({ dentition: 'permanent', arch: 'mandibular', side: 'right' }),
  5: Object.freeze({ dentition: 'primary', arch: 'maxillary', side: 'right' }),
  6: Object.freeze({ dentition: 'primary', arch: 'maxillary', side: 'left' }),
  7: Object.freeze({ dentition: 'primary', arch: 'mandibular', side: 'left' }),
  8: Object.freeze({ dentition: 'primary', arch: 'mandibular', side: 'right' }),
});

/**
 * Ordem canônica permanente (FDI/ISO 3950): Q1 → Q2 → Q4 → Q3.
 */
export const PERMANENT_FDI_TOOTH_IDS = Object.freeze([
  '18', '17', '16', '15', '14', '13', '12', '11',
  '21', '22', '23', '24', '25', '26', '27', '28',
  '48', '47', '46', '45', '44', '43', '42', '41',
  '31', '32', '33', '34', '35', '36', '37', '38',
]);

/**
 * Ordem canônica decídua (FDI/ISO 3950): Q5 → Q6 → Q8 → Q7.
 */
export const PRIMARY_FDI_TOOTH_IDS = Object.freeze([
  '55', '54', '53', '52', '51',
  '61', '62', '63', '64', '65',
  '85', '84', '83', '82', '81',
  '71', '72', '73', '74', '75',
]);

/**
 * Dentição mista: permanentes na ordem canônica, depois decíduos na ordem canônica.
 * Não infere erupção nem idade.
 */
export const MIXED_FDI_TOOTH_IDS = Object.freeze([
  ...PERMANENT_FDI_TOOTH_IDS,
  ...PRIMARY_FDI_TOOTH_IDS,
]);

export const DENTITION_STAGES = Object.freeze(['permanent', 'primary', 'mixed']);

const STAGE_TEETH = Object.freeze({
  permanent: PERMANENT_FDI_TOOTH_IDS,
  primary: PRIMARY_FDI_TOOTH_IDS,
  mixed: MIXED_FDI_TOOTH_IDS,
});

function buildMetadata(fdi) {
  const quadrant = Number(fdi[0]);
  const positionFromMidline = Number(fdi[1]);
  const quadrantMeta = QUADRANT_META[quadrant];
  const classMap = quadrantMeta.dentition === 'permanent'
    ? PERMANENT_CLASS_BY_POSITION
    : PRIMARY_CLASS_BY_POSITION;
  return Object.freeze({
    fdi,
    dentition: quadrantMeta.dentition,
    quadrant,
    arch: quadrantMeta.arch,
    side: quadrantMeta.side,
    positionFromMidline,
    toothClass: classMap[positionFromMidline],
  });
}

const TOOTH_METADATA_BY_ID = Object.freeze(
  Object.fromEntries(
    [...PERMANENT_FDI_TOOTH_IDS, ...PRIMARY_FDI_TOOTH_IDS].map((fdi) => [fdi, buildMetadata(fdi)]),
  ),
);

const VALID_FDI_IDS = new Set(Object.keys(TOOTH_METADATA_BY_ID));

export function normalizeFdiToothId(value) {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) return null;
    const digits = String(value);
    if (!/^\d{2}$/.test(digits)) return null;
    return VALID_FDI_IDS.has(digits) ? digits : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d{2}$/.test(trimmed)) return null;
    return VALID_FDI_IDS.has(trimmed) ? trimmed : null;
  }
  return null;
}

export function isValidFdiToothId(value) {
  return normalizeFdiToothId(value) !== null;
}

export function isPermanentTooth(value) {
  const fdi = normalizeFdiToothId(value);
  return fdi !== null && TOOTH_METADATA_BY_ID[fdi].dentition === 'permanent';
}

export function isPrimaryTooth(value) {
  const fdi = normalizeFdiToothId(value);
  return fdi !== null && TOOTH_METADATA_BY_ID[fdi].dentition === 'primary';
}

export function getToothMetadata(value) {
  const fdi = normalizeFdiToothId(value);
  if (!fdi) return null;
  return Object.freeze({ ...TOOTH_METADATA_BY_ID[fdi] });
}

export function getTeethForDentitionStage(stage) {
  if (typeof stage !== 'string' || !STAGE_TEETH[stage]) return null;
  return STAGE_TEETH[stage].slice();
}
