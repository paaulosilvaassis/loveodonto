#!/usr/bin/env node
/**
 * CLOUD.9B — Production patient backfill DRY-RUN (ZERO DB writes).
 *
 * Pins RECOVERY_06, classifies against production remote snapshot (read-only),
 * predicts satellite inserts + deterministic record_number collision resolution.
 *
 * Usage:
 *   node scripts/cloud9b-patient-production-backfill-dry-run.mjs \
 *     --local /path/to/RECOVERY_06.pkl.gz \
 *     --remote /path/to/prod-remote-patients.json \
 *     --expected-sha256 ce158979... \
 *     --out-dir /tmp/cloud9b-dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  HASH_STRATEGY,
  classifyAllPatients,
  classifySatelliteRows,
  buildCanonicalPatientPayload,
  canonicalPatientHash,
  planRecordNumberCollisions,
} from '../src/domain/patients/patientBackfillDryRun.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PROD_TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const EXPECTED_SHA =
  'ce158979ef7e67e95bd17458ddf033e477e073266d7a5942897ceffb442329e9';
const EXPECTED_COUNTS = {
  patients: 3731,
  documents: 3731,
  records: 3731,
  addresses: 2921,
  insurances: 2176,
  phones: 0,
};

function parseArgs(argv) {
  const out = {
    local: null,
    remote: null,
    outDir: '/tmp/cloud9b-patient-backfill-dry-run',
    targetTenant: PROD_TENANT,
    expectedSha256: EXPECTED_SHA,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--local') out.local = argv[++i];
    else if (a === '--remote') out.remote = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--target-tenant') out.targetTenant = argv[++i];
    else if (a === '--expected-sha256') out.expectedSha256 = argv[++i];
  }
  return out;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function loadPickleGz(filePath) {
  const py = `
import gzip, pickle, json, sys
from pathlib import Path
p = Path(sys.argv[1])
with gzip.open(p, 'rb') as f:
    obj = pickle.load(f)
out = {'patients': [], 'stores': {}}
if isinstance(obj, dict) and 'patients' in obj and 'stores_by_blob' in obj:
    out['patients'] = obj['patients']
    blob = obj['stores_by_blob'] or {}
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

function countUniqueTenants(patients) {
  const map = new Map();
  for (const p of patients) {
    const t = String(p?.tenant_id || '');
    map.set(t, (map.get(t) || 0) + 1);
  }
  return Object.fromEntries(map);
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.local) {
    console.error('Missing --local');
    process.exit(2);
  }
  fs.mkdirSync(args.outDir, { recursive: true });

  const sourceSha = sha256File(args.local);
  if (sourceSha !== args.expectedSha256) {
    const stop = {
      finalGate: 'STOP_CLOUD9B_SOURCE_MISMATCH',
      expectedSha256: args.expectedSha256,
      actualSha256: sourceSha,
    };
    fs.writeFileSync(path.join(args.outDir, 'STOP.json'), JSON.stringify(stop, null, 2));
    console.log(JSON.stringify(stop, null, 2));
    process.exit(3);
  }

  const remotePayload = args.remote
    ? JSON.parse(fs.readFileSync(args.remote, 'utf8'))
    : { patients: [], captured_at: new Date().toISOString() };
  const remotePatients = remotePayload.patients || [];

  const localBundle = loadPickleGz(args.local);
  const localPatients = localBundle.patients || [];
  const stores = localBundle.stores || {};

  const sourceCounts = {
    patients: localPatients.length,
    documents: (stores.patientDocuments || []).length,
    records: (stores.patientRecords || []).length,
    addresses: (stores.patientAddresses || []).length,
    insurances: (stores.patientInsurances || []).length,
    phones: (stores.patientPhones || []).length,
  };

  for (const [k, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (sourceCounts[k] !== expected) {
      const stop = {
        finalGate: 'STOP_CLOUD9B_SOURCE_MISMATCH',
        field: k,
        expected,
        actual: sourceCounts[k],
        sourceSha,
      };
      fs.writeFileSync(path.join(args.outDir, 'STOP.json'), JSON.stringify(stop, null, 2));
      console.log(JSON.stringify(stop, null, 2));
      process.exit(3);
    }
  }

  const tenantValues = countUniqueTenants(localPatients);
  const tenantMapping = {
    targetStagingTenantUuid: args.targetTenant,
    sourceTenantIds: [PROD_TENANT, args.targetTenant],
  };

  const classified = classifyAllPatients(localPatients, remotePatients, tenantMapping);
  const parentClassByLegacy = new Map(classified.results.map((r) => [r.legacyId, r.class]));
  const remoteParentByLegacy = new Map(
    remotePatients.map((r) => [String(r.legacy_id || ''), r]),
  );
  const localPatientIds = new Set(localPatients.map((p) => String(p.id)));

  const satDefs = [
    ['document', stores.patientDocuments || []],
    ['record', stores.patientRecords || []],
    ['address', stores.patientAddresses || []],
    ['insurance', stores.patientInsurances || []],
    ['phone', stores.patientPhones || []],
  ];
  const satellites = {};
  const orphans = {};
  for (const [name, rows] of satDefs) {
    const classifiedSat = classifySatelliteRows({
      rows,
      localPatientIds,
      parentClassByLegacy,
      remoteParentByLegacy,
    });
    satellites[name] = classifiedSat.counters;
    orphans[name] = classifiedSat.counters.ORPHAN_LOCAL || 0;
  }

  const recordPlan = planRecordNumberCollisions(stores.patientRecords || []);

  // Identity / uniqueness on source (pre-apply)
  const legacyDup = [...Object.entries(
    localPatients.reduce((acc, p) => {
      const id = String(p?.id || '');
      if (id) acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {}),
  )].filter(([, n]) => n > 1);
  const cpfMap = new Map();
  for (const p of localPatients) {
    const cpf = String(p?.cpf || '').replace(/\D/g, '');
    if (cpf.length === 11) {
      if (!cpfMap.has(cpf)) cpfMap.set(cpf, []);
      cpfMap.get(cpf).push(p.id);
    }
  }
  const duplicateCpfs = [...cpfMap.entries()].filter(([, ids]) => ids.length > 1);

  const schemaInvalid = classified.results.filter((r) => r.class === 'INVALID');
  const tenantFailures = classified.results.filter((r) => r.class === 'MISSING_TENANT');

  // Predicted parity hashes (source-side) — empty remote ⇒ all INSERT_SAFE hashes are expected matches after apply
  const expectedHashes = new Set();
  for (const p of localPatients) {
    const payload = buildCanonicalPatientPayload(p, args.targetTenant);
    expectedHashes.add(canonicalPatientHash(payload));
  }

  let finalGate = 'PASS_CLOUD9B_PATIENT_PRODUCTION_BACKFILL_DRY_RUN_READY';
  if (classified.counters.CONFLICT > 0) finalGate = 'STOP_CLOUD9B_PARENT_CONFLICT';
  else if (classified.counters.INVALID > 0) finalGate = 'STOP_CLOUD9B_SOURCE_INVALID';
  else if (classified.counters.MISSING_TENANT > 0) finalGate = 'STOP_CLOUD9B_SOURCE_INVALID';
  else if (Object.values(orphans).some((n) => n > 0)) finalGate = 'STOP_CLOUD9B_ORPHAN_DETECTED';
  else if (Object.values(satellites).some((c) => (c.CONFLICT || 0) > 0)) {
    finalGate = 'STOP_CLOUD9B_SATELLITE_CONFLICT';
  } else if (classified.counters.INSERT_SAFE !== EXPECTED_COUNTS.patients) {
    finalGate = 'STOP_CLOUD9B_SOURCE_MISMATCH';
  }

  const report = {
    mode: 'CLOUD9B_DRY_RUN_NO_APPLY',
    productionWrite: 'ZERO',
    sourceFile: path.basename(args.local),
    sourceSha256: sourceSha,
    sourceCounts,
    sourceTenantValues: tenantValues,
    targetTenant: args.targetTenant,
    remotePatientCountBefore: remotePatients.length,
    counters: classified.counters,
    conflictReasons: classified.conflictReasons,
    duplicateLegacyIds: legacyDup.length,
    duplicateCpfsRequiringReview: duplicateCpfs.length,
    schemaInvalidRows: schemaInvalid.length,
    tenantMappingFailures: tenantFailures.length,
    satellites,
    orphans,
    recordNumberCollisions: {
      collisionGroups: recordPlan.collisionGroups,
      collisionAdjustments: recordPlan.collisionAdjustments,
      strategy:
        'sort_by_record_legacy_id_keep_first_others_suffix__legacy_id (CLOUD.5 staging-validated)',
      samples: recordPlan.report.slice(0, 10),
    },
    expectedFinal: {
      patients: EXPECTED_COUNTS.patients,
      documents: EXPECTED_COUNTS.documents,
      records: EXPECTED_COUNTS.records,
      addresses: EXPECTED_COUNTS.addresses,
      insurances: EXPECTED_COUNTS.insurances,
      phones: EXPECTED_COUNTS.phones,
      sourceMatch: EXPECTED_COUNTS.patients,
      mismatch: 0,
      uniqueSemanticHashes: expectedHashes.size,
    },
    hashStrategy: HASH_STRATEGY,
    batchSizeRecommended: 50,
    finalGate,
  };

  fs.writeFileSync(
    path.join(args.outDir, 'CLOUD_9B_PATIENT_PRODUCTION_BACKFILL_DRY_RUN.json'),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(args.outDir, 'record_number_collisions.json'),
    JSON.stringify(recordPlan.report, null, 2),
  );

  // Repo sanitized report paths written by caller; script prints summary only
  console.log(JSON.stringify({
    ok: finalGate.startsWith('PASS'),
    finalGate,
    counters: report.counters,
    sourceCounts,
    orphans,
    recordNumberCollisionAdjustments: recordPlan.collisionAdjustments,
    outDir: args.outDir,
  }, null, 2));

  if (!finalGate.startsWith('PASS')) process.exit(4);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
