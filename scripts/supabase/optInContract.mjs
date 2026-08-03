/**
 * Phase 9.2B — contrato de opt-in em 3 níveis (puro, sem spawn).
 */
import {
  INTEGRATION_OPT_IN,
  LOCAL_CONFIRMATION_ENV,
  LOCAL_CONFIRMATION_VALUE,
} from './constants.mjs';

export const APPLY_RESET_ENV = 'APPLY_LOCAL_DB_RESET';

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function evaluateOptInContract(env = process.env) {
  const level1 = isTruthy(env[INTEGRATION_OPT_IN]);
  const level2 = String(env[LOCAL_CONFIRMATION_ENV] || '').trim() === LOCAL_CONFIRMATION_VALUE;
  const level3 = isTruthy(env[APPLY_RESET_ENV]);

  const levels = {
    level1_integration: {
      env: INTEGRATION_OPT_IN,
      required: true,
      present: level1,
      valueSanitized: level1 ? 'true' : 'absent_or_false',
    },
    level2_disposable_confirmation: {
      env: LOCAL_CONFIRMATION_ENV,
      required: true,
      present: level2,
      valueSanitized: level2 ? LOCAL_CONFIRMATION_VALUE : 'absent_or_mismatch',
    },
    level3_reset_apply: {
      env: APPLY_RESET_ENV,
      requiredForApply: true,
      present: level3,
      valueSanitized: level3 ? 'true' : 'absent_or_false',
      authorizedInPhase92b: false,
    },
  };

  const forToolchainValidation = true; // structural readiness does not require env set
  const forDryRunExecution = level1 && level2 && level3;

  let status = 'OPT_IN_NONE';
  if (level1 && level2 && level3) status = 'OPT_IN_ALL_THREE';
  else if (level1 && level2) status = 'OPT_IN_LEVELS_1_2';
  else if (level1) status = 'OPT_IN_LEVEL_1_ONLY';
  else if (level2) status = 'OPT_IN_LEVEL_2_ONLY';

  return {
    levels,
    status,
    contractPrepared: true,
    level1Present: level1,
    level2Present: level2,
    level3Authorized: level3,
    dryRunExecutionAllowed: forDryRunExecution,
    phase92bAllowsLevel3Execution: false,
    note: 'Phase 9.2B: levels 1–2 are structural; level 3 must remain unauthorized for execution',
    forToolchainValidation,
  };
}

/** Compat 9.2A — níveis 1+2. */
export function evaluateOptIn(env = process.env) {
  const contract = evaluateOptInContract(env);
  const blockers = [];
  if (!contract.level1Present) blockers.push('OPT_IN_REQUIRED');
  if (!contract.level2Present) blockers.push('LOCAL_CONFIRMATION_REQUIRED');
  return {
    integrationOptIn: contract.level1Present,
    confirmationOk: contract.level2Present,
    resetAuthorized: contract.level3Authorized,
    blockers,
    status: blockers.length === 0 ? 'OPT_IN_OK' : 'LOCAL_INTEGRATION_SKIPPED',
    contract,
  };
}
