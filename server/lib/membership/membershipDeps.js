/**
 * Phase 4.10 Wave 3H — chaves de dependência externa para createMembershipDependencies.
 */

export const MEMBERSHIP_EXTERNAL_DEP_KEYS = [
  'supabase',
  'normalizeText',
  'normalizeEmail',
];

export function assertMembershipExternalDeps(deps, { keys = MEMBERSHIP_EXTERNAL_DEP_KEYS } = {}) {
  const missing = keys.filter((key) => deps[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`createMembershipDependencies: deps ausentes: ${missing.join(', ')}`);
  }
}
