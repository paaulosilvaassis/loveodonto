/**
 * Phase 4.10 Wave 0 — Rollback/compensação transacional leve.
 */

import { ApiRollbackError } from './errors.js';

export async function runWithRollback(steps = []) {
  const executed = [];

  try {
    for (const step of steps) {
      const result = await step.run();
      executed.push({ ...step, result });
    }
    return { ok: true, results: executed.map((s) => s.result) };
  } catch (primaryErr) {
    const rollbackErrors = [];

    for (let i = executed.length - 1; i >= 0; i -= 1) {
      const step = executed[i];
      if (typeof step.compensate !== 'function') continue;
      try {
        await step.compensate(step.result);
      } catch (compensateErr) {
        rollbackErrors.push({
          step: step.name || `step_${i}`,
          message: compensateErr?.message || String(compensateErr),
        });
      }
    }

    if (rollbackErrors.length > 0) {
      throw new ApiRollbackError(
        primaryErr?.message || 'Falha na operação e rollback também falhou.',
        {
          primary_error: primaryErr?.message || String(primaryErr),
          rollback_errors: rollbackErrors,
        },
      );
    }

    throw primaryErr;
  }
}
