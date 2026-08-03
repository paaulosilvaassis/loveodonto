/**
 * Phase 9.2B — toolchain check only.
 * Permite: docker --version, docker info, supabase --version
 * Proíbe: start, reset, push, link, migration apply
 *
 *   node scripts/supabase/toolchainCheck.mjs
 *   node scripts/supabase/toolchainCheck.mjs --json
 */
import { evaluateLocalSupabaseDryRunReadiness } from './readinessEvaluator.mjs';

const report = await evaluateLocalSupabaseDryRunReadiness({
  probeToolchain: true,
  env: process.env,
});

report.startExecuted = false;
report.resetExecuted = false;
report.migrationsExecuted = false;
report.commandsAllowedThisPhase = ['docker --version', 'docker info', 'supabase --version'];

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log(`Phase 9.2B toolchain readiness: ${report.status}`);
  console.log(`docker=${report.docker.status}`);
  console.log(`cli=${report.cli.status} source=${report.cli.source || 'n/a'}`);
  console.log(`config=${report.isolation.config.status}`);
  console.log(`linkedRef=${report.audit.linkedRef || 'none'} preserved=${report.audit.linkedPreserved}`);
  console.log(`level3Authorized=${report.optIn.level3Authorized}`);
  console.log(`guard=${report.guard.status}`);
  if (report.blockers.length) console.log(`blockers: ${report.blockers.join(', ')}`);
  if (report.warnings.length) console.log(`warnings: ${report.warnings.join(', ')}`);
  console.log('Nenhum start/reset/migration executado.');
}

process.exit(report.status === 'READY_AWAITING_LOCAL_RESET_AUTHORIZATION' ? 0 : 2);
