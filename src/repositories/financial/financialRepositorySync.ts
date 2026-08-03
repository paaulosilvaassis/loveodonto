/**
 * @module repositories/financial/financialRepositorySync
 * @description Helpers de sync/hydrate/compare — Phase 5.11 foundation (não ativados).
 */

import { withDb } from '../../db/index.js';
import type {
  FinancingCore,
  FinancialDomain,
  IFinancialCache,
  PayableCore,
  ReceivableCore,
} from './financialTypes.js';
import {
  mapCoreToFinancingLegacyRow,
  mapCoreToPayableLegacyRow,
  mapCoreToReceivableLegacyRow,
  mapLegacyRowToFinancingCore,
  mapLegacyRowToPayableCore,
  mapLegacyRowToReceivableCore,
} from './financialMapper.js';

export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

export function isRemoteReadUnavailableError(error: unknown): boolean {
  if (isBrowserOffline()) return true;
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('networkerror')
    || message.includes('fetch failed')
    || message.includes('network request failed')
    || message.includes('load failed')
    || message.includes('tempo esgotado')
    || message.includes('não foi possível conectar')
    || message.includes('não registrado')
  );
}

/**
 * Hidrata cache em memória + espelho IndexedDB a partir do roster remoto.
 * Não altera workflow — apenas coleções financeiras core.
 */
export function hydrateFinancialIdbCache(
  domain: FinancialDomain,
  items: Array<ReceivableCore | PayableCore | FinancingCore>,
  tenantId: string,
  cache: IFinancialCache,
): number {
  const tid = String(tenantId || '').trim();
  if (!tid || !Array.isArray(items)) return 0;
  let count = 0;

  withDb((db) => {
    for (const core of items) {
      if (core.tenantId !== tid) continue;

      if (domain === 'receivable') {
        const receivableCore = core as ReceivableCore;
        const legacy = mapCoreToReceivableLegacyRow(receivableCore);
        if (!Array.isArray(db.accountsReceivable)) db.accountsReceivable = [];
        const idx = db.accountsReceivable.findIndex((row) => String(row.id) === legacy.id);
        if (idx >= 0) {
          db.accountsReceivable[idx] = { ...db.accountsReceivable[idx], ...legacy };
        } else {
          db.accountsReceivable.push(legacy);
        }
        cache.setReceivable(tid, receivableCore);
        count += 1;
      } else if (domain === 'payable') {
        const payableCore = core as PayableCore;
        const legacy = mapCoreToPayableLegacyRow(payableCore);
        if (!Array.isArray(db.payables)) db.payables = [];
        const idx = db.payables.findIndex((row) => String(row.id) === legacy.id);
        if (idx >= 0) {
          db.payables[idx] = { ...db.payables[idx], ...legacy };
        } else {
          db.payables.push(legacy);
        }
        cache.setPayable(tid, payableCore);
        count += 1;
      } else if (domain === 'financing') {
        const financingCore = core as FinancingCore;
        const legacy = mapCoreToFinancingLegacyRow(financingCore);
        if (!Array.isArray(db.financings)) db.financings = [];
        const idx = db.financings.findIndex((row) => String(row.id) === legacy.id);
        if (idx >= 0) {
          db.financings[idx] = { ...db.financings[idx], ...legacy };
        } else {
          db.financings.push(legacy);
        }
        cache.setFinancing(tid, financingCore);
        count += 1;
      }
    }
    return db;
  });

  return count;
}

export function compareReceivableShapes(
  idbCore: ReceivableCore | null,
  remoteCore: ReceivableCore | null,
): Record<string, unknown> {
  const diffs: Array<{ field: string; indexedDb: unknown; remote: unknown }> = [];
  if (!idbCore && !remoteCore) return { match: true, diffs: [] };
  if (!idbCore || !remoteCore) {
    return {
      match: false,
      diffs: [{ field: 'presence', indexedDb: Boolean(idbCore), remote: Boolean(remoteCore) }],
    };
  }
  const fields: Array<keyof ReceivableCore> = [
    'dueDate', 'netAmount', 'paidAmount', 'status', 'patientId', 'description',
  ];
  for (const field of fields) {
    if (String(idbCore[field] ?? '') !== String(remoteCore[field] ?? '')) {
      diffs.push({ field, indexedDb: idbCore[field], remote: remoteCore[field] });
    }
  }
  return { match: diffs.length === 0, diffs };
}

export function comparePayableShapes(
  idbCore: PayableCore | null,
  remoteCore: PayableCore | null,
): Record<string, unknown> {
  const diffs: Array<{ field: string; indexedDb: unknown; remote: unknown }> = [];
  if (!idbCore && !remoteCore) return { match: true, diffs: [] };
  if (!idbCore || !remoteCore) {
    return {
      match: false,
      diffs: [{ field: 'presence', indexedDb: Boolean(idbCore), remote: Boolean(remoteCore) }],
    };
  }
  const fields: Array<keyof PayableCore> = ['dueDate', 'amount', 'paidAmount', 'status', 'description'];
  for (const field of fields) {
    if (String(idbCore[field] ?? '') !== String(remoteCore[field] ?? '')) {
      diffs.push({ field, indexedDb: idbCore[field], remote: remoteCore[field] });
    }
  }
  return { match: diffs.length === 0, diffs };
}

export function compareFinancingShapes(
  idbCore: FinancingCore | null,
  remoteCore: FinancingCore | null,
): Record<string, unknown> {
  const diffs: Array<{ field: string; indexedDb: unknown; remote: unknown }> = [];
  if (!idbCore && !remoteCore) return { match: true, diffs: [] };
  if (!idbCore || !remoteCore) {
    return {
      match: false,
      diffs: [{ field: 'presence', indexedDb: Boolean(idbCore), remote: Boolean(remoteCore) }],
    };
  }
  const fields: Array<keyof FinancingCore> = [
    'status', 'totalAmount', 'entryAmount', 'installmentsCount', 'patientId',
  ];
  for (const field of fields) {
    if (String(idbCore[field] ?? '') !== String(remoteCore[field] ?? '')) {
      diffs.push({ field, indexedDb: idbCore[field], remote: remoteCore[field] });
    }
  }
  return { match: diffs.length === 0, diffs };
}

export function logFinancialReadDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[FINANCIAL_READ]', event, payload);
}

export function logFinancialShadowDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[FINANCIAL_SHADOW]', event, payload);
}

export function logFinancialWriteDev(event: string, payload: Record<string, unknown>): void {
  if (!import.meta.env?.DEV) return;
  console.debug('[FINANCIAL_WRITE]', event, payload);
}

export function compareFinancialWriteLegacyVsRemote(
  domain: FinancialDomain,
  legacyCore: ReceivableCore | PayableCore | FinancingCore | null,
  remoteCore: ReceivableCore | PayableCore | FinancingCore | null,
): Record<string, unknown> {
  if (domain === 'receivable') {
    return compareReceivableShapes(
      legacyCore as ReceivableCore | null,
      remoteCore as ReceivableCore | null,
    );
  }
  if (domain === 'payable') {
    return comparePayableShapes(
      legacyCore as PayableCore | null,
      remoteCore as PayableCore | null,
    );
  }
  if (domain === 'financing') {
    return compareFinancingShapes(
      legacyCore as FinancingCore | null,
      remoteCore as FinancingCore | null,
    );
  }
  return { match: true, diffs: [], skipped: true, domain };
}

export {
  mapLegacyRowToReceivableCore,
  mapLegacyRowToPayableCore,
  mapLegacyRowToFinancingCore,
};
