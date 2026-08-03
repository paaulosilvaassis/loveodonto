/**
 * @module repositories/shared/repositoryV3MapperHelpers
 * @description Helpers de mapeamento legado ↔ core ↔ server — Repository V3 toolkit.
 */

export function normalizeTenantId(value: unknown): string {
  return String(value || '').trim();
}

export function normalizeOptionalString(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  return raw || null;
}

export function isUuid(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '').trim(),
  );
}

export function resolveLegacyId(row: Record<string, unknown>): string {
  return String(row.legacy_id ?? row.legacyId ?? row.id ?? '').trim();
}

export function resolveUuid(row: Record<string, unknown>, legacyId: string): string | null {
  const id = String(row.id ?? '').trim();
  return isUuid(id) && id !== legacyId ? id : null;
}

export function pickServerField<T>(
  row: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
  fallback: T,
): T {
  if (row[snakeKey] !== undefined && row[snakeKey] !== null) return row[snakeKey] as T;
  if (row[camelKey] !== undefined && row[camelKey] !== null) return row[camelKey] as T;
  return fallback;
}
