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
  CanonicalJsonError,
  canonicalizeJson,
  cloneCanonicalJson,
  hashCanonicalSnapshot,
} from './canonicalJson.js';

export { EVENT_RULES, validateCanonicalEvent } from './eventEngine.js';

export {
  MULTIPLE_CORRECTION_POLICY,
  CLINICAL_SCHEMA_VERSION,
  PROJECTED_CHART_STATUSES,
  createEmptyProjection,
  projectOdontogramEvents,
} from './projection.js';

export { buildChartVersion } from './versioning.js';
