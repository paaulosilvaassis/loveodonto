/**
 * CLI logic — Phase 9.4A Wave 3A (read-only). Importable by Vitest.
 * Entry: auditIndexedDbPatientData.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_CONFIRMATION_ENV,
  AUDIT_CONFIRMATION_VALUE,
  WAVE3A_REMOTE_ACTIONS_EXECUTED,
  auditPatientSnapshot,
  assertNoRawPiiLeak,
  determineGate,
} from './patientDataAudit.mjs';
import { STAGING_REF } from '../supabase/constants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SYNTHETIC = path.join(__dirname, 'fixtures/wave3a_synthetic_snapshot.json');

function parseArgs(argv) {
  const out = { snapshot: null, synthetic: false, jsonOut: null, help: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--synthetic') out.synthetic = true;
    else if (a === '--snapshot') out.snapshot = argv[++i];
    else if (a === '--json-out') out.jsonOut = argv[++i];
  }
  return out;
}

function printHelp() {
  console.log(`
Usage:
  LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION=LOCAL_READ_ONLY \\
    node scripts/patients/auditIndexedDbPatientData.mjs --snapshot ./local-idb-snapshot.json

  LOVE_ODONTO_PATIENT_AUDIT_CONFIRMATION=LOCAL_READ_ONLY \\
    node scripts/patients/auditIndexedDbPatientData.mjs --synthetic

Flags:
  --snapshot <path>   JSON local read-only (IndexedDB / loadDb export)
  --synthetic         Uses test fixture (not clinical data)
  --json-out <path>   Writes masked JSON report (new file only)
  --help

Guards:
  - Missing confirmation -> abort
  - Missing snapshot/synthetic -> BLOCKED_BY_UNAVAILABLE_LOCAL_DATA
  - remoteActionsExecuted always false
  - linkedRef expected: ${STAGING_REF}
`);
}

function loadSnapshot(args) {
  if (args.synthetic) {
    const raw = JSON.parse(fs.readFileSync(SYNTHETIC, 'utf8'));
    return { db: raw, sourceLabel: 'synthetic_fixture' };
  }
  if (args.snapshot) {
    const abs = path.resolve(args.snapshot);
    if (!fs.existsSync(abs)) {
      return { error: `SNAPSHOT_NOT_FOUND:${abs}` };
    }
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const db = raw.db && typeof raw.db === 'object' && !Array.isArray(raw.db) ? raw.db : raw;
    return { db, sourceLabel: `file:${abs}` };
  }
  return { error: 'NO_SNAPSHOT_OR_SYNTHETIC' };
}

function formatReadable(report) {
  const lines = [];
  lines.push('=== PHASE_9_4A_WAVE3A PATIENT DATA READINESS AUDIT ===');
  lines.push(`status: ${report.status}`);
  lines.push(`gate: ${report.gate || determineGate(report)}`);
  lines.push(`dataAccessible: ${report.dataAccessible}`);
  lines.push(`source: ${report.sourceLabel || 'n/a'}`);
  lines.push(`remoteActionsExecuted: ${WAVE3A_REMOTE_ACTIONS_EXECUTED}`);
  lines.push(`linkedRefExpected: ${STAGING_REF}`);
  lines.push(`piiMasked: ${report.piiMasked !== false}`);
  if (report.profile) {
    lines.push('--- profile ---');
    lines.push(`total: ${report.profile.total}`);
    lines.push(`active: ${report.profile.active}`);
    lines.push(`inactive: ${report.profile.inactive}`);
    lines.push(`missingTenant: ${report.profile.missingTenant}`);
    lines.push(`invalidTenantUuid: ${report.profile.invalidTenantUuid}`);
    lines.push(`duplicateLegacyIds: ${report.profile.duplicateLegacyIds}`);
  }
  if (report.cpf) {
    lines.push('--- cpf (masked metrics only) ---');
    lines.push(`valid: ${report.cpf.valid} invalid: ${report.cpf.invalid} absent: ${report.cpf.absent}`);
    lines.push(`duplicateSameTenant: ${report.cpf.duplicateSameTenant}`);
  }
  if (report.classifications) {
    lines.push('--- classifications ---');
    for (const [k, v] of Object.entries(report.classifications)) {
      lines.push(`${k}: ${v}`);
    }
  }
  if (report.simulation) {
    lines.push('--- backfill simulation (no persist) ---');
    lines.push(`wouldInsert: ${report.simulation.wouldInsertPatients}`);
    lines.push(`wouldSkip: ${report.simulation.wouldSkipPatients}`);
    lines.push(`conflicts: ${report.simulation.conflictPatients}`);
    lines.push(`manualReview: ${report.simulation.manualReviewPatients}`);
    lines.push(`persisted: ${report.simulation.persisted}`);
  }
  lines.push('=== END ===');
  return lines.join('\n');
}

export async function runPatientDataAuditCli(argv = process.argv, env = process.env) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return { ok: true, help: true, remoteActionsExecuted: false };
  }

  if (env[AUDIT_CONFIRMATION_ENV] !== AUDIT_CONFIRMATION_VALUE) {
    const blocked = {
      status: 'PHASE_9_4A_WAVE3A_BLOCKED',
      gate: 'BLOCKED_BY_UNAVAILABLE_LOCAL_DATA',
      etapa: 'confirmation',
      motivo: `Defina ${AUDIT_CONFIRMATION_ENV}=${AUDIT_CONFIRMATION_VALUE}`,
      dataAccessible: false,
      remoteActionsExecuted: false,
      linkedRefPreserved: STAGING_REF,
      commitRealizado: false,
    };
    return { ok: false, report: blocked };
  }

  const loaded = loadSnapshot(args);
  if (loaded.error) {
    const report = {
      status: 'PHASE_9_4A_WAVE3A_BLOCKED',
      gate: 'BLOCKED_BY_UNAVAILABLE_LOCAL_DATA',
      etapa: 'snapshot_load',
      motivo: loaded.error,
      dataAccessible: false,
      limitacao: 'Node nao acessa IndexedDB do browser; forneca --snapshot ou --synthetic',
      remoteActionsExecuted: false,
      linkedRefPreserved: STAGING_REF,
      commitRealizado: false,
      inventory: auditPatientSnapshot(null).inventory,
    };
    return { ok: false, report };
  }

  const report = auditPatientSnapshot(loaded.db, { sourceLabel: loaded.sourceLabel });
  report.linkedRefPreserved = STAGING_REF;
  report.remoteActionsExecuted = false;
  report.commitRealizado = false;

  const text = formatReadable(report);
  const leak = assertNoRawPiiLeak(text);
  report.piiLeakCheck = leak;

  if (args.jsonOut) {
    const abs = path.resolve(args.jsonOut);
    fs.writeFileSync(abs, JSON.stringify(report, null, 2), 'utf8');
    report.jsonOutWritten = abs;
  }

  return { ok: report.dataAccessible === true, report, readable: text };
}
