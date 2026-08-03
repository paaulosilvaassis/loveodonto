/**
 * Phase 4.10 Wave 3G — vínculo collaborator_id ↔ tenant_user.
 */

import { assertCanAssignEmailToCollaborator } from '../../collaboratorLinkPolicy.js';
import {
  TENANT_USER_SELECT_BASE_LEGACY,
  TENANT_USER_SELECT_WITH_ACCESS,
  omitCollaboratorId,
} from '../tenantUserFieldUtils.js';
import { isMissingCollaboratorIdColumnError } from '../membership/tenantUserSchemaFallbacks.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createLinkCollaboratorToTenantUser(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    normalizeEmail,
  } = deps;

  return async function linkCollaboratorToTenantUser({
    actorAuthUserId,
    tenantId,
    collaboratorId,
    email,
    fullName,
  }) {
    const actorTenantUser = await getTenantAdminActorOrThrow(actorAuthUserId, tenantId);
    const resolvedTenantId = actorTenantUser.tenant_id;
    const normalizedEmail = normalizeEmail(email);
    const normalizedCollaboratorId = normalizeText(collaboratorId);

    if (!normalizedEmail) throw new Error('E-mail é obrigatório para vincular colaborador.');
    if (!normalizedCollaboratorId) throw new Error('collaborator_id é obrigatório para vincular colaborador.');

    const { data: existing, error: existingError } = await supabase
      .from('tenant_users')
      .select('id, collaborator_id, email, full_name, tenant_id')
      .eq('tenant_id', resolvedTenantId)
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing?.id) {
      const notFoundErr = new Error('Nenhum usuário encontrado com este e-mail nesta clínica.');
      notFoundErr.code = 'TENANT_USER_NOT_FOUND';
      throw notFoundErr;
    }

    if (existing.collaborator_id && existing.collaborator_id !== normalizedCollaboratorId) {
      await assertCanAssignEmailToCollaborator(supabase, {
        tenantId: resolvedTenantId,
        tenantUserId: existing.id,
        collaboratorId: normalizedCollaboratorId,
        email: normalizedEmail,
      });
    }

    if (existing.collaborator_id === normalizedCollaboratorId) {
      return { tenantUser: existing, linked: false };
    }

    const updatePayload = { collaborator_id: normalizedCollaboratorId };
    const normalizedFullName = normalizeText(fullName);
    if (normalizedFullName) updatePayload.full_name = normalizedFullName;

    let tenantUser;
    try {
      const result = await supabase
        .from('tenant_users')
        .update(updatePayload)
        .eq('id', existing.id)
        .select(TENANT_USER_SELECT_WITH_ACCESS)
        .single();
      if (result.error) throw result.error;
      tenantUser = result.data;
    } catch (error) {
      if (!isMissingCollaboratorIdColumnError(error)) throw error;
      const fallbackResult = await supabase
        .from('tenant_users')
        .update(omitCollaboratorId(updatePayload))
        .eq('id', existing.id)
        .select(TENANT_USER_SELECT_BASE_LEGACY)
        .single();
      if (fallbackResult.error) throw fallbackResult.error;
      tenantUser = fallbackResult.data;
    }

    const invUpdate = await supabase
      .from('invitations')
      .update({ collaborator_id: normalizedCollaboratorId })
      .eq('tenant_id', resolvedTenantId)
      .eq('email', normalizedEmail)
      .is('collaborator_id', null);
    if (invUpdate.error && process.env.NODE_ENV !== 'production') {
      console.debug('[linkCollaboratorToTenantUser] falha ao atualizar invitations', invUpdate.error);
    }

    await supabase
      .from('identities')
      .update({ collaborator_id: normalizedCollaboratorId, updated_at: new Date().toISOString() })
      .eq('tenant_id', resolvedTenantId)
      .eq('email', normalizedEmail)
      .then(({ error: identityErr }) => {
        if (identityErr && process.env.NODE_ENV !== 'production') {
          console.debug('[linkCollaboratorToTenantUser] identities sync skipped', identityErr.message);
        }
      });

    return { tenantUser, linked: true };
  };
}
