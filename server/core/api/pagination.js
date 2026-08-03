/**
 * Phase 4.10 Wave 0 — Paginação (alinhado a collaboratorsApiList defaults).
 */

import { ApiError } from './errors.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function parsePaginationQuery(query = {}, {
  defaultPage = DEFAULT_PAGE,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  maxPageSize = MAX_PAGE_SIZE,
} = {}) {
  const page = parsePositiveInt(query?.page ?? query?.page_number, defaultPage);
  const pageSizeRaw = parsePositiveInt(
    query?.pageSize ?? query?.page_size,
    defaultPageSize,
  );
  const pageSize = Math.min(pageSizeRaw, maxPageSize);

  if (pageSize <= 0) {
    throw new ApiError('pageSize inválido.', {
      status: 400,
      code: 'INVALID_QUERY',
      details: { pageSize: pageSizeRaw },
    });
  }

  return { page, pageSize };
}

export function paginationRange({ page, pageSize }) {
  const safePage = parsePositiveInt(page, DEFAULT_PAGE);
  const safePageSize = Math.min(
    parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  return { from, to, page: safePage, pageSize: safePageSize };
}
