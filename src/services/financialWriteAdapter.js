/**
 * Adapter de escrita Financeiro — Phase 5.13 dual-write + Phase 5.14 primary write/hydrate.
 * IDB legado permanece authority imediata; remote SSOT quando WRITE_PRIMARY=true (hydrate mirror).
 */
import { normalizeTenantId } from './tenantIsolation.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import {
  mapFinancingLegacyToCreateDto,
  mapFinancingLegacyToUpdateDto,
  mapPayableLegacyToCreateDto,
  mapPayableLegacyToUpdateDto,
  mapReceivableLegacyToCreateDto,
  mapReceivableLegacyToUpdateDto,
} from '../repositories/financial/financialMapper.ts';
import {
  buildFinancialWriteSoakReport,
  recordFinancialWriteSoakFallbackLegacy,
} from '../repositories/financial/financialWriteSoak.ts';
import {
  getFinancialRepositoryForRead,
  scheduleFinancialShadowRead,
  shouldUseFinancialRepositoryWrite,
  shouldUseFinancialRepositoryWritePrimary,
} from './financialRepositoryBridge.js';

function logFinancialWriteAdapterDev(event, payload) {
  if (!import.meta.env?.DEV) return;
  console.debug('[FINANCIAL_WRITE_ADAPTER]', event, payload);
}

async function runWriteSafe(runner, context) {
  try {
    await runner();
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'financial-write failed');
    if (context.mode === 'primary') {
      recordFinancialWriteSoakFallbackLegacy();
    }
    logFinancialWriteAdapterDev(context.event, {
      ...context,
      ok: false,
      error: message,
      rollback: 'indexeddb-preserved',
    });
    return { ok: false, error: message };
  }
}

function scheduleShadowCompare(tenantId, domain) {
  scheduleFinancialShadowRead(tenantId, domain, 'write');
}

function resolveTenantId(user, record) {
  return normalizeTenantId(
    record?.tenant_id || record?.tenantId || resolveTenantIdForWrite(user, null),
  );
}

function scheduleRepositoryWrite(runner, context) {
  const isPrimary = shouldUseFinancialRepositoryWritePrimary();
  const isDual = shouldUseFinancialRepositoryWrite();
  if (!isPrimary && !isDual) return;
  const mode = isPrimary ? 'primary' : 'dual';
  queueMicrotask(() => {
    void runWriteSafe(runner, { ...context, mode });
  });
}

async function runReceivableCreate(user, record, tenantId) {
  const repo = getFinancialRepositoryForRead();
  const dto = mapReceivableLegacyToCreateDto(record);
  const writeSource = shouldUseFinancialRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';
  await repo.createReceivableCore(tenantId, dto, { writeSource });
  scheduleShadowCompare(tenantId, 'receivable');
  logFinancialWriteAdapterDev('createReceivable', { tenantId, legacyId: record.id, userId: user?.id, ok: true });
}

async function runReceivableUpdate(user, record, tenantId, partial = {}) {
  const repo = getFinancialRepositoryForRead();
  const dto = mapReceivableLegacyToUpdateDto(record, partial);
  const writeSource = shouldUseFinancialRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';
  await repo.updateReceivableCore(tenantId, record.id, dto, { writeSource });
  scheduleShadowCompare(tenantId, 'receivable');
  logFinancialWriteAdapterDev('updateReceivable', { tenantId, legacyId: record.id, userId: user?.id, ok: true });
}

async function runPayableCreate(user, record, tenantId) {
  const repo = getFinancialRepositoryForRead();
  const dto = mapPayableLegacyToCreateDto(record);
  const writeSource = shouldUseFinancialRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';
  await repo.createPayableCore(tenantId, dto, { writeSource });
  scheduleShadowCompare(tenantId, 'payable');
  logFinancialWriteAdapterDev('createPayable', { tenantId, legacyId: record.id, userId: user?.id, ok: true });
}

