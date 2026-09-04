/**
 * @module repositories/patient/patientShadowCompare
 * @description Comparação shadow IDB vs remoto — CLOUD.3 (funções puras).
 */

import type { PatientCore } from './patientTypes.js';

export type PatientShadowOutcome = 'LOCAL_ONLY' | 'REMOTE_ONLY' | 'MATCH' | 'MISMATCH';

export interface PatientShadowPairResult {
  outcome: PatientShadowOutcome;
  diffs?: string[];
}

export interface PatientShadowNormalized {
  legacyId: string;
  fullName: string;
  cpf: string;
  birthDate: string;
  status: string;
}

export interface PatientShadowReport {
  tenantId: string;
  localCount: number;
  remoteCount: number;
  matchCount: number;
  localOnlyCount: number;
  remoteOnlyCount: number;
  mismatchCount: number;
  outcomes: Record<string, PatientShadowOutcome>;
  comparedAt: string;
}

function foldName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function digitsOnly(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function normalizePatientForCompare(
  core: PatientCore | null | undefined,
): PatientShadowNormalized | null {
  if (!core) return null;
  const legacyId = String(core.legacyId || '').trim();
  if (!legacyId) return null;
  return {
    legacyId,
    fullName: foldName(core.fullName),
    cpf: digitsOnly(core.cpf),
    birthDate: String(core.birthDate || '').trim(),
    status: core.status === 'inactive' ? 'inactive' : 'active',
  };
}

export function comparePatientPair(
  localCore: PatientCore | null,
  remoteCore: PatientCore | null,
): PatientShadowPairResult {
  if (!localCore && !remoteCore) {
    return { outcome: 'MATCH' };
  }
  if (localCore && !remoteCore) {
    return { outcome: 'LOCAL_ONLY' };
  }
  if (!localCore && remoteCore) {
    return { outcome: 'REMOTE_ONLY' };
  }

  const local = normalizePatientForCompare(localCore);
  const remote = normalizePatientForCompare(remoteCore);
  if (!local || !remote) {
    return { outcome: 'MISMATCH', diffs: ['normalize'] };
  }

  const diffs: string[] = [];
  if (local.fullName !== remote.fullName) diffs.push('full_name');
  if (local.cpf !== remote.cpf) diffs.push('cpf');
  if (local.birthDate !== remote.birthDate) diffs.push('birth_date');
  if (local.status !== remote.status) diffs.push('status');
  if (local.legacyId !== remote.legacyId) diffs.push('legacy_id');

  if (diffs.length) {
    return { outcome: 'MISMATCH', diffs };
  }
  return { outcome: 'MATCH' };
}

export function buildPatientShadowReport(input: {
  tenantId: string;
  localItems: PatientCore[];
  remoteItems: PatientCore[];
}): PatientShadowReport {
  const tenantId = String(input.tenantId || '').trim();
  const localMap = new Map<string, PatientCore>();
  for (const item of input.localItems || []) {
    const id = String(item?.legacyId || '').trim();
    if (id) localMap.set(id, item);
  }
  const remoteMap = new Map<string, PatientCore>();
  for (const item of input.remoteItems || []) {
    const id = String(item?.legacyId || '').trim();
    if (id) remoteMap.set(id, item);
  }

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const outcomes: Record<string, PatientShadowOutcome> = {};
  let matchCount = 0;
  let localOnlyCount = 0;
  let remoteOnlyCount = 0;
  let mismatchCount = 0;

  for (const id of allIds) {
    const result = comparePatientPair(localMap.get(id) ?? null, remoteMap.get(id) ?? null);
    outcomes[id] = result.outcome;
    if (result.outcome === 'MATCH') matchCount += 1;
    else if (result.outcome === 'LOCAL_ONLY') localOnlyCount += 1;
    else if (result.outcome === 'REMOTE_ONLY') remoteOnlyCount += 1;
    else mismatchCount += 1;
  }

  return {
    tenantId,
    localCount: localMap.size,
    remoteCount: remoteMap.size,
    matchCount,
    localOnlyCount,
    remoteOnlyCount,
    mismatchCount,
    outcomes,
    comparedAt: new Date().toISOString(),
  };
}

function canLogShadow(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) return true;
    if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) return false;
  } catch {
    /* ignore */
  }
  return process.env.NODE_ENV !== 'production';
}

/** Log agregado uma vez — sem spam por legacyId. */
export function logPatientShadowReport(report: PatientShadowReport): void {
  if (!canLogShadow()) return;
  console.debug('[PATIENT_SHADOW_REPORT]', {
    PATIENT_SHADOW_TENANT: report.tenantId,
    PATIENT_SHADOW_LOCAL: report.localCount,
    PATIENT_SHADOW_REMOTE: report.remoteCount,
    PATIENT_SHADOW_MATCH: report.matchCount,
    PATIENT_SHADOW_LOCAL_ONLY: report.localOnlyCount,
    PATIENT_SHADOW_REMOTE_ONLY: report.remoteOnlyCount,
    PATIENT_SHADOW_MISMATCH: report.mismatchCount,
    PATIENT_SHADOW_AT: report.comparedAt,
  });
}
