/**
 * Phase 9.2 entrypoint — static by default; CLI/integration apenas com opt-in CLI flags.
 *
 *   node scripts/phase92-local-dry-run-preflight.mjs
 *   node scripts/phase92-local-dry-run-preflight.mjs --json
 *
 * Não usa npx. Não inicia Docker. Não aplica migrations.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkSupabaseCliAvailability } from './phase92/cliAvailability.mjs';
import { evaluateLocalIntegrationGate } from './phase92/localIntegration.mjs';
import { runStaticPreflight } from './phase92/staticPreflight.mjs';

export { runStaticPreflight } from './phase92/staticPreflight.mjs';
export { evaluateLocalIntegrationGate } from './phase92/localIntegration.mjs';
export { checkSupabaseCliAvailability } from './phase92/cliAvailability.mjs';

/** Compat: relatório consolidado sem spawn (exceto CLI se opt-in). */
export async function runPhase92Preflight(options = {}) {
  const env = options.env || process.env;
  const staticReport = runStaticPreflight({ env });
  const gate = evaluateLocalIntegrationGate(env);
  const cli = await checkSupabaseCliAvailability({
    env,
    probe: options.probeCli === true,
  });

  const localBlocked = gate.status !== 'GATE_OPEN' || staticReport.status !== 'STATIC_PREFLIGHT_PASS';

  return {
    phase: '9.2',
    status: localBlocked
      ? 'blocked_local_environment_not_guaranteed'
      : 'ready_for_local_apply_pending_cli_and_reset',
    reason: localBlocked ? gate.status : null,
    static: staticReport,
    gate,
    cli,
    migrationsExecuted: false,
    remoteSupabaseChanged: false,
    usedNpx: false,
    spawnedProcess: Boolean(cli.probe),
    applyAuthorized: false,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = await runPhase92Preflight({ probeCli: false });
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Phase 9.2 static: ${report.static.status}`);
    console.log(`gate: ${report.gate.status}`);
    console.log(`cli: ${report.cli.status}`);
    for (const c of report.static.checks) {
      console.log(`[${c.result}] ${c.check} — ${c.evidence}`);
    }
    if (report.gate.blockers.length) {
      console.log(`GATE BLOCKERS: ${report.gate.blockers.join(', ')}`);
    }
    console.log('Nenhuma migration executada. Use npm run test:supabase:local com opt-in.');
  }
  process.exit(report.static.status === 'STATIC_PREFLIGHT_PASS' ? 0 : 1);
}
