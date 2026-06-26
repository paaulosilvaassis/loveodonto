import {
  findAuthUserByEmail,
  isUserAlreadyRegisteredError,
} from '../email/accessEmailHelpers.js';
import { IdentityProvisionError } from './identityProvisionErrors.js';
import { identityLog } from './identityProvisionLog.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Recupera auth.users após email_exists — nunca propaga o erro do invite.
 */
export async function recoverAuthUserAfterEmailExists(supabase, email) {
  const normalizedEmail = normalizeEmail(email);
  const authUser = await findAuthUserByEmail(supabase, normalizedEmail);
  if (!authUser?.id) {
    throw new IdentityProvisionError(
      'AUTH_USER_NOT_FOUND',
      'O e-mail já existe no Auth, mas o usuário não foi localizado. Tente novamente em instantes.',
      { email: normalizedEmail },
    );
  }
  identityLog('email_exists recuperado automaticamente', { userId: authUser.id });
  return authUser;
}

/**
 * 1) Busca auth.users pelo e-mail antes de qualquer invite.
 */
export async function lookupAuthUserByEmail(supabase, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const authUser = await findAuthUserByEmail(supabase, normalizedEmail);
  if (authUser?.id) {
    identityLog('email encontrado no auth', { userId: authUser.id });
  }
  return authUser;
}

/**
 * Garante auth user id após invite / recovery — fail-safe.
 */
export async function requireAuthUserId(supabase, email, {
  explicitUser = null,
  afterInviteError = null,
} = {}) {
  if (explicitUser?.id) {
    identityLog('user_id encontrado', { userId: explicitUser.id, source: 'explicit' });
    return explicitUser;
  }

  if (afterInviteError && isUserAlreadyRegisteredError(afterInviteError)) {
    return recoverAuthUserAfterEmailExists(supabase, email);
  }

  const fromLookup = await lookupAuthUserByEmail(supabase, email);
  if (fromLookup?.id) {
    identityLog('user_id encontrado', { userId: fromLookup.id, source: 'lookup' });
    return fromLookup;
  }

  throw new IdentityProvisionError(
    'AUTH_USER_NOT_FOUND',
    'Não foi possível obter a conta Auth para este e-mail.',
    { email: normalizeEmail(email) },
  );
}
