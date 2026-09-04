/**
 * CLOUD.4 — Classificador de dry-run de backfill de pacientes.
 * Funções puras. Nenhuma mutation remota/local.
 */

import { createHash } from 'node:crypto';

export const PATIENT_CLASS = {
  INSERT_SAFE: 'INSERT_SAFE',
  MATCH_EXISTING: 'MATCH_EXISTING',
  CONFLICT: 'CONFLICT',
  INVALID: 'INVALID',
  MISSING_TENANT: 'MISSING_TENANT',
};

export const CONFLICT_REASON = {
  CONFLICT_REMOTE_LEGACY_DIVERGED: 'CONFLICT_REMOTE_LEGACY_DIVERGED',
  CONFLICT_REMOTE_CPF_OTHER_LEGACY: 'CONFLICT_REMOTE_CPF_OTHER_LEGACY',
  CONFLICT_LOCAL_DUPLICATE_LEGACY: 'CONFLICT_LOCAL_DUPLICATE_LEGACY',
  CONFLICT_LOCAL_DUPLICATE_CPF: 'CONFLICT_LOCAL_DUPLICATE_CPF',
  CONFLICT_IDENTITY_AMBIGUOUS: 'CONFLICT_IDENTITY_AMBIGUOUS',
};

export const SATELLITE_CLASS = {
  MATCH_EXISTING: 'MATCH_EXISTING',
  INSERT_AFTER_PARENT: 'INSERT_AFTER_PARENT',
  PENDING_PARENT_INSERT_SAFE: 'PENDING_PARENT_INSERT_SAFE',
  CONFLICT: 'CONFLICT',
  INVALID: 'INVALID',
  ORPHAN_LOCAL: 'ORPHAN_LOCAL',
};

const FORBIDDEN_TENANTS = new Set(['tenant-1', 'tenant_1']);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_RE = /^patient-.+/i;

export const HASH_STRATEGY =
  'sha256(canonical_json:tenant_id|legacy_id|full_name|cpf|birth_date|status|blocked|lead_source)';

function asText(value) {
  return String(value ?? '').trim();
}

export function normalizeCpfDigits(value) {
  const digits = asText(value).replace(/\D/g, '');
  if (!digits) return null;
  return digits;
}

export function maskCpf(value) {
  const digits = normalizeCpfDigits(value);
  if (!digits || digits.length < 2) return null;
  return `***.***.***-${digits.slice(-2)}`;
}

