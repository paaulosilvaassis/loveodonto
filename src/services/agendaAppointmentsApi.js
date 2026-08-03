/**
 * Cliente Admin API — leitura de agendamentos (Phase 5.8).
 * Tenant resolvido pelo backend; nunca enviado na query.
 */
import { getPlatformAccessToken } from '../auth/saasSessionResolver.js';
import {
  assertAdminApiFetchAllowed,
  buildAdminApiUrl,
  getConfiguredAdminApiBaseUrl,
  getDevDirectAdminApiUrl,
} from '../config/adminApiBase.js';
import { mapServerRowToCore, mapCreateDtoToServerBody, mapUpdateDtoToServerBody } from '../repositories/agenda/agendaMapper.ts';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  if (filters.date) params.set('date', filters.date);
  if (filters.dateFrom) params.set('from', filters.dateFrom);
  if (filters.dateTo) params.set('to', filters.dateTo);
  if (filters.professionalId) params.set('professional_id', filters.professionalId);
  if (filters.roomId) params.set('room_id', filters.roomId);
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
    throw new Error('Sessão SaaS ausente para listar agendamentos.');
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
        throw new Error(json?.error || `Erro HTTP ${response.status} ao listar agendamentos.`);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao listar agendamentos.');
}

async function writeJson(method, path, body) {
  assertAdminApiFetchAllowed();
  const accessToken = await getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessão SaaS ausente para salvar agendamento.');
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
        throw new Error(json?.error || `Erro HTTP ${response.status} ao salvar agendamento.`);
      }
      return json;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Falha ao salvar agendamento.');
}

function mapWriteResponse(json) {
  const row = json?.data ?? json;
  return mapServerRowToCore(row);
}

/**
 * @param {import('../repositories/agenda/agendaTypes.ts').AgendaListFilters} [filters]
 */
export async function fetchAppointmentsRemote(filters = {}) {
  const params = buildQueryParams(filters);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const json = await getJson(`/internal/app/appointments${suffix}`);
  const rows = Array.isArray(json?.data) ? json.data : [];
  return rows
    .map((row) => mapServerRowToCore(row))
    .filter((core) => Boolean(core));
}

/**
 * @param {string} ref
 */
export async function fetchAppointmentRemote(ref) {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const rows = await fetchAppointmentsRemote({ id: needle, pageSize: 1 });
  return rows[0] ?? null;
}

/**
 * @param {import('../repositories/agenda/agendaTypes.ts').AppointmentCreateCoreDto} dto
 */
export async function createAppointmentRemote(dto) {
  const json = await writeJson('POST', '/internal/app/appointments', mapCreateDtoToServerBody(dto));
  return mapWriteResponse(json);
}

/**
 * @param {string} legacyId
 * @param {import('../repositories/agenda/agendaTypes.ts').AppointmentUpdateCoreDto} dto
 */
export async function updateAppointmentRemote(legacyId, dto) {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson(
    'PUT',
    `/internal/app/appointments/${ref}`,
    mapUpdateDtoToServerBody(dto),
  );
  return mapWriteResponse(json);
}

/**
 * @param {string} legacyId
 * @param {string} [reason]
 */
export async function cancelAppointmentRemote(legacyId, reason = '') {
  const ref = encodeURIComponent(String(legacyId || '').trim());
  const json = await writeJson('PATCH', `/internal/app/appointments/${ref}/cancel`, {
    reason: String(reason || '').trim(),
  });
  return mapWriteResponse(json);
}
