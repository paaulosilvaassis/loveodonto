export const TERMINOLOGY_VERSION = '1.0.0';

export const CONDITION_CATEGORIES = Object.freeze([
  'health',
  'pathology',
  'existing_treatment',
  'anatomical_status',
  'periodontal',
  'observation',
]);

export const CONDITION_SCOPES = Object.freeze(['tooth', 'surface', 'tooth_or_surface']);

const CONDITION_ROWS = Object.freeze([
  Object.freeze(['healthy', 'Hígido', 'health', 'tooth']),
  Object.freeze(['caries', 'Cárie', 'pathology', 'tooth_or_surface']),
  Object.freeze(['restoration', 'Restauração', 'existing_treatment', 'tooth_or_surface']),
  Object.freeze(['missing', 'Ausente', 'anatomical_status', 'tooth']),
  Object.freeze(['extraction_indicated', 'Extração indicada', 'anatomical_status', 'tooth']),
  Object.freeze(['endodontic_treatment', 'Tratamento endodôntico', 'existing_treatment', 'tooth']),
  Object.freeze(['crown_or_prosthesis', 'Coroa ou prótese', 'existing_treatment', 'tooth']),
  Object.freeze(['implant', 'Implante', 'existing_treatment', 'tooth']),
  Object.freeze(['fracture', 'Fratura', 'pathology', 'tooth_or_surface']),
  Object.freeze(['sealant', 'Selante', 'existing_treatment', 'tooth_or_surface']),
  Object.freeze(['residual_root', 'Raiz residual', 'anatomical_status', 'tooth']),
  Object.freeze(['unerupted', 'Não irrompido', 'anatomical_status', 'tooth']),
  Object.freeze(['impacted', 'Impactado', 'anatomical_status', 'tooth']),
  Object.freeze(['wear', 'Desgaste', 'pathology', 'tooth_or_surface']),
  Object.freeze(['abrasion', 'Abrasão', 'pathology', 'tooth_or_surface']),
  Object.freeze(['erosion', 'Erosão', 'pathology', 'tooth_or_surface']),
  Object.freeze(['abfraction', 'Abfração', 'pathology', 'tooth_or_surface']),
  Object.freeze(['mobility', 'Mobilidade', 'periodontal', 'tooth']),
  Object.freeze(['periapical_lesion', 'Lesão periapical', 'pathology', 'tooth']),
  Object.freeze(['gingival_recession', 'Recessão gengival', 'periodontal', 'tooth']),
  Object.freeze(['observation', 'Observação', 'observation', 'tooth_or_surface']),
]);

function toDefinition(row) {
  return Object.freeze({
    code: row[0],
    label: row[1],
    category: row[2],
    scope: row[3],
    active: true,
    terminologyVersion: TERMINOLOGY_VERSION,
    externalTerminology: null,
  });
}

export const CONDITION_CATALOG = Object.freeze(CONDITION_ROWS.map(toDefinition));

export const CONDITION_CODES = Object.freeze(CONDITION_CATALOG.map((item) => item.code));

const CONDITION_BY_CODE = Object.freeze(
  Object.fromEntries(CONDITION_CATALOG.map((item) => [item.code, item])),
);

export function getConditionDefinition(code) {
  if (typeof code !== 'string' || !CONDITION_BY_CODE[code]) return null;
  return Object.freeze({ ...CONDITION_BY_CODE[code] });
}

export function isValidConditionCode(code) {
  return getConditionDefinition(code) !== null;
}

export function getConditionsByScope(scope) {
  if (typeof scope !== 'string' || !CONDITION_SCOPES.includes(scope)) return null;
  return CONDITION_CATALOG
    .filter((item) => item.scope === scope || (scope !== 'tooth_or_surface' && item.scope === 'tooth_or_surface'))
    .map((item) => Object.freeze({ ...item }));
}
