/**
 * Cliente Admin API — leitura financeira (Phase 5.12).
 * Tenant resolvido pelo backend; nunca enviado na query.
 */
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  getConfiguredAdminApiBaseUrl,
  getDevDirectAdminApiUrl,
} from '../config/adminApiBase.js';
import {
  mapFinancingCreateDtoToServerBody,
  mapPayableCreateDtoToServerBody,
  mapReceivableCreateDtoToServerBody,
  mapServerRowToFinancingCore,
  mapServerRowToPayableCore,
  mapServerRowToReceivableCore,
} from '../repositories/financial/financialMapper.ts';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  if (filters.dueDateFrom || filters.startDate) {
    params.set('from', String(filters.dueDateFrom || filters.startDate));
  }
  if (filters.dueDateTo || filters.endDate) {
    params.set('to', String(filters.dueDateTo || filters.endDate));
  }
  if (filters.status) {
    const status = Array.isArray(filters.status) ? filters.status[0] : filters.status;
    if (status) params.set('status', String(status));
  }
  if (filters.patientId) params.set('patient_id', filters.patientId);
  if (filters.id) params.set('id', filters.id);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  return params;
}

async function getJson(path) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para listar dados financeiros.');
  }

  const urls = [];
  if (import.meta.env.DEV && !getConfiguredAdminApiBaseUrl()) {
    urls.push(getDevDirectAdminApiUrl(path));
  }
  urls.push(buildAdminApiUrl(path));

  let lastErr;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || `Erro HTTP ${response.status} ao listar financeiro.`);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao listar dados financeiros.');
}

async function fetchRemoteList(path, filters, mapper) {
  const params = buildQueryParams(filters);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const json = await getJson(`${path}${suffix}`);
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows.map((row) => mapper(row)).filter((core) => Boolean(core));
}

/**
 * @param {import('../repositories/financial/financialTypes.ts').FinancialListFilters} [filters]
 */
export async function fetchReceivablesRemote(filters = {}) {
  return fetchRemoteList('/internal/app/financial/receivables', filters, mapServerRowToReceivableCore);
}

/**
 * @param {string} ref
 */
export async function fetchReceivableRemote(ref) {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const rows = await fetchReceivablesRemote({ id: needle, pageSize: 1 });
  return rows[0] ?? null;
}

/**
 * @param {import('../repositories/financial/financialTypes.ts').FinancialListFilters} [filters]
 */
export async function fetchPayablesRemote(filters = {}) {
  return fetchRemoteList('/internal/app/financial/payables', filters, mapServerRowToPayableCore);
}

/**
 * @param {string} ref
 */
export async function fetchPayableRemote(ref) {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const rows = await fetchPayablesRemote({ id: needle, pageSize: 1 });
  return rows[0] ?? null;
}

/**
 * @param {import('../repositories/financial/financialTypes.ts').FinancialListFilters} [filters]
 */
export async function fetchFinancingsRemote(filters = {}) {
  return fetchRemoteList('/internal/app/financial/financings', filters, mapServerRowToFinancingCore);
}

/**
 * @param {string} ref
 */
export async function fetchFinancingRemote(ref) {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const rows = await fetchFinancingsRemote({ id: needle, pageSize: 1 });
  return rows[0] ?? null;
}

async function writeJson(method, path, body) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para salvar dados financeiros.');
  }

  const urls = [];
  if (import.meta.env.DEV && !getConfiguredAdminApiBaseUrl()) {
    urls.push(getDevDirectAdminApiUrl(path));
  }
  urls.push(buildAdminApiUrl(path));

  let lastErr;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || `Erro HTTP ${response.status} ao salvar financeiro.`);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao salvar dados financeiros.');
}

function mapWriteResponse(json, mapper) {
  const row = json?.data ?? json;
  return mapper(row);
}

/**
 * @param {import('../repositories/financial/financialTypes.ts').ReceivableCreateCoreDto} dto
 * @param {import('../repositories/financial/financialTypes.ts').FinancialWriteMeta} [meta]
 */
export async function createReceivableRemote(dto, meta) {
  const json = await writeJson(
    'POST',
    '/internal/app/financial/receivables',
    mapReceivableCreateDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToReceivableCore);
}

/**
 * @param {string} legacyId
 * @param {import('../repositories/financial/financialTypes.ts').ReceivableUpdateCoreDto} dto
 * @param {import('../repositories/financial/financialTypes.ts').FinancialWriteMeta} [meta]
 */
export async function updateReceivableRemote(legacyId, dto, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PUT',
    `/internal/app/financial/receivables/${ref}`,
    mapReceivableCreateDtoToServerBody({ ...dto, legacyId }, meta),
  );
  return mapWriteResponse(json, mapServerRowToReceivableCore);
}

/**
 * @param {import('../repositories/financial/financialTypes.ts').PayableCreateCoreDto} dto
 * @param {import('../repositories/financial/financialTypes.ts').FinancialWriteMeta} [meta]
 */
export async function createPayableRemote(dto, meta) {
  const json = await writeJson(
    'POST',
    '/internal/app/financial/payables',
    mapPayableCreateDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToPayableCore);
}

/**
 * @param {string} legacyId
 * @param {import('../repositories/financial/financialTypes.ts').PayableUpdateCoreDto} dto
 * @param {import('../repositories/financial/financialTypes.ts').FinancialWriteMeta} [meta]
 */
export async function updatePayableRemote(legacyId, dto, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PUT',
    `/internal/app/financial/payables/${ref}`,
    mapPayableCreateDtoToServerBody({ ...dto, legacyId }, meta),
  );
  return mapWriteResponse(json, mapServerRowToPayableCore);
}

/**
 * @param {string} legacyId
 * @param {import('../repositories/financial/financialTypes.ts').FinancialWriteMeta} [meta]
 */
export async function deletePayableRemote(legacyId, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  await writeJson('DELETE', `/internal/app/financial/payables/${ref}`, {
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  });
  return true;
}

/**
 * @param {import('../repositories/financial/financialTypes.ts').FinancingCreateCoreDto} dto
 * @param {import('../repositories/financial/financialTypes.ts').FinancialWriteMeta} [meta]
 */
export async function createFinancingRemote(dto, meta) {
  const json = await writeJson(
    'POST',
    '/internal/app/financial/financings',
    mapFinancingCreateDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToFinancingCore);
}

/**
 * @param {string} legacyId
 * @param {import('../repositories/financial/financialTypes.ts').FinancingUpdateCoreDto} dto
 * @param {import('../repositories/financial/financialTypes.ts').FinancialWriteMeta} [meta]
 */
export async function updateFinancingRemote(legacyId, dto, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PUT',
    `/internal/app/financial/financings/${ref}`,
    mapFinancingCreateDtoToServerBody({ ...dto, legacyId }, meta),
  );
  return mapWriteResponse(json, mapServerRowToFinancingCore);
}

/** Preparado Phase 5.14+ — não ativado nesta fase. */
export async function registerReceivablePaymentRemote() {
  throw new Error('registerReceivablePaymentRemote não ativado (Phase 5.13).');
}

/** Preparado Phase 5.14+ — não ativado nesta fase. */
export async function receiveInstallmentRemote() {
  throw new Error('receiveInstallmentRemote não ativado (Phase 5.13).');
}
