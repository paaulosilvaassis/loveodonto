/**
 * Cliente Admin API — leitura CRM (Phase 6.2).
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
  mapLeadCreateDtoToServerBody,
  mapLeadMoveStageDtoToServerBody,
  mapLeadUpdateDtoToServerBody,
  mapPipelineStageCreateDtoToServerBody,
  mapPipelineStageUpdateDtoToServerBody,
  mapServerRowToLeadCore,
  mapServerRowToPipelineStageCore,
} from '../repositories/crm/crmMapper.ts';

function buildLeadsQueryParams(filters = {}) {
  const params = new URLSearchParams();
  if (filters.stageKey) params.set('stage_key', filters.stageKey);
  if (filters.assignedToUserId) params.set('assigned_to_user_id', filters.assignedToUserId);
  if (filters.source) params.set('source', filters.source);
  if (filters.search) params.set('search', filters.search);
  if (filters.id) params.set('id', filters.id);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  return params;
}

function buildPipelineQueryParams(options = {}) {
  const params = new URLSearchParams();
  if (options.includeInactive) params.set('include_inactive', 'true');
  if (options.id) params.set('id', options.id);
  return params;
}

async function getJson(path) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para listar CRM.');
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
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(json?.error || `Erro HTTP ${response.status} ao listar CRM.`);
        err.code = json?.code;
        err.status = response.status;
        throw err;
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao listar CRM.');
}

export async function fetchCrmLeadsRemote(filters = {}) {
  const params = buildLeadsQueryParams(filters);
  const qs = params.toString();
  const path = `/internal/app/crm/leads${qs ? `?${qs}` : ''}`;
  const json = await getJson(path);
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((row) => mapServerRowToLeadCore(row))
    .filter(Boolean);
}

export async function fetchCrmLeadRemote(ref) {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const path = `/internal/app/crm/leads/${encodeURIComponent(needle)}`;
  const json = await getJson(path);
  return mapServerRowToLeadCore(json?.data ?? null);
}

export async function fetchCrmPipelineStagesRemote(options = {}) {
  const params = buildPipelineQueryParams(options);
  const qs = params.toString();
  const path = `/internal/app/crm/pipeline-stages${qs ? `?${qs}` : ''}`;
  const json = await getJson(path);
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((row) => mapServerRowToPipelineStageCore(row))
    .filter(Boolean);
}

export async function fetchCrmPipelineStageRemote(ref) {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const path = `/internal/app/crm/pipeline-stages/${encodeURIComponent(needle)}`;
  const json = await getJson(path);
  return mapServerRowToPipelineStageCore(json?.data ?? null);
}

/** Kanban cards — alias de leads. */
export async function fetchCrmKanbanCardsRemote(filters = {}) {
  const params = buildLeadsQueryParams(filters);
  const qs = params.toString();
  const path = `/internal/app/crm/kanban/cards${qs ? `?${qs}` : ''}`;
  const json = await getJson(path);
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((row) => mapServerRowToLeadCore(row))
    .filter(Boolean);
}

export async function fetchCrmKanbanCardRemote(ref) {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const path = `/internal/app/crm/kanban/cards/${encodeURIComponent(needle)}`;
  const json = await getJson(path);
  return mapServerRowToLeadCore(json?.data ?? null);
}

async function writeJson(method, path, body) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para escrever CRM.');
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
        const err = new Error(json?.error || `Erro HTTP ${response.status} ao escrever CRM.`);
        err.code = json?.code;
        err.status = response.status;
        throw err;
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao escrever CRM.');
}

function mapWriteResponse(json, mapper) {
  const row = json?.data ?? json;
  return mapper(row);
}

export async function createLeadRemote(dto, meta) {
  const json = await writeJson(
    'POST',
    '/internal/app/crm/leads',
    mapLeadCreateDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToLeadCore);
}

export async function updateLeadRemote(legacyId, dto, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PUT',
    `/internal/app/crm/leads/${ref}`,
    mapLeadUpdateDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToLeadCore);
}

export async function moveLeadStageRemote(legacyId, dto, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PATCH',
    `/internal/app/crm/leads/${ref}/stage`,
    mapLeadMoveStageDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToLeadCore);
}

export async function createPipelineStageRemote(dto, meta) {
  const json = await writeJson(
    'POST',
    '/internal/app/crm/pipeline-stages',
    mapPipelineStageCreateDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToPipelineStageCore);
}

export async function updatePipelineStageRemote(legacyId, dto, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PUT',
    `/internal/app/crm/pipeline-stages/${ref}`,
    mapPipelineStageUpdateDtoToServerBody(dto, meta),
  );
  return mapWriteResponse(json, mapServerRowToPipelineStageCore);
}

export async function deletePipelineStageRemote(legacyId, meta) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  await writeJson('DELETE', `/internal/app/crm/pipeline-stages/${ref}`, {
    idempotency_key: meta?.idempotencyKey,
    correlation_id: meta?.correlationId,
  });
  return true;
}
