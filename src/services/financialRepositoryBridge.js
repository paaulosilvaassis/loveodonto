/**
 * Ponte controlada entre services financeiros (legado IDB) e financialRepository V3.
 * Phase 5.12 read cutover via flags.
 */

import { normalizeTenantId } from './tenantIsolation.js';
import {
  createFinancialRepository,
  rehydrateFinancialCacheIfPrimary,
} from '../repositories/financial/financialRepository.ts';
import {
  getFinancialRepositoryFlags,
  isFinancialDualWriteOnlyEnabled,
  isFinancialReadPrimaryEnabled,
  isFinancialWritePrimaryEnabled,
  shouldRunFinancialShadowOrCompare,
} from '../repositories/financial/financialRepositoryFlags.ts';
import {
  registerFinancialRemoteGetFinancing,
  registerFinancialRemoteGetPayable,
  registerFinancialRemoteGetReceivable,
  registerFinancialRemoteListFinancings,
  registerFinancialRemoteListPayables,
  registerFinancialRemoteListReceivables,
  registerFinancialRemoteCreateReceivable,
  registerFinancialRemoteUpdateReceivable,
  registerFinancialRemoteCreatePayable,
  registerFinancialRemoteUpdatePayable,
  registerFinancialRemoteDeletePayable,
  registerFinancialRemoteCreateFinancing,
  registerFinancialRemoteUpdateFinancing,
} from '../repositories/financial/financialAdminApiRepository.ts';
import {
  createFinancingRemote,
  createPayableRemote,
  createReceivableRemote,
  deletePayableRemote,
  fetchFinancingRemote,
  fetchFinancingsRemote,
  fetchPayableRemote,
  fetchPayablesRemote,
  fetchReceivableRemote,
  fetchReceivablesRemote,
  updateFinancingRemote,
  updatePayableRemote,
  updateReceivableRemote,
} from './financialAdminApi.js';

/** @type {import('../repositories/financial/financialRepositoryFlags.ts').FinancialRepositoryFlagsInput | null} */
let flagsInputOverride = null;

/** @type {(() => import('../repositories/financial/financialTypes.ts').IFinancialRepository) | null} */
let repositoryFactoryOverride = null;

let remoteClientsRegistered = false;

function ensureRemoteClientsRegistered() {
  if (remoteClientsRegistered) return;
  remoteClientsRegistered = true;

  registerFinancialRemoteListReceivables(async (_tenantId, filters) => fetchReceivablesRemote(filters));
  registerFinancialRemoteGetReceivable(async (_tenantId, ref) => fetchReceivableRemote(ref));
  registerFinancialRemoteListPayables(async (_tenantId, filters) => fetchPayablesRemote(filters));
  registerFinancialRemoteGetPayable(async (_tenantId, ref) => fetchPayableRemote(ref));
  registerFinancialRemoteListFinancings(async (_tenantId, filters) => fetchFinancingsRemote(filters));
  registerFinancialRemoteGetFinancing(async (_tenantId, ref) => fetchFinancingRemote(ref));
  registerFinancialRemoteCreateReceivable(async (_tenantId, dto, meta) => createReceivableRemote(dto, meta));
  registerFinancialRemoteUpdateReceivable(async (_tenantId, ref, dto, meta) => updateReceivableRemote(ref, dto, meta));
  registerFinancialRemoteCreatePayable(async (_tenantId, dto, meta) => createPayableRemote(dto, meta));
  registerFinancialRemoteUpdatePayable(async (_tenantId, ref, dto, meta) => updatePayableRemote(ref, dto, meta));
  registerFinancialRemoteDeletePayable(async (_tenantId, ref, meta) => deletePayableRemote(ref, meta));
  registerFinancialRemoteCreateFinancing(async (_tenantId, dto, meta) => createFinancingRemote(dto, meta));
  registerFinancialRemoteUpdateFinancing(async (_tenantId, ref, dto, meta) => updateFinancingRemote(ref, dto, meta));
}

/**
 * Apenas testes — injeta overrides de flags.
 * @param {import('../repositories/financial/financialRepositoryFlags.ts').FinancialRepositoryFlagsInput | null} input
 */
export function __setFinancialServiceBridgeFlagsForTest(input) {
  flagsInputOverride = input;
}

/**
 * Apenas testes — injeta factory do repository.
 * @param {(() => import('../repositories/financial/financialTypes.ts').IFinancialRepository) | null} factory
 */
export function __setFinancialRepositoryFactoryForTest(factory) {
  repositoryFactoryOverride = factory;
}

/** @returns {import('../repositories/financial/financialRepositoryFlags.ts').FinancialRepositoryFlagsInput} */
function bridgeFlagsInput() {
  return flagsInputOverride ?? {};
}

function getRepository() {
  ensureRemoteClientsRegistered();
  const factory = repositoryFactoryOverride ?? createFinancialRepository;
  return factory({ flagsInput: bridgeFlagsInput() });
}

export function getFinancialRepositoryForRead() {
  return getRepository();
}

export function shouldUseFinancialRepositoryRead() {
  return isFinancialReadPrimaryEnabled(bridgeFlagsInput());
}

export function shouldUseFinancialRepositoryWrite() {
  return isFinancialDualWriteOnlyEnabled(bridgeFlagsInput());
}

export function shouldUseFinancialRepositoryWritePrimary() {
  return isFinancialWritePrimaryEnabled(bridgeFlagsInput());
}

export function shouldRunFinancialShadowRead() {
  return shouldRunFinancialShadowOrCompare(bridgeFlagsInput());
}

export function scheduleFinancialCacheRehydrate(tenantId) {
  if (!shouldUseFinancialRepositoryRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  queueMicrotask(() => {
    void rehydrateFinancialCacheIfPrimary(normalized);
  });
}

async function runShadowReadSafe(tenantId, domain, context) {
  try {
    await getRepository().compareIdbVsRemote(tenantId, domain);
    if (import.meta.env?.DEV) {
      console.debug('[FINANCIAL_SHADOW]', context, { tenantId, domain, ok: true });
    }
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.debug('[FINANCIAL_SHADOW] skipped:', context, err instanceof Error ? err.message : err);
    }
  }
}

/**
 * Agenda shadow/compare em background — não altera retorno legado.
 * @param {string | null | undefined} tenantId
 * @param {'receivable'|'payable'|'financing'} [domain]
 * @param {string} [context]
 */
export function scheduleFinancialShadowRead(tenantId, domain = 'receivable', context = 'read') {
  if (!shouldRunFinancialShadowRead()) return;
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  queueMicrotask(() => {
    void runShadowReadSafe(normalized, domain, context);
  });
}

export function getFinancialRepositoryFlagsForBridge() {
  return getFinancialRepositoryFlags(bridgeFlagsInput());
}