async function runPayableUpdate(user, record, tenantId, partial = {}) {
  const repo = getFinancialRepositoryForRead();
  const dto = mapPayableLegacyToUpdateDto(record, partial);
  const writeSource = shouldUseFinancialRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';
  await repo.updatePayableCore(tenantId, record.id, dto, { writeSource });
  scheduleShadowCompare(tenantId, 'payable');
  logFinancialWriteAdapterDev('updatePayable', { tenantId, legacyId: record.id, userId: user?.id, ok: true });
}

async function runPayableDelete(user, legacyId, tenantId) {
  const repo = getFinancialRepositoryForRead();
  const writeSource = shouldUseFinancialRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';
  await repo.deletePayableCore(tenantId, legacyId, { writeSource });
  scheduleShadowCompare(tenantId, 'payable');
  logFinancialWriteAdapterDev('deletePayable', { tenantId, legacyId, userId: user?.id, ok: true });
}

async function runFinancingCreate(user, record, tenantId) {
  const repo = getFinancialRepositoryForRead();
  const dto = mapFinancingLegacyToCreateDto({ ...record, tenant_id: tenantId });
  const writeSource = shouldUseFinancialRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';
  await repo.createFinancingCore(tenantId, dto, { writeSource });
  scheduleShadowCompare(tenantId, 'financing');
  logFinancialWriteAdapterDev('createFinancing', { tenantId, legacyId: record.id, userId: user?.id, ok: true });
}

async function runFinancingUpdate(user, record, tenantId, partial = {}) {
  const repo = getFinancialRepositoryForRead();
  const dto = mapFinancingLegacyToUpdateDto({ ...record, tenant_id: tenantId }, partial);
  const writeSource = shouldUseFinancialRepositoryWritePrimary() ? 'primary-write-hydrate' : 'legacy-dual-write';
  await repo.updateFinancingCore(tenantId, record.id, dto, { writeSource });
  scheduleShadowCompare(tenantId, 'financing');
  logFinancialWriteAdapterDev('updateFinancing', { tenantId, legacyId: record.id, userId: user?.id, ok: true });
}

export function scheduleFinancialDualWriteCreateReceivable(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return;
  scheduleRepositoryWrite(
    () => runReceivableCreate(user, record, tenantId),
    { event: 'createReceivable', tenantId, legacyId: record?.id, userId: user?.id },
  );
}

export function scheduleFinancialDualWriteUpdateReceivable(user, record, partial = {}) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return;
  scheduleRepositoryWrite(
    () => runReceivableUpdate(user, record, tenantId, partial),
    { event: 'updateReceivable', tenantId, legacyId: record?.id, userId: user?.id },
  );
}

export function scheduleFinancialDualWriteCreatePayable(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return;
  scheduleRepositoryWrite(
    () => runPayableCreate(user, record, tenantId),
    { event: 'createPayable', tenantId, legacyId: record?.id, userId: user?.id },
  );
}

export function scheduleFinancialDualWriteUpdatePayable(user, record, partial = {}) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return;
  scheduleRepositoryWrite(
    () => runPayableUpdate(user, record, tenantId, partial),
    { event: 'updatePayable', tenantId, legacyId: record?.id, userId: user?.id },
  );
}

export function scheduleFinancialDualWriteDeletePayable(user, legacyId, tenantId) {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return;
  scheduleRepositoryWrite(
    () => runPayableDelete(user, legacyId, normalized),
    { event: 'deletePayable', tenantId: normalized, legacyId, userId: user?.id },
  );
}

export function scheduleFinancialDualWriteCreateFinancing(user, record) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return;
  scheduleRepositoryWrite(
    () => runFinancingCreate(user, record, tenantId),
    { event: 'createFinancing', tenantId, legacyId: record?.id, userId: user?.id },
  );
}

export function scheduleFinancialDualWriteUpdateFinancing(user, record, partial = {}) {
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return;
  scheduleRepositoryWrite(
    () => runFinancingUpdate(user, record, tenantId, partial),
    { event: 'updateFinancing', tenantId, legacyId: record?.id, userId: user?.id },
  );
}

