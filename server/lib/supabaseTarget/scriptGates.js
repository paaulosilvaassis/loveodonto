/**
 * SPF.1A.1 — gates dos scripts CRITICAL/HIGH (puros; nenhum I/O de rede).
 * Cada script chama o seu gate ANTES de criar qualquer client ou fazer fetch.
 * Os testes exercitam estas funções diretamente, sem executar os scripts.
 */
import {
  SupabaseTargetGuardError,
  assertSupabaseTarget,
  describeGuardDecision,
  evaluateOperationGate,
  guardSupabaseOperation,
} from './supabaseTargetGuard.js';

export const SCRIPT_OPERATION_IDS = Object.freeze({
  resetPlatformTenants: 'scripts.reset-platform-tenants',
  manualCollaboratorAccessGuided: 'scripts.manual-collaborator-access-guided',
  rhBackfill: 'scripts.rh-backfill-to-supabase',
  rhBackfillRollback: 'scripts.rh-backfill-to-supabase.rollback',
  collaboratorIdBackfill: 'scripts.collaborator-id-backfill',
  collaboratorIdBackfillRollback: 'scripts.collaborator-id-backfill.rollback',
  applyAeProductionMigrationOne: 'security.applyAeProductionMigrationOne',
  apply037BillingRlsOnly: 'security.apply037BillingRlsOnly',
  apply038ClinicLogosEnumerationOnly: 'security.apply038ClinicLogosEnumerationOnly',
  apply039HelperTextOverloadOnly: 'security.apply039HelperTextOverloadOnly',
  apply040ProductionPrivateStorageOnly: 'security.apply040ProductionPrivateStorageOnly',
});

function argvHas(argv, flag) {
  return Array.isArray(argv) && argv.includes(flag);
}

/** reset-platform-tenants: destrutivo. Production é negado em qualquer modo (inclusive dry-run, que lê PII). */
export function gateResetPlatformTenants({ env = process.env, url, credential, argv = process.argv } = {}) {
  return guardSupabaseOperation({
    env,
    url,
    credential,
    operation: 'destructive',
    operationId: SCRIPT_OPERATION_IDS.resetPlatformTenants,
    apply: argvHas(argv, '--confirm'),
  });
}

/** manual-collaborator-access-guided: troca senha de admin e apaga usuários → destrutivo; exige --apply. */
export function gateManualCollaboratorAccess({ env = process.env, url, credential, argv = process.argv } = {}) {
  return guardSupabaseOperation({
    env,
    url,
    credential,
    operation: 'destructive',
    operationId: SCRIPT_OPERATION_IDS.manualCollaboratorAccessGuided,
    apply: argvHas(argv, '--apply'),
  });
}

/** rh-backfill-to-supabase: escrita; dry-run por padrão. Rollback também é escrita. */
export function gateRhBackfill({
  env = process.env, url, credential, apply = false, rollback = false,
} = {}) {
  return guardSupabaseOperation({
    env,
    url,
    credential,
    operation: 'write',
    operationId: rollback ? SCRIPT_OPERATION_IDS.rhBackfillRollback : SCRIPT_OPERATION_IDS.rhBackfill,
    apply: rollback ? true : apply === true,
  });
}

/** collaborator-id-backfill: escrita; dry-run por padrão. Rollback também é escrita. */
export function gateCollaboratorIdBackfill({
  env = process.env, url, credential, apply = false, rollback = false,
} = {}) {
  return guardSupabaseOperation({
    env,
    url,
    credential,
    operation: 'write',
    operationId: rollback
      ? SCRIPT_OPERATION_IDS.collaboratorIdBackfillRollback
      : SCRIPT_OPERATION_IDS.collaboratorIdBackfill,
    apply: rollback ? true : apply === true,
  });
}

/**
 * Scripts security/apply* (Management API /database/query contra um ref fixo).
 * - O alvo real é o ref fixo do script: precisa bater com LOVE_ODONTO_TARGET_ENV.
 * - Se o script também usa SUPABASE_URL/chave (probes), esse alvo é verificado também.
 * - Não há dry-run real: sem --apply a execução é bloqueada (DRY_RUN_UNSUPPORTED).
 * - Com --apply em production exige autorização versionada (hoje inexistente → nega).
 */
export function gateManagementApiMigrationScript({
  env = process.env, operationId, managementRef, supabaseUrl, credential, argv = process.argv,
} = {}) {
  if (!operationId) throw new SupabaseTargetGuardError('OPERATION_ID_REQUIRED');
  const target = assertSupabaseTarget({ env, url: `https://${managementRef}.supabase.co` });
  if (supabaseUrl || credential) {
    assertSupabaseTarget({ env, url: supabaseUrl, credential });
  }
  const gate = evaluateOperationGate({
    target, operation: 'write', operationId, apply: argvHas(argv, '--apply'), env,
  });
  if (gate.mode !== 'apply') {
    throw new SupabaseTargetGuardError('DRY_RUN_UNSUPPORTED', {
      targetEnv: target.targetEnv,
      operation: 'write',
      operationId,
      reason: 'script aplica SQL diretamente; sem --apply nada é executado',
    });
  }
  return Object.freeze({ target, gate });
}

/**
 * Executa um gate em script CLI: em negação imprime JSON sanitizado e sai com código 2
 * antes de qualquer acesso remoto. Erros que não são do guard são repassados.
 */
export function runScriptGateOrExit(gateFn, { log = console.error, info = console.log, exit = process.exit } = {}) {
  try {
    const result = gateFn();
    info(describeGuardDecision(result));
    return result;
  } catch (err) {
    if (err instanceof SupabaseTargetGuardError) {
      log(JSON.stringify(err.toJSON()));
      exit(2);
      return null;
    }
    throw err;
  }
}
