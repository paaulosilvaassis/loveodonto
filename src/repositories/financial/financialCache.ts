/**
 * @module repositories/financial/financialCache
 * @description Cache in-memory por tenant — entidades financeiras core (Phase 5.11 foundation).
 * Não ativado funcionalmente até Phase 5.12 read cutover.
 */

import type {
  FinancingCore,
  IFinancialCache,
  PayableCore,
  ReceivableCore,
} from './financialTypes.js';

export const FINANCIAL_CACHE_TTL_MS = 5 * 60 * 1000;
export const FINANCIAL_CACHE_NAMESPACE = 'financial:core';

type CacheEntry<T> = {
  core: T;
  expiresAt: number;
};

function receivableKey(tenantId: string, ref: string): string {
  return `${FINANCIAL_CACHE_NAMESPACE}:receivable:${tenantId}:${ref}`;
}

function payableKey(tenantId: string, ref: string): string {
  return `${FINANCIAL_CACHE_NAMESPACE}:payable:${tenantId}:${ref}`;
}

function financingKey(tenantId: string, ref: string): string {
  return `${FINANCIAL_CACHE_NAMESPACE}:financing:${tenantId}:${ref}`;
}

function refsForCore(legacyId: string, uuid: string | null): string[] {
  const refs = new Set<string>([legacyId]);
  if (uuid) refs.add(uuid);
  return [...refs].filter(Boolean);
}

export class FinancialCache implements IFinancialCache {
  private receivables = new Map<string, CacheEntry<ReceivableCore>>();
  private payables = new Map<string, CacheEntry<PayableCore>>();
  private financings = new Map<string, CacheEntry<FinancingCore>>();

  private getEntry<T>(store: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.core;
  }

  private setEntry<T extends { legacyId: string; uuid: string | null }>(
    store: Map<string, CacheEntry<T>>,
    tenantId: string,
    core: T,
    keyFn: (tid: string, ref: string) => string,
  ): void {
    const tid = String(tenantId || '').trim();
    if (!tid || !core?.legacyId) return;
    const expiresAt = Date.now() + FINANCIAL_CACHE_TTL_MS;
    for (const ref of refsForCore(core.legacyId, core.uuid)) {
      store.set(keyFn(tid, ref), { core, expiresAt });
    }
  }

  private deleteEntry(
    store: Map<string, CacheEntry<unknown>>,
    tenantId: string,
    ref: string,
    keyFn: (tid: string, r: string) => string,
  ): void {
    const tid = String(tenantId || '').trim();
    const needle = String(ref || '').trim();
    if (!tid || !needle) return;
    store.delete(keyFn(tid, needle));
  }

  getReceivable(tenantId: string, ref: string): ReceivableCore | null {
    const tid = String(tenantId || '').trim();
    const needle = String(ref || '').trim();
    if (!tid || !needle) return null;
    return this.getEntry(this.receivables, receivableKey(tid, needle));
  }

  setReceivable(tenantId: string, core: ReceivableCore): void {
    this.setEntry(this.receivables, tenantId, core, receivableKey);
  }

  deleteReceivable(tenantId: string, ref: string): void {
    this.deleteEntry(this.receivables, tenantId, ref, receivableKey);
  }

  getPayable(tenantId: string, ref: string): PayableCore | null {
    const tid = String(tenantId || '').trim();
    const needle = String(ref || '').trim();
    if (!tid || !needle) return null;
    return this.getEntry(this.payables, payableKey(tid, needle));
  }

  setPayable(tenantId: string, core: PayableCore): void {
    this.setEntry(this.payables, tenantId, core, payableKey);
  }

  deletePayable(tenantId: string, ref: string): void {
    this.deleteEntry(this.payables, tenantId, ref, payableKey);
  }

  getFinancing(tenantId: string, ref: string): FinancingCore | null {
    const tid = String(tenantId || '').trim();
    const needle = String(ref || '').trim();
    if (!tid || !needle) return null;
    return this.getEntry(this.financings, financingKey(tid, needle));
  }

  setFinancing(tenantId: string, core: FinancingCore): void {
    this.setEntry(this.financings, tenantId, core, financingKey);
  }

  deleteFinancing(tenantId: string, ref: string): void {
    this.deleteEntry(this.financings, tenantId, ref, financingKey);
  }

  clearTenant(tenantId: string): void {
    const tid = String(tenantId || '').trim();
    if (!tid) return;
    const prefix = `${FINANCIAL_CACHE_NAMESPACE}:`;
    const suffix = `:${tid}:`;
    for (const store of [this.receivables, this.payables, this.financings]) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix) && key.includes(suffix)) store.delete(key);
      }
    }
  }

  invalidateTenant(tenantId: string): void {
    this.clearTenant(tenantId);
  }
}

export function createFinancialCache(): IFinancialCache {
  return new FinancialCache();
}
