/**
 * @module repositories/financial/financialAdminApiRepository
 * @description Cliente remoto Admin API — read (5.12) + write (5.13).
 */

import type {
  FinancingCore,
  FinancingCreateCoreDto,
  FinancingUpdateCoreDto,
  FinancialListFilters,
  FinancialWriteMeta,
  IFinancialAdminApiClient,
  PayableCore,
  PayableCreateCoreDto,
  PayableUpdateCoreDto,
  ReceivableCore,
  ReceivableCreateCoreDto,
  ReceivableUpdateCoreDto,
} from './financialTypes.js';

export type FinancialRemoteListReceivablesFn = (
  tenantId: string,
  filters?: FinancialListFilters,
) => Promise<ReceivableCore[]>;

export type FinancialRemoteGetReceivableFn = (
  tenantId: string,
  ref: string,
) => Promise<ReceivableCore | null>;

export type FinancialRemoteListPayablesFn = (
  tenantId: string,
  filters?: FinancialListFilters,
) => Promise<PayableCore[]>;

export type FinancialRemoteGetPayableFn = (
  tenantId: string,
  ref: string,
) => Promise<PayableCore | null>;

export type FinancialRemoteListFinancingsFn = (
  tenantId: string,
  filters?: FinancialListFilters,
) => Promise<FinancingCore[]>;

export type FinancialRemoteGetFinancingFn = (
  tenantId: string,
  ref: string,
) => Promise<FinancingCore | null>;

export type FinancialRemoteCreateReceivableFn = (
  tenantId: string,
  dto: ReceivableCreateCoreDto,
  meta?: FinancialWriteMeta,
) => Promise<ReceivableCore | null>;

export type FinancialRemoteUpdateReceivableFn = (
  tenantId: string,
  legacyId: string,
  dto: ReceivableUpdateCoreDto,
  meta?: FinancialWriteMeta,
) => Promise<ReceivableCore | null>;

export type FinancialRemoteCreatePayableFn = (
  tenantId: string,
  dto: PayableCreateCoreDto,
  meta?: FinancialWriteMeta,
) => Promise<PayableCore | null>;

export type FinancialRemoteUpdatePayableFn = (
  tenantId: string,
  legacyId: string,
  dto: PayableUpdateCoreDto,
  meta?: FinancialWriteMeta,
) => Promise<PayableCore | null>;

export type FinancialRemoteDeletePayableFn = (
  tenantId: string,
  legacyId: string,
  meta?: FinancialWriteMeta,
) => Promise<boolean>;

export type FinancialRemoteCreateFinancingFn = (
  tenantId: string,
  dto: FinancingCreateCoreDto,
  meta?: FinancialWriteMeta,
) => Promise<FinancingCore | null>;

export type FinancialRemoteUpdateFinancingFn = (
  tenantId: string,
  legacyId: string,
  dto: FinancingUpdateCoreDto,
  meta?: FinancialWriteMeta,
) => Promise<FinancingCore | null>;

