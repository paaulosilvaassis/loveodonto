import { TREATMENT_TYPES, TREATMENT_TYPE_LABELS } from '../../../contracts/contractConstants.js';

const KEYWORD_MAP = [
  { type: TREATMENT_TYPES.PROTOCOLO_TOTAL, keys: ['protocolo total', 'all on 4', 'all-on-4', 'protocolo'] },
  { type: TREATMENT_TYPES.IMPLANTE_UNITARIO, keys: ['implante', 'implantes'] },
  { type: TREATMENT_TYPES.PROTESE_IMPLANTE, keys: ['prótese sobre implante', 'protese sobre implante', 'prótese fixa implante'] },
  { type: TREATMENT_TYPES.PROTESE_REMOVIVEL, keys: ['prótese removível', 'protese removivel', 'dentadura'] },
  { type: TREATMENT_TYPES.PROTESE_FLEXIVEL, keys: ['flexite', 'flexível', 'flexivel', 'nylon'] },
  { type: TREATMENT_TYPES.PONTE_FIXA, keys: ['ponte fixa', 'prótese fixa', 'protese fixa'] },
  { type: TREATMENT_TYPES.ORTODONTIA, keys: ['ortodontia', 'aparelho', 'alinhador', 'invisalign'] },
  { type: TREATMENT_TYPES.LENTE_PORCELANA, keys: ['lente porcelana', 'lente de contato', 'lentes porcelana'] },
  { type: TREATMENT_TYPES.LENTE_RESINA, keys: ['lente resina', 'faceta resina'] },
  { type: TREATMENT_TYPES.CLAREAMENTO, keys: ['clareamento', 'whitening'] },
  { type: TREATMENT_TYPES.ENDODONTIA, keys: ['canal', 'endodontia', 'tratamento de canal'] },
  { type: TREATMENT_TYPES.EXTRACAO, keys: ['extração', 'extracao', 'exodontia'] },
  { type: TREATMENT_TYPES.CIRURGIA, keys: ['cirurgia', 'enxerto', 'siso', 'terceiro molar'] },
  { type: TREATMENT_TYPES.PERIODONTIA, keys: ['periodontia', 'gengiva', 'raspagem', 'periodontal'] },
  { type: TREATMENT_TYPES.HARMONIZACAO, keys: ['harmonização', 'harmonizacao', 'botox', 'preenchimento'] },
  { type: TREATMENT_TYPES.RESTAURACAO, keys: ['restauração', 'restauracao', 'obturação'] },
];

export function detectTreatmentType({ planName = '', procedures = [] }) {
  const blob = [
    planName,
    ...(procedures || []).map((p) => `${p.name || ''} ${p.category || ''}`),
  ].join(' ').toLowerCase();

  for (const entry of KEYWORD_MAP) {
    if (entry.keys.some((k) => blob.includes(k))) {
      return entry.type;
    }
  }
  return null;
}

export function getTreatmentTypeLabel(type) {
  return type ? (TREATMENT_TYPE_LABELS[type] || type) : 'Tratamento odontológico';
}
