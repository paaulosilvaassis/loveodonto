import { CONDITION_CODES, TERMINOLOGY_VERSION } from './conditions.js';
import {
  DENTITION_STAGES,
  MIXED_FDI_TOOTH_IDS,
  PERMANENT_FDI_TOOTH_IDS,
  PRIMARY_FDI_TOOTH_IDS,
} from './identifiers.js';
import { SURFACE_CODES } from './surfaces.js';

export const ODONTOGRAM_SCHEMA_VERSION = '1.0.0';

export const ODONTOGRAM_MIGRATION_FILE = '041_app_odontogram_clinical_foundation.sql';

export const ODONTOGRAM_TABLES = Object.freeze({
  charts: 'app_odontogram_charts',
  toothStates: 'app_odontogram_tooth_states',
  events: 'app_odontogram_events',
  chartVersions: 'app_odontogram_chart_versions',
});

export const CHART_STATUSES = Object.freeze(['draft', 'in_review', 'finalized']);

export const ODONTOGRAM_EVENT_TYPES = Object.freeze([
  'chart_created',
  'condition_recorded',
  'condition_corrected',
  'condition_removed',
  'procedure_planned',
  'procedure_authorized',
  'procedure_started',
  'procedure_completed',
  'procedure_cancelled',
  'chart_submitted_for_review',
  'chart_reopened',
  'chart_finalized',
  'correction_recorded',
]);

export const ODONTOGRAM_CORRECTION_EVENT_TYPES = Object.freeze([
  'condition_corrected',
  'condition_removed',
  'correction_recorded',
]);

export const ODONTOGRAM_PROCEDURE_EVENT_TYPES = Object.freeze([
  'procedure_planned',
  'procedure_authorized',
  'procedure_started',
  'procedure_completed',
  'procedure_cancelled',
]);

export {
  CONDITION_CODES,
  DENTITION_STAGES,
  MIXED_FDI_TOOTH_IDS,
  PERMANENT_FDI_TOOTH_IDS,
  PRIMARY_FDI_TOOTH_IDS,
  SURFACE_CODES,
  TERMINOLOGY_VERSION,
};