export function createFinancialAdminApiRepository(
  listReceivablesFn: FinancialRemoteListReceivablesFn,
  getReceivableFn: FinancialRemoteGetReceivableFn,
  listPayablesFn?: FinancialRemoteListPayablesFn,
  getPayableFn?: FinancialRemoteGetPayableFn,
  listFinancingsFn?: FinancialRemoteListFinancingsFn,
  getFinancingFn?: FinancialRemoteGetFinancingFn,
  createReceivableFn?: FinancialRemoteCreateReceivableFn,
  updateReceivableFn?: FinancialRemoteUpdateReceivableFn,
  createPayableFn?: FinancialRemoteCreatePayableFn,
  updatePayableFn?: FinancialRemoteUpdatePayableFn,
  deletePayableFn?: FinancialRemoteDeletePayableFn,
  createFinancingFn?: FinancialRemoteCreateFinancingFn,
  updateFinancingFn?: FinancialRemoteUpdateFinancingFn,
): IFinancialAdminApiClient {
  return {
    async listReceivables(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid) return [];
      return listReceivablesFn(tid, filters);
    },
    async getReceivable(tenantId, ref) {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle) return null;
      return getReceivableFn(tid, needle);
    },
    async listPayables(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid || !listPayablesFn) return [];
      return listPayablesFn(tid, filters);
    },
    async getPayable(tenantId, ref) {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle || !getPayableFn) return null;
      return getPayableFn(tid, needle);
    },
    async listFinancings(tenantId, filters) {
      const tid = String(tenantId || '').trim();
      if (!tid || !listFinancingsFn) return [];
      return listFinancingsFn(tid, filters);
    },
    async getFinancing(tenantId, ref) {
      const tid = String(tenantId || '').trim();
      const needle = String(ref || '').trim();
      if (!tid || !needle || !getFinancingFn) return null;
      return getFinancingFn(tid, needle);
    },
    async createReceivable(tenantId, dto, meta) {
      const tid = String(tenantId || '').trim();
      if (!tid || !createReceivableFn) return null;
      return createReceivableFn(tid, dto, meta);
    },
    async updateReceivable(tenantId, legacyId, dto, meta) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !updateReceivableFn) return null;
      return updateReceivableFn(tid, ref, dto, meta);
    },
    async createPayable(tenantId, dto, meta) {
      const tid = String(tenantId || '').trim();
      if (!tid || !createPayableFn) return null;
      return createPayableFn(tid, dto, meta);
    },
    async updatePayable(tenantId, legacyId, dto, meta) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !updatePayableFn) return null;
      return updatePayableFn(tid, ref, dto, meta);
    },
    async deletePayable(tenantId, legacyId, meta) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !deletePayableFn) return false;
      return deletePayableFn(tid, ref, meta);
    },
    async createFinancing(tenantId, dto, meta) {
      const tid = String(tenantId || '').trim();
      if (!tid || !createFinancingFn) return null;
      return createFinancingFn(tid, dto, meta);
    },
    async updateFinancing(tenantId, legacyId, dto, meta) {
      const tid = String(tenantId || '').trim();
      const ref = String(legacyId || '').trim();
      if (!tid || !ref || !updateFinancingFn) return null;
      return updateFinancingFn(tid, ref, dto, meta);
    },
  };
}

let defaultListReceivablesFn: FinancialRemoteListReceivablesFn | null = null;
let defaultGetReceivableFn: FinancialRemoteGetReceivableFn | null = null;
let defaultListPayablesFn: FinancialRemoteListPayablesFn | null = null;
let defaultGetPayableFn: FinancialRemoteGetPayableFn | null = null;
let defaultListFinancingsFn: FinancialRemoteListFinancingsFn | null = null;
let defaultGetFinancingFn: FinancialRemoteGetFinancingFn | null = null;
let defaultCreateReceivableFn: FinancialRemoteCreateReceivableFn | null = null;
let defaultUpdateReceivableFn: FinancialRemoteUpdateReceivableFn | null = null;
let defaultCreatePayableFn: FinancialRemoteCreatePayableFn | null = null;
let defaultUpdatePayableFn: FinancialRemoteUpdatePayableFn | null = null;
let defaultDeletePayableFn: FinancialRemoteDeletePayableFn | null = null;
let defaultCreateFinancingFn: FinancialRemoteCreateFinancingFn | null = null;
let defaultUpdateFinancingFn: FinancialRemoteUpdateFinancingFn | null = null;

export function registerFinancialRemoteListReceivables(fn: FinancialRemoteListReceivablesFn): void {
  defaultListReceivablesFn = fn;
}

export function registerFinancialRemoteGetReceivable(fn: FinancialRemoteGetReceivableFn): void {
  defaultGetReceivableFn = fn;
}

export function registerFinancialRemoteListPayables(fn: FinancialRemoteListPayablesFn): void {
  defaultListPayablesFn = fn;
}

