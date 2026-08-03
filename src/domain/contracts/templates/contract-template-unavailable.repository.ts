/**
 * @module domain/contracts/templates/contract-template-unavailable.repository
 * @description Repository padrão quando migrations v2 não estão disponíveis — Phase 10.4.
 */

import type { ContractTemplateApplicationRepository } from './contract-template.application-repository.js';

function unavailable(): never {
  const err = new Error('O módulo de modelos v2 ainda não está disponível neste ambiente.');
  (err as Error & { code: string }).code = 'CONTRACTS_V2_STORAGE_UNAVAILABLE';
  throw err;
}

/** Todas as operações falham de forma controlada — sem fallback para legado. */
export class ContractTemplateUnavailableRepository
  implements ContractTemplateApplicationRepository
{
  findById = async () => unavailable();
  list = async () => unavailable();
  create = async () => unavailable();
  update = async () => unavailable();
  saveVersion = async () => unavailable();
  updateVersion = async () => unavailable();
  findVersionById = async () => unavailable();
  listVersions = async () => unavailable();
  publishVersion = async () => unavailable();
  publishVersionTransaction = async () => unavailable();
  archive = async () => unavailable();
}
