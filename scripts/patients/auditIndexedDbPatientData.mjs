#!/usr/bin/env node
/**
 * CLI entry — Phase 9.4A Wave 3A patient data readiness audit (read-only).
 * Logic lives in patientDataAuditCli.mjs (Vitest-importable).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPatientDataAuditCli } from './patientDataAuditCli.mjs';

export { runPatientDataAuditCli } from './patientDataAuditCli.mjs';

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  runPatientDataAuditCli().then((result) => {
    if (result.help) process.exit(0);
    if (result.readable) console.log(result.readable);
    else console.log(JSON.stringify(result.report, null, 2));
    process.exit(result.ok ? 0 : 2);
  }).catch((err) => {
    console.error(String(err?.stack || err));
    process.exit(1);
  });
}
