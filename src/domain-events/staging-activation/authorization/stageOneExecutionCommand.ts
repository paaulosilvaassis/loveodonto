/**
 * @module domain-events/staging-activation/authorization/stageOneExecutionCommand
 * Dry-run only in Phase 8.8. dryRun=false → not_authorized_in_phase_8_8.
 */

import type { StageOneExecutionCommandResult } from './stagingAuthorizationTypes.js';

let cmdSeq = 0;

export interface StageOneExecutionCommandInput {
  authorizationPackageId: string;
  explicitExecutionApprovalId?: string | null;
  environmentId?: string | null;
  tenantIds?: readonly string[];
  expectedFlagBaseline?: Readonly<Record<string, boolean>>;
  dryRun: boolean;
}

/**
 * Contrato dry-run. Nenhuma mutation/flag/remote.
 */
export function executeControlledStagingStageOne(
  input: StageOneExecutionCommandInput,
): StageOneExecutionCommandResult {
  cmdSeq += 1;
  if (input.dryRun !== true) {
    return Object.freeze({
      commandId: `stage1-cmd-${cmdSeq}`,
      dryRun: false,
      authorized: false,
      code: 'not_authorized_in_phase_8_8',
      message:
        'Phase 8.8 — dryRun=false rejeitado; execução real não autorizada nesta phase',
      flagsChanged: false,
      remoteActionsExecuted: false,
      mutations: false,
    });
  }

  return Object.freeze({
    commandId: `stage1-cmd-${cmdSeq}`,
    dryRun: true,
    authorized: false,
    code: 'dry_run_ok',
    message:
      'Dry-run estrutural OK — nenhuma flag alterada; Stage 1 não executado; awaiting Phase 8.9 + autorização explícita',
    flagsChanged: false,
    remoteActionsExecuted: false,
    mutations: false,
  });
}

export function __resetStageOneCmdSeqForTest(): void {
  cmdSeq = 0;
}
