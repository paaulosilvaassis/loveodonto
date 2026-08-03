/**
 * Phase 4.10 Wave 3G — resolução Auth user para vínculo tenant_users.
 */

import { findAuthUserByEmail as findAuthUserByEmailHelper } from '../../email/accessEmailHelpers.js';
import { identityLog } from '../../identity/identityProvisionLog.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createAuthUserResolver(deps) {
  const { supabase, normalizeEmail } = deps;

  async function findAuthUserByEmail(email) {
    return findAuthUserByEmailHelper(supabase, email);
  }

  async function getValidAuthUserId(userId) {
    const id = normalizeText(userId);
    if (!id) return null;
    const { data, error } = await supabase.auth.admin.getUserById(id);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  }

  async function getValidAuthUserIdWithRetry(userId, { attempts = 4, delayMs = 350 } = {}) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const valid = await getValidAuthUserId(userId);
      if (valid) return valid;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return null;
  }

  async function resolveAuthUserIdForTenantLink({
    normalizedEmail,
    explicitAuthUserId = null,
    existingTenantUser = null,
  }) {
    const explicitRaw = normalizeText(explicitAuthUserId);
    if (explicitRaw) {
      const validated = await getValidAuthUserIdWithRetry(explicitRaw);
      if (validated) return validated;
    }

    const byEmail = await findAuthUserByEmail(normalizedEmail);
    if (byEmail?.id) return byEmail.id;

    const existing = await getValidAuthUserId(existingTenantUser?.user_id);
    if (existing) return existing;

    return null;
  }

  async function clearStaleTenantUserAuthReference(tenantId, email) {
    const normalizedEmail = normalizeEmail(email);
    if (!tenantId || !normalizedEmail) return false;

    const { data: existing, error } = await supabase
      .from('tenant_users')
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (error || !existing?.id || !existing.user_id) return false;

    const valid = await getValidAuthUserId(existing.user_id);
    if (valid) return false;

    identityLog('user_id órfão detectado — será reparado no próximo upsert', {
      tenantUserId: existing.id,
      orphanedUserId: existing.user_id,
    });
    return true;
  }

  return {
    findAuthUserByEmail,
    getValidAuthUserId,
    getValidAuthUserIdWithRetry,
    resolveAuthUserIdForTenantLink,
    clearStaleTenantUserAuthReference,
  };
}
