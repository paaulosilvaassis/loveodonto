/**
 * @module domain-events/staging-activation/authorization/stagingEnvironmentDeclaration
 * Phase 8.8 — declaração de ambiente. Sem inventar dados.
 */

import { PRODUCTION_SUPABASE_PROJECT_REF } from '../../domainEventFlags.js';
import type { StagingEnvironmentDeclaration } from './stagingAuthorizationTypes.js';

export interface StagingEnvironmentDeclarationInput {
  environmentId?: string | null;
  environmentName?: string | null;
  environmentType?: 'staging' | 'unknown' | 'production' | null;
  host?: string | null;
  projectRef?: string | null;
  owner?: string | null;
  declaredAt?: string | null;
  declaredBy?: string | null;
  dataClassification?: string | null;
  allowedOperations?: readonly string[];
  forbiddenOperations?: readonly string[];
  expiresAt?: string | null;
}

export function buildStagingEnvironmentDeclaration(
  input: StagingEnvironmentDeclarationInput = {},
): StagingEnvironmentDeclaration {
  const host = input.host ?? null;
  const projectRef = input.projectRef ?? null;
  const type = input.environmentType ?? null;
  const blockers: string[] = [];

  if (!host) blockers.push('host obrigatório ausente');
  if (!projectRef) blockers.push('projectRef obrigatório ausente');
  if (!input.owner) blockers.push('owner ausente');
  if (!input.declaredBy) blockers.push('declaredBy ausente');
  if (!input.declaredAt) blockers.push('declaredAt ausente');
  if (!input.expiresAt) blockers.push('expiresAt ausente');
  if (type !== 'staging') blockers.push('environmentType deve ser staging');

  const isProduction = type === 'production'
    || String(projectRef || '').toLowerCase() === PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase()
    || String(host || '').toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF.toLowerCase());

  if (isProduction) blockers.push('produção rejeitada');
  if (input.expiresAt && Date.parse(input.expiresAt) < Date.now()) {
    blockers.push('declaração expirada');
  }

  const isStaging = type === 'staging' && !isProduction;
  const complete = blockers.length === 0 && isStaging;

  return Object.freeze({
    environmentId: input.environmentId ?? null,
    environmentName: input.environmentName ?? null,
    environmentType: type,
    host,
    projectRef,
    owner: input.owner ?? null,
    declaredAt: input.declaredAt ?? null,
    declaredBy: input.declaredBy ?? null,
    isProduction,
    isStaging,
    dataClassification: input.dataClassification ?? null,
    allowedOperations: Object.freeze([
      ...(input.allowedOperations || ['read', 'inspect']),
    ]),
    forbiddenOperations: Object.freeze([
      ...(input.forbiddenOperations || [
        'write',
        'mutate',
        'migrate',
        'seed',
        'flag_activate',
      ]),
    ]),
    expiresAt: input.expiresAt ?? null,
    complete,
    blockers: Object.freeze(blockers),
  });
}

export function buildEmptyStagingEnvironmentDeclaration(): StagingEnvironmentDeclaration {
  return buildStagingEnvironmentDeclaration({});
}
