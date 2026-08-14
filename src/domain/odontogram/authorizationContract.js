import { CHART_STATUSES } from './schemaContract.js';

export const SQL_GRANULAR_PERMISSION_PRIMITIVE = 'MISSING';

export const ODONTOGRAM_PERMISSION_NAMESPACE = 'prontuario_odontograma';

export const ODONTOGRAM_PERMISSION_ACTIONS = Object.freeze(['view', 'create', 'edit']);

export const ODONTOGRAM_PERMISSION_KEYS = Object.freeze(
  ODONTOGRAM_PERMISSION_ACTIONS.map((action) => `${ODONTOGRAM_PERMISSION_NAMESPACE}:${action}`),
);

export const ODONTOGRAM_PERMISSION_CATALOG_IDS = Object.freeze(
  ODONTOGRAM_PERMISSION_ACTIONS.map((action) => `perm-${ODONTOGRAM_PERMISSION_NAMESPACE}-${action}`),
);

export const ODONTOGRAM_OPERATIONS = Object.freeze([
  'view_current_chart',
  'view_clinical_history',
  'create_chart',
  'record_condition',
  'remove_condition',
  'correct_condition',
  'plan_procedure',
  'record_procedure_progress',
  'submit_for_review',
  'finalize_chart',
  'reopen_chart',
  'create_immutable_version',
]);

export const ODONTOGRAM_OPERATION_PERMISSIONS = Object.freeze({
  view_current_chart: `${ODONTOGRAM_PERMISSION_NAMESPACE}:view`,
  view_clinical_history: `${ODONTOGRAM_PERMISSION_NAMESPACE}:view`,
  create_chart: `${ODONTOGRAM_PERMISSION_NAMESPACE}:create`,
  record_condition: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  remove_condition: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  correct_condition: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  plan_procedure: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  record_procedure_progress: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  submit_for_review: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  finalize_chart: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  reopen_chart: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
  create_immutable_version: `${ODONTOGRAM_PERMISSION_NAMESPACE}:edit`,
});

export const ODONTOGRAM_READ_OPERATIONS = Object.freeze([
  'view_current_chart',
  'view_clinical_history',
]);

export const ODONTOGRAM_WRITE_OPERATIONS = Object.freeze(
  ODONTOGRAM_OPERATIONS.filter((operation) => !ODONTOGRAM_READ_OPERATIONS.includes(operation)),
);

export const ODONTOGRAM_LIFECYCLE_OPERATIONS = Object.freeze([
  'submit_for_review',
  'finalize_chart',
  'reopen_chart',
]);

export const AUTH_DECISION_CODES = Object.freeze({
  ALLOWED: 'ALLOWED',
  UNKNOWN_OPERATION: 'UNKNOWN_OPERATION',
  MISSING_PERMISSIONS: 'MISSING_PERMISSIONS',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  PATIENT_MISMATCH: 'PATIENT_MISMATCH',
  MALFORMED_INPUT: 'MALFORMED_INPUT',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CHART_FINALIZED: 'CHART_FINALIZED',
  INVALID_LIFECYCLE: 'INVALID_LIFECYCLE',
  DENIED_DEFAULT: 'DENIED_DEFAULT',
});

const [STATUS_DRAFT, STATUS_IN_REVIEW, STATUS_FINALIZED] = CHART_STATUSES;

function decision(allowed, code, requiredPermission = null) {
  return Object.freeze({ allowed, code, requiredPermission });
}

