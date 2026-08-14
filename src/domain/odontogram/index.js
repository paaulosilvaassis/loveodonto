export {
  PERMANENT_FDI_TOOTH_IDS,
  PRIMARY_FDI_TOOTH_IDS,
  MIXED_FDI_TOOTH_IDS,
  DENTITION_STAGES,
  normalizeFdiToothId,
  isValidFdiToothId,
  isPermanentTooth,
  isPrimaryTooth,
  getToothMetadata,
  getTeethForDentitionStage,
} from './identifiers.js';

export {
  SURFACE_CODES,
  SURFACE_NAMES,
  SURFACE_LABELS,
  normalizeSurfaceCode,
  isValidSurfaceCode,
  getApplicableSurfaces,
  validateSurfaceForTooth,
  normalizeSurfaceList,
} from './surfaces.js';

export {
  TERMINOLOGY_VERSION,
  CONDITION_CATEGORIES,
  CONDITION_SCOPES,
  CONDITION_CATALOG,
  CONDITION_CODES,
  getConditionDefinition,
  isValidConditionCode,
  getConditionsByScope,
} from './conditions.js';

export {
  MAPPING_STATUS,
  mapLegacyV1ConditionToCanonical,
  mapLegacyV2ConditionToCanonical,
  mapLegacyV1SurfaceToCanonical,
  mapLegacyV2SurfaceToCanonical,
} from './legacyMappings.js';

export {
  ODONTOGRAM_SCHEMA_VERSION,
  ODONTOGRAM_EVENT_TYPES,
  ODONTOGRAM_CORRECTION_EVENT_TYPES,
  CHART_STATUSES,
  ODONTOGRAM_EVENT_FIELD_MAP,
} from './schemaContract.js';

export {
  CanonicalJsonError,
  canonicalizeJson,
  cloneCanonicalJson,
  hashCanonicalSnapshot,
} from './canonicalJson.js';

export { EVENT_RULES, validateCanonicalEvent } from './eventEngine.js';

export {
  MULTIPLE_CORRECTION_POLICY,
  createEmptyProjection,
  projectOdontogramEvents,
} from './projection.js';

export { buildChartVersion } from './versioning.js';
