/**
 * Phase 4.10 Wave 3H — bootstrap de credenciais admin da Console.
 */

import { findAuthUserByEmail as findAuthUserByEmailHelper } from '../../email/accessEmailHelpers.js';

export function createEnsureConsoleAdminCredentials(deps) {
  const { supabase, normalizeEmail } = deps;

  return async function ensureConsoleAdminCredentials({
    email = 'admin@loveodonto.com',
    password = 'admin123',
    fullName = 'Admin Love Odonto',
  }) {
    const emailNorm = normalizeEmail(email);
    let authUser = await findAuthUserByEmailHelper(supabase, emailNorm);

    if (!authUser?.id) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: emailNorm,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data?.user?.id) {
        throw error || new Error('Falha ao criar usuário admin da Console.');
      }
      authUser = data.user;
    } else {
      const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, {
        email: emailNorm,
        password,
        email_confirm: true,
        user_metadata: {
          ...(authUser.user_metadata || {}),
          full_name: fullName,
        },
      });
      if (error || !data?.user?.id) {
        throw error || new Error('Falha ao atualizar senha do admin da Console.');
      }
      authUser = data.user;
    }

    const { error: profileError } = await supabase
      .from('platform_admin_users')
      .upsert(
        {
          id: authUser.id,
          email: emailNorm,
          full_name: fullName,
          role_slug: 'super_admin',
          is_active: true,
        },
        { onConflict: 'id' },
      );
    if (profileError) throw profileError;

    return {
      id: authUser.id,
      email: emailNorm,
      full_name: fullName,
      role_slug: 'super_admin',
      is_active: true,
    };
  };
}
