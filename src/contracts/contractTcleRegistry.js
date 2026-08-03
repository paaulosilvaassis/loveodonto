import { TREATMENT_TYPES } from './contractConstants.js';

export const TCLE_BY_TREATMENT = {
  [TREATMENT_TYPES.ORTODONTIA]: {
    id: 'tcle_ortodontia',
    title: 'Termo de Consentimento — Ortodontia',
    required: true,
  },
  [TREATMENT_TYPES.IMPLANTE_UNITARIO]: {
    id: 'tcle_implante',
    title: 'Termo de Consentimento — Implantes',
    required: true,
  },
  [TREATMENT_TYPES.PROTOCOLO_TOTAL]: {
    id: 'tcle_implante',
    title: 'Termo de Consentimento — Implantes / Protocolo',
    required: true,
  },
  [TREATMENT_TYPES.LENTE_PORCELANA]: {
    id: 'tcle_estetica',
    title: 'Termo de Consentimento — Procedimentos Estéticos',
    required: true,
  },
  [TREATMENT_TYPES.LENTE_RESINA]: {
    id: 'tcle_estetica',
    title: 'Termo de Consentimento — Procedimentos Estéticos',
    required: true,
  },
  [TREATMENT_TYPES.CLAREAMENTO]: {
    id: 'tcle_clareamento',
    title: 'Termo de Consentimento — Clareamento Dental',
    required: true,
  },
  [TREATMENT_TYPES.CIRURGIA]: {
    id: 'tcle_cirurgia',
    title: 'Termo de Consentimento — Cirurgia Odontológica',
    required: true,
  },
  [TREATMENT_TYPES.EXTRACAO]: {
    id: 'tcle_cirurgia',
    title: 'Termo de Consentimento — Extração / Cirurgia',
    required: true,
  },
  [TREATMENT_TYPES.ENDODONTIA]: {
    id: 'tcle_endodontia',
    title: 'Termo de Consentimento — Endodontia',
    required: true,
  },
};

export function resolveRequiredTcles(treatmentTypes = []) {
  const seen = new Set();
  const list = [];
  for (const type of treatmentTypes) {
    const tcle = TCLE_BY_TREATMENT[type];
    if (!tcle || seen.has(tcle.id)) continue;
    seen.add(tcle.id);
    list.push(tcle);
  }
  return list;
}

export function validateRequiredTcles(treatmentTypes, attachedTcleIds = []) {
  const required = resolveRequiredTcles(treatmentTypes);
  const attached = new Set(attachedTcleIds || []);
  const missing = required.filter((t) => !attached.has(t.id));
  return { required, missing, ok: missing.length === 0 };
}
