/**
 * Phase 9.2 — LOCAL_DATABASE_TEST / RLS_SIMULATION_TEST (opt-in).
 * NÃO roda sob `npm test` de forma efetiva: skip sem RUN_SUPABASE_LOCAL_INTEGRATION=true.
 * Preferir: npm run test:supabase:local
 */
import { describe, expect, it } from 'vitest';
import { runLocalIntegration } from '../../scripts/phase92/localIntegration.mjs';

const optIn = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.RUN_SUPABASE_LOCAL_INTEGRATION || '').toLowerCase(),
);

describe.skipIf(!optIn)('Phase 9.2 — LOCAL_DATABASE_TEST (opt-in)', () => {
  it(
    'gate/CLI/reset conforme políticas locais',
    async () => {
      const report = await runLocalIntegration();
      expect(report.usedNpx).toBe(false);
      expect([
        'LOCAL_DRY_RUN_PASS',
        'LOCAL_DATABASE_DRY_RUN_BLOCKED',
        'BLOCKED_NON_LOCAL_ENVIRONMENT',
        'BLOCKED_STATIC_PREFLIGHT_FAILED',
        'FAILED',
      ]).toContain(report.status);
      // Com linked-project atual, o único resultado seguro esperado é bloqueio.
      if (report.gate?.remoteProjectLinked) {
        expect(report.status).toBe('BLOCKED_NON_LOCAL_ENVIRONMENT');
        expect(report.migrationsExecuted).toBe(false);
      }
    },
    60_000,
  );
});

describe.skipIf(!optIn)('Phase 9.2 — RLS_SIMULATION_TEST (opt-in)', () => {
  it(
    'não afirma RLS runtime sem apply bem-sucedido',
    async () => {
      const report = await runLocalIntegration();
      if (report.status !== 'LOCAL_DRY_RUN_PASS') {
        expect(report.migrationsExecuted).toBe(false);
      }
    },
    60_000,
  );
});
