/**
 * @module repositories/shared/repositoryV3ProductionGuards
 * @description Production guards genéricos — Repository V3 toolkit.
 */

import {
  isProductionRuntime,
  isProductionSupabaseHostConfigured,
} from './repositoryV3FlagHelpers.js';

export function lockDangerousFlags<T extends Record<string, boolean>>(
  flags: T,
  lockedKeys: readonly (keyof T)[],
): T {
  const locked = { ...flags };
  for (const key of lockedKeys) {
    locked[key] = false as T[keyof T];
  }
  return locked;
}

export interface ProductionSafeLockOptions<T extends Record<string, boolean>> {
  /** Flags forçadas false quando host Supabase aponta produção. */
  supabaseHostLockedKeys?: readonly (keyof T)[];
}

export function applyProductionSafeLocksGeneric<T extends Record<string, boolean>>(
  flags: T,
  productionLockedKeys: readonly (keyof T)[],
  options: ProductionSafeLockOptions<T> = {},
): T {
  let locked = flags;
  if (isProductionRuntime()) {
    locked = lockDangerousFlags(locked, productionLockedKeys);
  }
  if (isProductionSupabaseHostConfigured() && options.supabaseHostLockedKeys?.length) {
    const patch: Partial<T> = {};
    for (const key of options.supabaseHostLockedKeys) {
      if (locked[key]) {
        patch[key] = false as T[keyof T];
      }
    }
    if (Object.keys(patch).length) {
      locked = { ...locked, ...patch };
    }
  }
  return locked;
}
