/**
 * Compat Phase 9.2 → delega para o runner isolado Phase 9.2A.
 * Preferir: npm run supabase:local:dry-run
 */
import { runLocalMigrationDryRun } from './supabase/runLocalMigrationDryRun.mjs';

const report = await runLocalMigrationDryRun({
  preflightOnly: process.argv.includes('--preflight-only'),
});

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Phase 9.2/9.2A local: ${report.status}`);
  console.log(`docker=${report.docker?.status} cli=${report.cli?.status}`);
  console.log(`remoteActionsExecuted=${report.remoteActionsExecuted}`);
  if (report.blockers?.length) console.log(`blockers: ${report.blockers.join(', ')}`);
}

const ok = report.status === 'LOCAL_DRY_RUN_PASS'
  || report.status === 'LOCAL_DRY_RUN_PASS_WITH_WARNINGS';
if (ok) process.exit(0);
if (report.status === 'LOCAL_INTEGRATION_SKIPPED') process.exit(3);
if (report.status === 'LOCAL_DRY_RUN_BLOCKED') process.exit(2);
process.exit(1);