function deny(code, requiredPermission = null) {
  return decision(false, code, requiredPermission);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function permissionAliases(action) {
  return Object.freeze([
    `${ODONTOGRAM_PERMISSION_NAMESPACE}:${action}`,
    `perm-${ODONTOGRAM_PERMISSION_NAMESPACE}-${action}`,
  ]);
}

function hasPermission(permissions, requiredKey) {
  const action = requiredKey.split(':')[1];
  const aliases = permissionAliases(action);
  return permissions.some((item) => typeof item === 'string' && aliases.includes(item));
}

function assertInput(input) {
  if (!isPlainObject(input)) return deny(AUTH_DECISION_CODES.MALFORMED_INPUT);
  const { operation, permissions, tenantMatches, patientMatches, chartStatus, adminOverride } = input;
  if (typeof operation !== 'string' || operation.length === 0 || operation !== operation.trim()) {
    return deny(AUTH_DECISION_CODES.MALFORMED_INPUT);
  }
  if (!ODONTOGRAM_OPERATIONS.includes(operation)) {
    return deny(AUTH_DECISION_CODES.UNKNOWN_OPERATION);
  }
  if (adminOverride !== undefined && adminOverride !== true && adminOverride !== false) {
    return deny(AUTH_DECISION_CODES.MALFORMED_INPUT);
  }
  if (permissions == null) return deny(AUTH_DECISION_CODES.MISSING_PERMISSIONS);
  if (!Array.isArray(permissions)) return deny(AUTH_DECISION_CODES.MALFORMED_INPUT);
  if (tenantMatches !== true) return deny(AUTH_DECISION_CODES.TENANT_MISMATCH);
  if (patientMatches !== true) return deny(AUTH_DECISION_CODES.PATIENT_MISMATCH);
  if (chartStatus != null && (typeof chartStatus !== 'string' || !CHART_STATUSES.includes(chartStatus))) {
    return deny(AUTH_DECISION_CODES.MALFORMED_INPUT);
  }
  return null;
}

function assertLifecycle(operation, chartStatus, requiredPermission) {
  const isRead = ODONTOGRAM_READ_OPERATIONS.includes(operation);
  if (isRead) return null;
  if (operation === 'create_chart') return null;
  if (chartStatus == null) return deny(AUTH_DECISION_CODES.INVALID_LIFECYCLE, requiredPermission);
  if (operation === 'reopen_chart') {
    return chartStatus === STATUS_FINALIZED
      ? null
      : deny(AUTH_DECISION_CODES.INVALID_LIFECYCLE, requiredPermission);
  }
  if (operation === 'finalize_chart' || operation === 'submit_for_review') {
    if (operation === 'submit_for_review' && chartStatus !== STATUS_DRAFT) {
      return deny(AUTH_DECISION_CODES.INVALID_LIFECYCLE, requiredPermission);
    }
    if (operation === 'finalize_chart' && chartStatus !== STATUS_DRAFT && chartStatus !== STATUS_IN_REVIEW) {
      return deny(AUTH_DECISION_CODES.INVALID_LIFECYCLE, requiredPermission);
    }
    return null;
  }
  if (chartStatus === STATUS_FINALIZED) {
    return deny(AUTH_DECISION_CODES.CHART_FINALIZED, requiredPermission);
  }
  return null;
}

export function authorizeOdontogramOperation(input) {
  const invalid = assertInput(input);
  if (invalid) return invalid;
  const requiredPermission = ODONTOGRAM_OPERATION_PERMISSIONS[input.operation];
  if (!requiredPermission) return deny(AUTH_DECISION_CODES.DENIED_DEFAULT);
  const lifecycleErr = assertLifecycle(input.operation, input.chartStatus ?? null, requiredPermission);
  if (lifecycleErr) return lifecycleErr;
  if (input.adminOverride === true) {
    return decision(true, AUTH_DECISION_CODES.ALLOWED, requiredPermission);
  }
  if (!hasPermission(input.permissions, requiredPermission)) {
    return deny(AUTH_DECISION_CODES.PERMISSION_DENIED, requiredPermission);
  }
  return decision(true, AUTH_DECISION_CODES.ALLOWED, requiredPermission);
}

export function isOdontogramReadOperation(operation) {
  return ODONTOGRAM_READ_OPERATIONS.includes(operation);
}

export function isOdontogramWriteOperation(operation) {
  return ODONTOGRAM_WRITE_OPERATIONS.includes(operation);
}
