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

export {
  SQL_GRANULAR_PERMISSION_PRIMITIVE,
  ODONTOGRAM_PERMISSION_NAMESPACE,
  ODONTOGRAM_PERMISSION_ACTIONS,
  ODONTOGRAM_PERMISSION_KEYS,
  ODONTOGRAM_PERMISSION_CATALOG_IDS,
  ODONTOGRAM_OPERATIONS,
  ODONTOGRAM_OPERATION_PERMISSIONS,
  ODONTOGRAM_READ_OPERATIONS,
  ODONTOGRAM_WRITE_OPERATIONS,
  ODONTOGRAM_LIFECYCLE_OPERATIONS,
  AUTH_DECISION_CODES,
  authorizeOdontogramOperation,
  isOdontogramReadOperation,
  isOdontogramWriteOperation,
} from './authorizationContract.js';

export {
  ODONTOGRAM_COMMAND_ERROR_CODES,
  OdontogramCommandError,
  TRUSTED_ODONTOGRAM_SERVER_ACTOR_KIND,
  CREATE_CHART_EXPECTED_ROW_VERSION,
  VERSION_CREATION_EVENT_TYPES,
  DATABASE_GENERATED_FIELDS,
  TRANSACTION_PORT_METHODS,
  ODONTOGRAM_PERSISTED_EVENT_FIELD_MAP,
  ODONTOGRAM_CHART_FIELD_MAP,
  ODONTOGRAM_TOOTH_STATE_FIELD_MAP,
  ODONTOGRAM_CHART_VERSION_FIELD_MAP,
  EVENT_TYPE_TO_OPERATION,
  isCanonicalUuid,
  isPersistencePatientId,
  mapDomainEventToSqlRow,
  mapDomainChartToSqlRow,
  mapDomainToothStateToSqlRow,
  mapDomainChartVersionToSqlRow,
  assertTransactionPort,
  assertTransaction,
  assertTrustedOdontogramServerActor,
  assertOdontogramCommand,
  buildCanonicalEventDraft,
  canonicalToothState,
} from './persistenceContract.js';

export {
  EVENT_HASH_CONTENT_FIELDS,
  buildEventHashCandidate,
  hashOdontogramEvent,
  verifyOdontogramEventChain,
} from './eventHashChain.js';