export function normalizeFullNameForCompare(value) {
  return asText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function normalizeBirthDate(value) {
  const raw = asText(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  // Aceita "DD/MM/YYYY" e sufixo de horário legado ("DD/MM/YYYY 00:00:00").
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+.*)?$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return raw;
}

export function resolveTenantMapping(localTenantId, mapping = {}) {
  const source = asText(localTenantId);
  const target = asText(mapping.targetStagingTenantUuid);
  const aliases = Array.isArray(mapping.sourceTenantIds)
    ? mapping.sourceTenantIds.map((v) => asText(v)).filter(Boolean)
    : [];

  if (!target || !UUID_RE.test(target)) {
    return { ok: false, reason: 'TARGET_TENANT_INVALID', resolved: null, source };
  }

  if (!source) {
    return { ok: false, reason: 'SOURCE_TENANT_EMPTY', resolved: null, source };
  }

  if (source === target) {
    return { ok: true, resolved: target, source, via: 'identity' };
  }

  if (aliases.includes(source)) {
    return { ok: true, resolved: target, source, via: 'configured-alias' };
  }

  if (FORBIDDEN_TENANTS.has(source.toLowerCase())) {
    // tenant-1 só mapeia se aliases cobrem a clínica (ou explicitamente permitido)
    if (aliases.length > 0) {
      return { ok: true, resolved: target, source, via: 'legacy-alias' };
    }
    return { ok: false, reason: 'LEGACY_TENANT_WITHOUT_ALIAS', resolved: null, source };
  }

  return { ok: false, reason: 'UNMAPPED_LOCAL_TENANT', resolved: null, source };
}

export function buildCanonicalPatientPayload(localPatient, resolvedTenantId) {
  const legacyId = asText(localPatient?.id);
  const fullName = asText(localPatient?.full_name);
  const cpfRaw = normalizeCpfDigits(localPatient?.cpf);
  const cpf = cpfRaw && cpfRaw.length === 11 ? cpfRaw : cpfRaw ? cpfRaw : null;

  return {
    tenant_id: resolvedTenantId,
    legacy_id: legacyId,
    full_name: fullName,
    cpf: cpf && cpf.length === 11 ? cpf : null,
    birth_date: normalizeBirthDate(localPatient?.birth_date),
    status: asText(localPatient?.status) === 'inactive' ? 'inactive' : 'active',
    blocked: Boolean(localPatient?.blocked),
    lead_source: asText(localPatient?.lead_source),
    nickname: asText(localPatient?.nickname),
    social_name: asText(localPatient?.social_name),
    sex: asText(localPatient?.sex),
  };
}

export function canonicalPatientHash(payload) {
  const canonical = {
    tenant_id: payload.tenant_id,
    legacy_id: payload.legacy_id,
    full_name: normalizeFullNameForCompare(payload.full_name),
    cpf: payload.cpf || null,
    birth_date: payload.birth_date || null,
    status: payload.status,
    blocked: Boolean(payload.blocked),
    lead_source: asText(payload.lead_source).toLowerCase(),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function remoteRowToCanonical(remoteRow) {
  return {
    tenant_id: asText(remoteRow?.tenant_id),
    legacy_id: asText(remoteRow?.legacy_id),
    full_name: asText(remoteRow?.full_name),
    cpf: normalizeCpfDigits(remoteRow?.cpf),
    birth_date: normalizeBirthDate(remoteRow?.birth_date),
    status: asText(remoteRow?.status) === 'inactive' ? 'inactive' : 'active',
    blocked: Boolean(remoteRow?.blocked),
    lead_source: asText(remoteRow?.lead_source),
  };
}

function fieldDiffs(localPayload, remoteCanonical) {
  const diffs = [];
  if (normalizeFullNameForCompare(localPayload.full_name)
    !== normalizeFullNameForCompare(remoteCanonical.full_name)) {
    diffs.push('full_name');
  }
  if ((localPayload.cpf || null) !== (remoteCanonical.cpf || null)) diffs.push('cpf');
  if ((localPayload.birth_date || null) !== (remoteCanonical.birth_date || null)) {
    diffs.push('birth_date');
  }
  if (localPayload.status !== remoteCanonical.status) diffs.push('status');
  if (Boolean(localPayload.blocked) !== Boolean(remoteCanonical.blocked)) diffs.push('blocked');
  if (asText(localPayload.lead_source).toLowerCase()
    !== asText(remoteCanonical.lead_source).toLowerCase()) {
    diffs.push('lead_source');
  }
  return diffs;
}

/**
 * Classifica um paciente local contra índices remotos e contexto local.
 */
export function classifyLocalPatient(localPatient, ctx = {}) {
  const {
    remoteByLegacy = new Map(),
    remoteByCpf = new Map(),
    localLegacyCounts = new Map(),
    localCpfCounts = new Map(),
    tenantMapping = {},
  } = ctx;

  const legacyId = asText(localPatient?.id);
  if (!legacyId || !LEGACY_RE.test(legacyId)) {
    return {
      class: PATIENT_CLASS.INVALID,
      reason: 'INVALID_LEGACY_ID',
      legacyId: legacyId || null,
      maskedCpf: maskCpf(localPatient?.cpf),
    };
  }

  const fullName = asText(localPatient?.full_name);
  if (!fullName) {
    return {
      class: PATIENT_CLASS.INVALID,
      reason: 'INVALID_FULL_NAME',
      legacyId,
      maskedCpf: maskCpf(localPatient?.cpf),
    };
  }

  const cpfDigits = normalizeCpfDigits(localPatient?.cpf);
  if (cpfDigits && cpfDigits.length !== 11) {
    return {
      class: PATIENT_CLASS.INVALID,
      reason: 'INVALID_CPF_LENGTH',
      legacyId,
      maskedCpf: maskCpf(cpfDigits),
    };
  }

  if ((localLegacyCounts.get(legacyId) || 0) > 1) {
    return {
      class: PATIENT_CLASS.CONFLICT,
      reason: CONFLICT_REASON.CONFLICT_LOCAL_DUPLICATE_LEGACY,
      legacyId,
      maskedCpf: maskCpf(cpfDigits),
    };
  }

  if (cpfDigits && (localCpfCounts.get(cpfDigits) || 0) > 1) {
    return {
      class: PATIENT_CLASS.CONFLICT,
      reason: CONFLICT_REASON.CONFLICT_LOCAL_DUPLICATE_CPF,
      legacyId,
      maskedCpf: maskCpf(cpfDigits),
    };
  }

  const mapped = resolveTenantMapping(localPatient?.tenant_id, tenantMapping);
  if (!mapped.ok || !mapped.resolved) {
    return {
      class: PATIENT_CLASS.MISSING_TENANT,
      reason: mapped.reason || 'MISSING_TENANT',
      legacyId,
      maskedCpf: maskCpf(cpfDigits),
      sourceTenant: mapped.source,
    };
  }

  const payload = buildCanonicalPatientPayload(localPatient, mapped.resolved);
  const localHash = canonicalPatientHash(payload);

  const remoteSameLegacy = remoteByLegacy.get(legacyId) || null;
  if (remoteSameLegacy) {
    const remoteCanonical = remoteRowToCanonical(remoteSameLegacy);
    if (remoteCanonical.tenant_id && remoteCanonical.tenant_id !== mapped.resolved) {
      return {
        class: PATIENT_CLASS.CONFLICT,
        reason: CONFLICT_REASON.CONFLICT_IDENTITY_AMBIGUOUS,
        legacyId,
        maskedCpf: maskCpf(cpfDigits),
        localHash,
        remoteHash: canonicalPatientHash(remoteCanonical),
        diffs: ['tenant_id'],
      };
    }
    const diffs = fieldDiffs(payload, remoteCanonical);
    if (diffs.length) {
      return {
        class: PATIENT_CLASS.CONFLICT,
        reason: CONFLICT_REASON.CONFLICT_REMOTE_LEGACY_DIVERGED,
        legacyId,
        maskedCpf: maskCpf(cpfDigits),
        localHash,
        remoteHash: canonicalPatientHash(remoteCanonical),
        diffs,
      };
    }
    return {
      class: PATIENT_CLASS.MATCH_EXISTING,
      reason: 'MATCH',
      legacyId,
      maskedCpf: maskCpf(cpfDigits),
      localHash,
      remoteHash: canonicalPatientHash(remoteCanonical),
      resolvedTenantId: mapped.resolved,
    };
  }

  if (payload.cpf) {
    const remoteCpfHit = remoteByCpf.get(payload.cpf) || null;
    if (remoteCpfHit && asText(remoteCpfHit.legacy_id) !== legacyId) {
      return {
        class: PATIENT_CLASS.CONFLICT,
        reason: CONFLICT_REASON.CONFLICT_REMOTE_CPF_OTHER_LEGACY,
        legacyId,
        maskedCpf: maskCpf(cpfDigits),
        localHash,
        remoteLegacyId: asText(remoteCpfHit.legacy_id),
      };
    }
  }

  return {
    class: PATIENT_CLASS.INSERT_SAFE,
    reason: 'INSERT_SAFE',
    legacyId,
    maskedCpf: maskCpf(cpfDigits),
    localHash,
    resolvedTenantId: mapped.resolved,
    payload,
  };
}

export function buildLocalIndexCounts(localPatients = []) {
  const localLegacyCounts = new Map();
  const localCpfCounts = new Map();
  for (const p of localPatients) {
    const id = asText(p?.id);
    if (id) localLegacyCounts.set(id, (localLegacyCounts.get(id) || 0) + 1);
    const cpf = normalizeCpfDigits(p?.cpf);
    if (cpf && cpf.length === 11) {
      localCpfCounts.set(cpf, (localCpfCounts.get(cpf) || 0) + 1);
    }
  }
  return { localLegacyCounts, localCpfCounts };
}

export function buildRemoteIndexes(remotePatients = []) {
  const remoteByLegacy = new Map();
  const remoteByCpf = new Map();
  for (const row of remotePatients) {
    const legacy = asText(row?.legacy_id);
    if (legacy) remoteByLegacy.set(legacy, row);
    const cpf = normalizeCpfDigits(row?.cpf);
    if (cpf && cpf.length === 11) remoteByCpf.set(cpf, row);
  }
  return { remoteByLegacy, remoteByCpf };
}

export function classifyAllPatients(localPatients, remotePatients, tenantMapping) {
  const { localLegacyCounts, localCpfCounts } = buildLocalIndexCounts(localPatients);
  const { remoteByLegacy, remoteByCpf } = buildRemoteIndexes(remotePatients);
  const results = [];
  const counters = {
    INSERT_SAFE: 0,
    MATCH_EXISTING: 0,
    CONFLICT: 0,
    INVALID: 0,
    MISSING_TENANT: 0,
  };
  const conflictReasons = {
    CONFLICT_REMOTE_LEGACY_DIVERGED: 0,
    CONFLICT_REMOTE_CPF_OTHER_LEGACY: 0,
    CONFLICT_LOCAL_DUPLICATE_LEGACY: 0,
    CONFLICT_LOCAL_DUPLICATE_CPF: 0,
    CONFLICT_IDENTITY_AMBIGUOUS: 0,
  };

  for (const patient of localPatients) {
    const result = classifyLocalPatient(patient, {
      remoteByLegacy,
      remoteByCpf,
      localLegacyCounts,
      localCpfCounts,
      tenantMapping,
    });
    results.push(result);
    counters[result.class] = (counters[result.class] || 0) + 1;
    if (result.class === PATIENT_CLASS.CONFLICT && conflictReasons[result.reason] != null) {
      conflictReasons[result.reason] += 1;
    }
  }

  return { results, counters, conflictReasons };
}

export function classifySatelliteRows({
  rows = [],
  localPatientIds = new Set(),
  parentClassByLegacy = new Map(),
  remoteParentByLegacy = new Map(),
  getPatientId = (row) => asText(row?.patient_id || row?.patientId),
  getLegacyId = (row) => asText(row?.id),
}) {
  const counters = {
    MATCH_EXISTING: 0,
    INSERT_AFTER_PARENT: 0,
    PENDING_PARENT_INSERT_SAFE: 0,
    CONFLICT: 0,
    INVALID: 0,
    ORPHAN_LOCAL: 0,
  };
  const orphans = [];
  const results = [];

  for (const row of rows) {
    const patientId = getPatientId(row);
    const legacyId = getLegacyId(row);
    if (!patientId) {
      counters.INVALID += 1;
      results.push({ class: SATELLITE_CLASS.INVALID, reason: 'MISSING_PATIENT_ID', legacyId });
      continue;
    }
    if (!localPatientIds.has(patientId)) {
      counters.ORPHAN_LOCAL += 1;
      orphans.push({ patientId, legacyId });
      results.push({ class: SATELLITE_CLASS.ORPHAN_LOCAL, patientId, legacyId });
      continue;
    }

    const parentClass = parentClassByLegacy.get(patientId);
    const remoteParent = remoteParentByLegacy.get(patientId);

    if (parentClass === PATIENT_CLASS.MATCH_EXISTING && remoteParent) {
      counters.MATCH_EXISTING += 1;
      results.push({
        class: SATELLITE_CLASS.MATCH_EXISTING,
        patientId,
        legacyId,
        remotePatientUuid: remoteParent.id || null,
      });
      continue;
    }

    if (parentClass === PATIENT_CLASS.INSERT_SAFE) {
      counters.PENDING_PARENT_INSERT_SAFE += 1;
      counters.INSERT_AFTER_PARENT += 1;
      results.push({
        class: SATELLITE_CLASS.PENDING_PARENT_INSERT_SAFE,
        patientId,
        legacyId,
      });
      continue;
    }

    if (parentClass === PATIENT_CLASS.CONFLICT
      || parentClass === PATIENT_CLASS.INVALID
      || parentClass === PATIENT_CLASS.MISSING_TENANT) {
      counters.CONFLICT += 1;
      results.push({
        class: SATELLITE_CLASS.CONFLICT,
        reason: `PARENT_${parentClass}`,
        patientId,
        legacyId,
      });
      continue;
    }

    counters.INVALID += 1;
    results.push({ class: SATELLITE_CLASS.INVALID, reason: 'PARENT_UNKNOWN', patientId, legacyId });
  }

  return { counters, orphans, results };
}