export function registerFinancialRemoteGetPayable(fn: FinancialRemoteGetPayableFn): void {
  defaultGetPayableFn = fn;
}

export function registerFinancialRemoteListFinancings(fn: FinancialRemoteListFinancingsFn): void {
  defaultListFinancingsFn = fn;
}

export function registerFinancialRemoteGetFinancing(fn: FinancialRemoteGetFinancingFn): void {
  defaultGetFinancingFn = fn;
}

export function registerFinancialRemoteCreateReceivable(fn: FinancialRemoteCreateReceivableFn): void {
  defaultCreateReceivableFn = fn;
}

export function registerFinancialRemoteUpdateReceivable(fn: FinancialRemoteUpdateReceivableFn): void {
  defaultUpdateReceivableFn = fn;
}

export function registerFinancialRemoteCreatePayable(fn: FinancialRemoteCreatePayableFn): void {
  defaultCreatePayableFn = fn;
}

export function registerFinancialRemoteUpdatePayable(fn: FinancialRemoteUpdatePayableFn): void {
  defaultUpdatePayableFn = fn;
}

export function registerFinancialRemoteDeletePayable(fn: FinancialRemoteDeletePayableFn): void {
  defaultDeletePayableFn = fn;
}

export function registerFinancialRemoteCreateFinancing(fn: FinancialRemoteCreateFinancingFn): void {
  defaultCreateFinancingFn = fn;
}

export function registerFinancialRemoteUpdateFinancing(fn: FinancialRemoteUpdateFinancingFn): void {
  defaultUpdateFinancingFn = fn;
}

function devStubLog(action: string): void {
  if (import.meta.env?.DEV) {
    console.debug(`[FINANCIAL] remote ${action} não registrado`);
  }
}

export function getDefaultFinancialAdminApiClient(): IFinancialAdminApiClient {
  const listReceivablesFn = defaultListReceivablesFn ?? (async () => { devStubLog('listReceivables'); return []; });
  const getReceivableFn = defaultGetReceivableFn ?? (async () => { devStubLog('getReceivable'); return null; });
  const listPayablesFn = defaultListPayablesFn ?? (async () => { devStubLog('listPayables'); return []; });
  const getPayableFn = defaultGetPayableFn ?? (async () => { devStubLog('getPayable'); return null; });
  const listFinancingsFn = defaultListFinancingsFn ?? (async () => { devStubLog('listFinancings'); return []; });
  const getFinancingFn = defaultGetFinancingFn ?? (async () => { devStubLog('getFinancing'); return null; });
  const createReceivableFn = defaultCreateReceivableFn ?? (async () => { devStubLog('createReceivable'); return null; });
  const updateReceivableFn = defaultUpdateReceivableFn ?? (async () => { devStubLog('updateReceivable'); return null; });
  const createPayableFn = defaultCreatePayableFn ?? (async () => { devStubLog('createPayable'); return null; });
  const updatePayableFn = defaultUpdatePayableFn ?? (async () => { devStubLog('updatePayable'); return null; });
  const deletePayableFn = defaultDeletePayableFn ?? (async () => { devStubLog('deletePayable'); return false; });
  const createFinancingFn = defaultCreateFinancingFn ?? (async () => { devStubLog('createFinancing'); return null; });
  const updateFinancingFn = defaultUpdateFinancingFn ?? (async () => { devStubLog('updateFinancing'); return null; });

  return createFinancialAdminApiRepository(
    listReceivablesFn,
    getReceivableFn,
    listPayablesFn,
    getPayableFn,
    listFinancingsFn,
    getFinancingFn,
    createReceivableFn,
    updateReceivableFn,
    createPayableFn,
    updatePayableFn,
    deletePayableFn,
    createFinancingFn,
    updateFinancingFn,
  );
}

/** @deprecated use getDefaultFinancialAdminApiClient */
export function getDefaultFinancialAdminApiReader(): IFinancialAdminApiClient {
  return getDefaultFinancialAdminApiClient();
}
