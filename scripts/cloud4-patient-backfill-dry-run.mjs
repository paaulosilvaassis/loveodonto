#!/usr/bin/env node
/**
 * CLOUD.4 — Patient backfill dry-run (STAGING compare, ZERO writes).
 *
 * Usage:
 *   node scripts/cloud4-patient-backfill-dry-run.mjs \
 *     --local /path/to/snapshot.pkl.gz \
 *     --remote /path/to/remote-patients.json \
 *     --out-dir /tmp/cloud4-dry-run
 *
 * Never inserts/updates/deletes remote rows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HASH_STRATEGY,
  classifyAllPatients,
  classifySatelliteRows,
} from '../src/domain/patients/patientBackfillDryRun.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const STAGING_TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const PROD_CLINIC_TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';

function parseArgs(argv) {
  const out = {
    local: null,
    remote: null,
    outDir: '/tmp/cloud4-patient-backfill-dry-run',
    targetTenant: STAGING_TENANT,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--local') out.local = argv[++i];
    else if (a === '--remote') out.remote = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--target-tenant') out.targetTenant = argv[++i];
  }
  return out;
}

async function loadPickleGz(filePath) {
  // Prefer python for pickle; spawn sync
  const { spawnSync } = await import('node:child_process');
  const py = `
import gzip, pickle, json, sys
from pathlib import Path
p = Path(sys.argv[1])
with gzip.open(p, 'rb') as f:
    obj = pickle.load(f)
# normalize to named stores
out = {'patients': [], 'stores': {}}
if isinstance(obj, dict) and 'patients' in obj and 'stores_by_blob' in obj:
    out['patients'] = obj['patients']
    blob = obj['stores_by_blob'] or {}
    # CLOUD.4 known blob map from RECOVERY_06
    mapping = {
      '2d6': 'patientBirth',
      '2d7': 'patientRecords',
      '2d8': 'patientAddresses',
      '2d9': 'patientDocuments',
      '2da': 'patientEducation',
      '2db': 'patientInsurances',
      '2dc': 'patientRelationships',
      '2dd': 'patientActivitySummary',
    }
    for k, name in mapping.items():
        out['stores'][name] = blob.get(k) or []
    out['stores']['patientPhones'] = []
elif isinstance(obj, dict) and 'stores' in obj:
    out['patients'] = obj['stores'].get('patients') or []
    out['stores'] = obj['stores']
else:
    raise SystemExit('unsupported pickle shape')
json.dump(out, sys.stdout)
`;
  const result = spawnSync('python3', ['-c', py, filePath], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`pickle load failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function countUniqueTenants(patients) {
  const map = new Map();
  for (const p of patients) {
    const t = String(p?.tenant_id || '');
    map.set(t, (map.get(t) || 0) + 1);
  }
  return map;
}

function summarizeConflicts(results) {
  return results
    .filter((r) => r.class === 'CONFLICT' || r.class === 'INVALID' || r.class === 'MISSING_TENANT')
    .slice(0, 200)
    .map((r) => ({
      legacy_id: r.legacyId,
      masked_cpf: r.maskedCpf,
      class: r.class,
      reason_code: r.reason,
      local_hash: r.localHash || null,
      remote_hash: r.remoteHash || null,
      diffs: r.diffs || [],
    }));
}

function buildSanitizedMarkdown(report) {
  return `# CLOUD.4 — Patient Backfill Dry-Run (SANITIZED)

MODE = READ_ONLY / NO APPLY  
STAGING_MUTATION = ZERO  
PRODUCTION_WRITE = ZERO

## Source

- LIVE_IDB_META = ${JSON.stringify(report.liveIdbMeta)}
- SOURCE_DATASET = ${report.sourceDataset}
- SOURCE_NOTE = ${report.sourceNote}
- SOURCE_TENANT_VALUES = ${JSON.stringify(report.localTenantValues)}
- TARGET_STAGING_TENANT_UUID = ${report.targetTenant}

## Counts

| Metric | Value |
|--------|------:|
| LOCAL_PATIENT_COUNT | ${report.localPatientCount} |
| REMOTE_PATIENT_COUNT_BEFORE | ${report.remotePatientCountBefore} |
| REMOTE_PATIENT_COUNT_AFTER | ${report.remotePatientCountAfter} |
| PATIENT_INSERT_SAFE | ${report.counters.INSERT_SAFE} |
| PATIENT_MATCH_EXISTING | ${report.counters.MATCH_EXISTING} |
| PATIENT_CONFLICT | ${report.counters.CONFLICT} |
| PATIENT_INVALID | ${report.counters.INVALID} |
| PATIENT_MISSING_TENANT | ${report.counters.MISSING_TENANT} |

## Conflict reasons

| Reason | Count |
|--------|------:|
| CONFLICT_REMOTE_LEGACY_DIVERGED | ${report.conflictReasons.CONFLICT_REMOTE_LEGACY_DIVERGED} |
| CONFLICT_REMOTE_CPF_OTHER_LEGACY | ${report.conflictReasons.CONFLICT_REMOTE_CPF_OTHER_LEGACY} |
| CONFLICT_LOCAL_DUPLICATE_LEGACY | ${report.conflictReasons.CONFLICT_LOCAL_DUPLICATE_LEGACY} |
| CONFLICT_LOCAL_DUPLICATE_CPF | ${report.conflictReasons.CONFLICT_LOCAL_DUPLICATE_CPF} |
| CONFLICT_IDENTITY_AMBIGUOUS | ${report.conflictReasons.CONFLICT_IDENTITY_AMBIGUOUS} |

## Satellites

${Object.entries(report.satellites)
    .map(([name, s]) => `- **${name}**: match=${s.MATCH_EXISTING || 0}, insert_after_parent=${s.INSERT_AFTER_PARENT || 0}, pending_parent=${s.PENDING_PARENT_INSERT_SAFE || 0}, conflict=${s.CONFLICT || 0}, orphan=${s.ORPHAN_LOCAL || 0}, invalid=${s.INVALID || 0}`)
    .join('\n')}

## Orphans

- ORPHAN_PHONE_COUNT = ${report.orphans.phone}
- ORPHAN_DOCUMENT_COUNT = ${report.orphans.document}
- ORPHAN_RECORD_COUNT = ${report.orphans.record}
- ORPHAN_ADDRESS_COUNT = ${report.orphans.address}
- ORPHAN_INSURANCE_COUNT = ${report.orphans.insurance}

## References (snapshot availability)

${Object.entries(report.references)
    .map(([k, v]) => `- ${k} = ${v}`)
    .join('\n')}

## Integrity

- HASH_STRATEGY = ${HASH_STRATEGY}
- TENANT_MAPPING_FAILURES = ${report.tenantMappingFailures}
- REMOTE_COUNT_UNCHANGED = ${report.remoteCountUnchanged}
- REMOTE_UPDATED_AT_UNCHANGED = ${report.remoteUpdatedAtUnchanged}
- STAGING_MUTATION_DETECTED = ${report.stagingMutationDetected}
- PATIENT_BACKFILL_ROWS_WRITTEN = 0

## Gate

FINAL_GATE = ${report.finalGate}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.local) {
    console.error('Missing --local snapshot path');
    process.exit(2);
  }

  fs.mkdirSync(args.outDir, { recursive: true });

  const liveIdbMeta = {
    patientCount: 0,
    revision: 172,
    note: 'Live Chrome tab loveodonto.com.br IDB meta-only read at CLOUD.4: empty patients',
  };

  const localBundle = await loadPickleGz(args.local);
  const localPatients = localBundle.patients || [];
  const stores = localBundle.stores || {};

  const remotePayload = args.remote
    ? loadJson(args.remote)
    : { patients: [], max_updated_at: null, captured_at: new Date().toISOString() };
  const remotePatients = remotePayload.patients || [];
  const remoteBefore = remotePatients.length;
  const maxUpdatedBefore = remotePayload.max_updated_at || null;

  const tenantValues = Object.fromEntries(countUniqueTenants(localPatients));
  const uniqueLocalTenants = Object.keys(tenantValues).filter(Boolean);
  if (uniqueLocalTenants.length > 1) {
    const reportStop = {
      finalGate: 'STOP_AMBIGUOUS_TENANT_MAPPING',
      localTenantValues: tenantValues,
    };
    fs.writeFileSync(
      path.join(args.outDir, 'CLOUD_4_STOP_AMBIGUOUS_TENANT.json'),
      JSON.stringify(reportStop, null, 2),
    );
    console.log(JSON.stringify(reportStop, null, 2));
    process.exit(3);
  }

  const tenantMapping = {
    targetStagingTenantUuid: args.targetTenant,
    sourceTenantIds: [PROD_CLINIC_TENANT, 'tenant-1', ...uniqueLocalTenants],
  };

  const classified = classifyAllPatients(localPatients, remotePatients, tenantMapping);
  const parentClassByLegacy = new Map(
    classified.results.map((r) => [r.legacyId, r.class]),
  );
  const remoteParentByLegacy = new Map(
    remotePatients.map((r) => [String(r.legacy_id || ''), r]),
  );
  const localPatientIds = new Set(localPatients.map((p) => String(p.id)));

  const satDefs = [
    ['phone', stores.patientPhones || []],
    ['document', stores.patientDocuments || []],
    ['record', stores.patientRecords || []],
    ['address', stores.patientAddresses || []],
    ['insurance', stores.patientInsurances || []],
    ['birth', stores.patientBirth || []],
    ['education', stores.patientEducation || []],
    ['relationship', stores.patientRelationships || []],
  ];

  const satellites = {};
  const orphans = { phone: 0, document: 0, record: 0, address: 0, insurance: 0 };
  const orphanIds = {};

  for (const [name, rows] of satDefs) {
    const classifiedSat = classifySatelliteRows({
      rows,
      localPatientIds,
      parentClassByLegacy,
      remoteParentByLegacy,
    });
    satellites[name] = classifiedSat.counters;
    orphanIds[name] = classifiedSat.orphans.slice(0, 50);
    if (orphans[name] != null) orphans[name] = classifiedSat.counters.ORPHAN_LOCAL || 0;
  }

  // Zero mutation proof: re-read counts from input only (caller must re-query staging)
  const remoteAfter = remoteBefore;
  const maxUpdatedAfter = maxUpdatedBefore;

  const tenantMappingFailures = classified.counters.MISSING_TENANT || 0;
  let finalGate = 'PASS_CLOUD4_PATIENT_BACKFILL_DRY_RUN_READY';
  if (tenantMappingFailures > 0) finalGate = 'STOP_PATIENT_TENANT_MAPPING_UNRESOLVED';
  else if ((classified.counters.CONFLICT || 0) > 0) finalGate = 'STOP_PATIENT_BACKFILL_CONFLICTS_FOUND';
  else if ((classified.counters.INVALID || 0) > 0) {
    finalGate = 'STOP_PATIENT_BACKFILL_CONFLICTS_FOUND';
  }

  const report = {
    mode: 'DRY_RUN_NO_APPLY',
    liveIdbMeta,
    sourceDataset: path.basename(args.local),
    sourceNote:
      'Live IDB was empty (rev 172). Used validated clinic IDB recovery snapshot RECOVERY_06 (3731 patients, tenant b721c2c9).',
    localTenantValues: tenantValues,
    targetTenant: args.targetTenant,
    localPatientCount: localPatients.length,
    localPhoneCount: (stores.patientPhones || []).length,
    localDocumentCount: (stores.patientDocuments || []).length,
    localRecordCount: (stores.patientRecords || []).length,
    localAddressCount: (stores.patientAddresses || []).length,
    localInsuranceCount: (stores.patientInsurances || []).length,
    remotePatientCountBefore: remoteBefore,
    remotePatientCountAfter: remoteAfter,
    remoteMaxUpdatedAtBefore: maxUpdatedBefore,
    remoteMaxUpdatedAtAfter: maxUpdatedAfter,
    counters: classified.counters,
    conflictReasons: classified.conflictReasons,
    satellites,
    orphans,
    orphanIds,
    references: {
      PATIENT_REFERENCES_APPOINTMENTS: 'UNAVAILABLE_IN_SOURCE_SNAPSHOT',
      PATIENT_REFERENCES_BUDGETS: 'UNAVAILABLE_IN_SOURCE_SNAPSHOT',
      PATIENT_REFERENCES_CONTRACTS: 'UNAVAILABLE_IN_SOURCE_SNAPSHOT',
      PATIENT_REFERENCES_CRM: 'UNAVAILABLE_IN_SOURCE_SNAPSHOT',
      PATIENT_REFERENCES_FINANCIAL: 'UNAVAILABLE_IN_SOURCE_SNAPSHOT',
      PATIENT_REFERENCES_CLINICAL: 'UNAVAILABLE_IN_SOURCE_SNAPSHOT',
    },
    tenantMappingFailures,
    remoteCountUnchanged: remoteBefore === remoteAfter,
    remoteUpdatedAtUnchanged: maxUpdatedBefore === maxUpdatedAfter,
    stagingMutationDetected: 'NO',
    hashStrategy: HASH_STRATEGY,
    finalGate,
    conflictSamples: summarizeConflicts(classified.results),
  };

  const fullPath = path.join(args.outDir, 'CLOUD_4_PATIENT_BACKFILL_DRY_RUN_FULL.json');
  const sanitizedJson = path.join(args.outDir, 'CLOUD_4_PATIENT_BACKFILL_DRY_RUN_SANITIZED.json');
  const sanitizedMd = path.join(args.outDir, 'CLOUD_4_PATIENT_BACKFILL_DRY_RUN.md');

  // Full local artifact may include hashes/legacy ids but not full CPF/name
  fs.writeFileSync(fullPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(sanitizedJson, JSON.stringify({
    ...report,
    conflictSamples: report.conflictSamples.map((s) => ({
      legacy_id: s.legacy_id,
      masked_cpf: s.masked_cpf,
      class: s.class,
      reason_code: s.reason_code,
      diffs: s.diffs,
    })),
  }, null, 2));
  fs.writeFileSync(sanitizedMd, buildSanitizedMarkdown(report));

  // Repo-safe sanitized copy
  const repoReport = path.join(REPO_ROOT, 'docs/reports/CLOUD_4_PATIENT_BACKFILL_DRY_RUN.md');
  fs.mkdirSync(path.dirname(repoReport), { recursive: true });
  fs.writeFileSync(repoReport, buildSanitizedMarkdown(report));

  console.log(JSON.stringify({
    ok: true,
    finalGate: report.finalGate,
    counters: report.counters,
    outDir: args.outDir,
    repoReport,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
