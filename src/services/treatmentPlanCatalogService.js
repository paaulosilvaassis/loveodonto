import { loadDb, saveDb } from '../db/index.js';
import { createId } from './helpers.js';

export const DEFAULT_TREATMENT_PLAN_TYPES = [
  'Tratamento Reabilitador',
  'Tratamento Ortodôntico',
  'Implante Unitário',
  'Protocolo Superior',
  'Protocolo Inferior',
  'Protocolo Total',
  'Prótese Parcial',
  'Prótese Total',
  'Lentes em Resina',
  'Lentes em Porcelana',
  'Clareamento',
  'Periodontia',
  'Endodontia',
  'Cirurgia',
  'Estético',
  'Personalizado',
];

export function getTreatmentPlanTypes() {
  const db = loadDb();
  const custom = db.clinicSettings?.treatmentPlanTypes;
  if (Array.isArray(custom) && custom.length > 0) {
    return custom.map((item) => (typeof item === 'string' ? item : item.label)).filter(Boolean);
  }
  return [...DEFAULT_TREATMENT_PLAN_TYPES];
}

export function getTreatmentPlanTypesDetailed() {
  const db = loadDb();
  const custom = db.clinicSettings?.treatmentPlanTypes;
  if (Array.isArray(custom) && custom.length > 0) {
    return custom.map((item) =>
      typeof item === 'string'
        ? { id: createId('plan-type'), label: item, active: true }
        : { id: item.id || createId('plan-type'), label: item.label, active: item.active !== false }
    );
  }
  return DEFAULT_TREATMENT_PLAN_TYPES.map((label) => ({
    id: createId('plan-type'),
    label,
    active: true,
  }));
}

export function saveTreatmentPlanTypes(user, types) {
  const db = loadDb();
  if (!db.clinicSettings) db.clinicSettings = {};
  db.clinicSettings.treatmentPlanTypes = types.map((item) => ({
    id: item.id || createId('plan-type'),
    label: String(item.label || '').trim(),
    active: item.active !== false,
  })).filter((item) => item.label);
  db.clinicSettings.updatedAt = new Date().toISOString();
  db.clinicSettings.updatedBy = user?.id || null;
  saveDb(db);
  return db.clinicSettings.treatmentPlanTypes;
}
