/**
 * Cliente Admin API — pacientes (CLOUD.3).
 * Tenant resolvido pelo backend; nunca enviado na query/body.
 */
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  getConfiguredAdminApiBaseUrl,
  getDevDirectAdminApiUrl,
} from '../config/adminApiBase.js';
import { mapSupabaseRowToPatientCore } from '../repositories/patient/patientMapper.ts';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) {
    const status = Array.isArray(filters.status) ? filters.status[0] : filters.status;
    if (status) params.set('status', String(status));
  }
  if (filters.search) params.set('search', String(filters.search));
  if (filters.cpf) params.set('cpf', String(filters.cpf).replace(/\D/g, ''));
  if (filters.includeBlocked) params.set('include_blocked', '1');
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.id || filters.legacyId) {
    params.set('id', String(filters.id || filters.legacyId));
  }
  return params;
}

function mapCreateDtoToServerBody(dto = {}) {
  return {
    legacy_id: dto.legacyId || dto.legacy_id || undefined,
    guid: dto.guid || undefined,
    full_name: dto.fullName ?? dto.full_name,
    nickname: dto.nickname ?? '',
    social_name: dto.socialName ?? dto.social_name ?? '',
    sex: dto.sex,
    birth_date: dto.birthDate ?? dto.birth_date,
    cpf: dto.cpf ? String(dto.cpf).replace(/\D/g, '') : undefined,
    lead_source: dto.leadSource ?? dto.lead_source ?? '',
    has_financial_responsible: Boolean(dto.hasFinancialResponsible ?? dto.has_financial_responsible),
    dependent_full_name: dto.dependentFullName ?? dto.dependent_full_name ?? '',
    tags: Array.isArray(dto.tags) ? dto.tags : [],
  };
}

function mapUpdateDtoToServerBody(dto = {}) {
  const body = {};
  if (dto.fullName !== undefined || dto.full_name !== undefined) {
    body.full_name = dto.fullName ?? dto.full_name;
  }
  if (dto.nickname !== undefined) body.nickname = dto.nickname;
  if (dto.socialName !== undefined || dto.social_name !== undefined) {
    body.social_name = dto.socialName ?? dto.social_name;
  }
  if (dto.sex !== undefined) body.sex = dto.sex;
  if (dto.birthDate !== undefined || dto.birth_date !== undefined) {
    body.birth_date = dto.birthDate ?? dto.birth_date;
  }
  if (dto.cpf !== undefined) body.cpf = String(dto.cpf || '').replace(/\D/g, '') || null;
  if (dto.photoUrl !== undefined || dto.photo_url !== undefined) {
    body.photo_url = dto.photoUrl ?? dto.photo_url;
  }
  if (dto.status !== undefined) body.status = dto.status;
  if (dto.blocked !== undefined) body.blocked = Boolean(dto.blocked);
  if (dto.blockReason !== undefined || dto.block_reason !== undefined) {
    body.block_reason = dto.blockReason ?? dto.block_reason;
  }
  if (dto.blockAt !== undefined || dto.block_at !== undefined) {
    body.block_at = dto.blockAt ?? dto.block_at;
  }
  if (dto.leadSource !== undefined || dto.lead_source !== undefined) {
    body.lead_source = dto.leadSource ?? dto.lead_source;
  }
  if (dto.hasFinancialResponsible !== undefined || dto.has_financial_responsible !== undefined) {
    body.has_financial_responsible = Boolean(
      dto.hasFinancialResponsible ?? dto.has_financial_responsible,
    );
  }
  if (dto.dependentFullName !== undefined || dto.dependent_full_name !== undefined) {
    body.dependent_full_name = dto.dependentFullName ?? dto.dependent_full_name;
  }
  if (dto.tags !== undefined) body.tags = dto.tags;
  if (dto.hasPendingData !== undefined || dto.has_pending_data !== undefined) {
    body.has_pending_data = Boolean(dto.hasPendingData ?? dto.has_pending_data);
  }
  if (dto.pendingFields !== undefined || dto.pending_fields !== undefined) {
    body.pending_fields = dto.pendingFields ?? dto.pending_fields;
  }
  if (dto.pendingCriticalFields !== undefined || dto.pending_critical_fields !== undefined) {
    body.pending_critical_fields = dto.pendingCriticalFields ?? dto.pending_critical_fields;
  }
  return body;
}

async function getJson(path) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para listar pacientes.');
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
        throw new Error(json?.error || `Erro HTTP ${response.status} ao listar pacientes.`);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao listar pacientes.');
}

async function writeJson(method, path, body) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para salvar paciente.');
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
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error || `Erro HTTP ${response.status} ao salvar paciente.`);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao salvar paciente.');
}

function mapWriteResponse(json) {
  const row = json?.data ?? json;
  if (!row) return null;
  return mapSupabaseRowToPatientCore(row);
}

/**
 * @param {import('../repositories/patient/patientTypes.ts').PatientListFilters} [filters]
 */
function mapPatientRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      try {
        return mapSupabaseRowToPatientCore(row);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Lista remota via Admin API.
 * Sem `page` explícito: pagina automaticamente até cobrir meta.total (CLOUD.6).
 * Com `page` explícito: retorna só aquela página.
 * @param {import('../repositories/patient/patientTypes.ts').PatientListFilters} [filters]
 */
export async function fetchPatientsRemote(filters = {}) {
  const explicitPage = filters.page != null;
  const pageSize = Math.min(Number(filters.pageSize) || 500, 500);
  if (explicitPage) {
    const params = buildQueryParams({ ...filters, pageSize });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const json = await getJson(`/internal/app/patients${suffix}`);
    return mapPatientRows(json?.data);
  }

  const all = [];
  let page = 1;
  let total = Infinity;
  const maxPages = 100;

  while (all.length < total && page <= maxPages) {
    const params = buildQueryParams({ ...filters, page, pageSize });
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const json = await getJson(`/internal/app/patients${suffix}`);
    const rows = mapPatientRows(json?.data);
    const metaTotal = Number(json?.meta?.total);
    if (Number.isFinite(metaTotal) && metaTotal >= 0) {
      total = metaTotal;
    } else if (rows.length < pageSize) {
      total = all.length + rows.length;
    }
    all.push(...rows);
    if (rows.length === 0 || rows.length < pageSize) break;
    page += 1;
  }

  return all;
}

/**
 * @param {string} legacyId
 */
export async function fetchPatientRemote(legacyId) {
  const needle = String(legacyId || '').trim();
  if (!needle) return null;
  const ref = encodeURIComponent(needle);
  try {
    const json = await getJson(`/internal/app/patients/${ref}`);
    return mapWriteResponse(json);
  } catch {
    const rows = await fetchPatientsRemote({ id: needle, pageSize: 1 });
    return rows[0] ?? null;
  }
}

/**
 * @param {import('../repositories/patient/patientTypes.ts').PatientCreateCoreDto} body
 */
export async function createPatientRemote(body) {
  const json = await writeJson('POST', '/internal/app/patients', mapCreateDtoToServerBody(body));
  return mapWriteResponse(json);
}

/**
 * @param {string} legacyId
 * @param {import('../repositories/patient/patientTypes.ts').PatientUpdateCoreDto} body
 */
export async function updatePatientRemote(legacyId, body) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PUT',
    `/internal/app/patients/${ref}`,
    mapUpdateDtoToServerBody(body),
  );
  return mapWriteResponse(json);
}

/**
 * @param {string} legacyId
 */
export async function softDeletePatientRemote(legacyId) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson('DELETE', `/internal/app/patients/${ref}`);
  return Boolean(json?.ok ?? json?.data ?? true);
}
