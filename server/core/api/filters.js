/**
 * Phase 4.10 Wave 0 — Filtros de query com allowlist.
 */

import { ApiError } from './errors.js';
import { rejectTenantIdQuery } from './validation.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function sanitizeSearchTerm(value, { maxLength = 100 } = {}) {
  return normalizeText(value)
    .slice(0, maxLength)
    .replace(/[%(),]/g, '');
}

export function parseStatusFilter(value, { allowed = [] } = {}) {
  const status = normalizeText(value);
  if (!status) return undefined;
  if (!allowed.includes(status)) {
    throw new ApiError(
      allowed.length > 0
        ? `status inválido. Valores permitidos: ${allowed.join(', ')}.`
        : 'status inválido.',
      {
        status: 400,
        code: 'INVALID_STATUS',
        details: { status, allowed },
      },
    );
  }
  return status;
}

export function parseCargoFilter(value) {
  const cargo = normalizeText(value);
  return cargo || undefined;
}

export function parseAllowedFilters(query = {}, {
  allowedKeys = [],
  statusAllowlist = [],
} = {}) {
  rejectTenantIdQuery(query);

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(query || {})) {
    if (key === 'page' || key === 'pageSize' || key === 'page_size') continue;
    if (key === 'orderBy' || key === 'order_by' || key === 'orderDir' || key === 'order_dir') continue;
    if (!allowed.has(key)) {
      throw new ApiError(`Filtro "${key}" não é permitido.`, {
        status: 400,
        code: 'INVALID_QUERY',
        details: { key, allowed: [...allowed] },
      });
    }
  }

  return {
    search: sanitizeSearchTerm(query?.search),
    status: parseStatusFilter(query?.status, { allowed: statusAllowlist }),
    cargo: parseCargoFilter(query?.cargo),
    rh_categoria: normalizeText(query?.rh_categoria ?? query?.rhCategoria) || undefined,
  };
}
