/**
 * Phase 4.10 Wave 0 — Ordenação com allowlist.
 */

import { ApiError } from './errors.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function parseSortQuery(query = {}, {
  allowlist = [],
  defaultField = '',
  defaultDirection = 'asc',
} = {}) {
  const allowed = Array.isArray(allowlist) ? allowlist : [];
  const defaultOrderBy = normalizeText(defaultField) || allowed[0] || '';
  const orderByRaw = normalizeText(query?.orderBy ?? query?.order_by) || defaultOrderBy;

  if (!orderByRaw || (allowed.length > 0 && !allowed.includes(orderByRaw))) {
    throw new ApiError(
      allowed.length > 0
        ? `orderBy inválido. Valores permitidos: ${allowed.join(', ')}.`
        : 'orderBy inválido.',
      {
        status: 400,
        code: 'INVALID_ORDER_BY',
        details: { orderBy: orderByRaw, allowed },
      },
    );
  }

  const orderDirRaw = normalizeText(
    (query?.orderDir ?? query?.order_dir) || defaultDirection,
  ).toLowerCase();
  if (orderDirRaw !== 'asc' && orderDirRaw !== 'desc') {
    throw new ApiError('orderDir inválido. Use asc ou desc.', {
      status: 400,
      code: 'INVALID_ORDER_DIR',
      details: { orderDir: orderDirRaw },
    });
  }

  return {
    field: orderByRaw,
    ascending: orderDirRaw === 'asc',
    direction: orderDirRaw,
  };
}