/** Preparado — registerReceivablePayment (sem ativação indevida). */
export function scheduleFinancialPrimaryWriteRegisterPayment() {
  if (!shouldUseFinancialRepositoryWritePrimary()) return;
  if (import.meta.env?.DEV) {
    console.debug('[FINANCIAL_WRITE_ADAPTER] registerReceivablePayment preparado — não ativado');
  }
}

/** Preparado — receiveInstallment (sem ativação indevida). */
export function scheduleFinancialPrimaryWriteReceiveInstallment() {
  if (!shouldUseFinancialRepositoryWritePrimary()) return;
  if (import.meta.env?.DEV) {
    console.debug('[FINANCIAL_WRITE_ADAPTER] receiveInstallment preparado — não ativado');
  }
}

/** @deprecated use scheduleFinancialDualWrite* — mantido para compatibilidade de testes 5.13 */
export function scheduleFinancialDualWriteRegisterPayment() {
  scheduleFinancialPrimaryWriteRegisterPayment();
}

/** @deprecated use scheduleFinancialPrimaryWriteReceiveInstallment */
export function scheduleFinancialDualWriteReceiveInstallment() {
  scheduleFinancialPrimaryWriteReceiveInstallment();
}

export async function __runFinancialSoakConsistencyReportForTest(tenantId, domain = 'receivable') {
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return null;
  const compare = await getFinancialRepositoryForRead().compareIdbVsRemote(normalized, domain);
  return buildFinancialWriteSoakReport(normalized, compare);
}

export async function __runFinancialDualWriteCreateReceivableForTest(user, record) {
  const isPrimary = shouldUseFinancialRepositoryWritePrimary();
  const isDual = shouldUseFinancialRepositoryWrite();
  if (!isPrimary && !isDual) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(
    () => runReceivableCreate(user, record, tenantId),
    { event: 'createReceivable', tenantId, legacyId: record?.id, userId: user?.id, mode: isPrimary ? 'primary' : 'dual' },
  );
}

export async function __runFinancialDualWriteUpdateReceivableForTest(user, record, partial = {}) {
  const isPrimary = shouldUseFinancialRepositoryWritePrimary();
  const isDual = shouldUseFinancialRepositoryWrite();
  if (!isPrimary && !isDual) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(
    () => runReceivableUpdate(user, record, tenantId, partial),
    { event: 'updateReceivable', tenantId, legacyId: record?.id, userId: user?.id, mode: isPrimary ? 'primary' : 'dual' },
  );
}

export async function __runFinancialDualWriteCreatePayableForTest(user, record) {
  const isPrimary = shouldUseFinancialRepositoryWritePrimary();
  const isDual = shouldUseFinancialRepositoryWrite();
  if (!isPrimary && !isDual) return { ok: false, skipped: true };
  const tenantId = resolveTenantId(user, record);
  if (!tenantId) return { ok: false, skipped: true };
  return runWriteSafe(
    () => runPayableCreate(user, record, tenantId),
    { event: 'createPayable', tenantId, legacyId: record?.id, userId: user?.id, mode: isPrimary ? 'primary' : 'dual' },
  );
}

export async function __runFinancialDualWriteDeletePayableForTest(user, legacyId, tenantId) {
  const isPrimary = shouldUseFinancialRepositoryWritePrimary();
  const isDual = shouldUseFinancialRepositoryWrite();
  if (!isPrimary && !isDual) return { ok: false, skipped: true };
  const normalized = normalizeTenantId(tenantId);
  if (!normalized) return { ok: false, skipped: true };
  return runWriteSafe(
    () => runPayableDelete(user, legacyId, normalized),
    { event: 'deletePayable', tenantId: normalized, legacyId, userId: user?.id, mode: isPrimary ? 'primary' : 'dual' },
  );
}

export async function __runFinancialPrimaryWriteCreateReceivableForTest(user, record) {
  return __runFinancialDualWriteCreateReceivableForTest(user, record);
}
