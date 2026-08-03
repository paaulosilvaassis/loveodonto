/**
 * Phase 4.10 Wave 3E — revoga sessões globais do usuário Auth (identity).
 */

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function createRevokeAuthUserSessions(deps) {
  const { supabase } = deps;

  return async function revokeAuthUserSessions(authUserId) {
    const id = normalizeText(authUserId);
    if (!id) return false;
    try {
      const { error } = await supabase.auth.admin.signOut(id, 'global');
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[COLLAB_ACCESS] falha ao revogar sessões', { authUserId: id, message: err?.message });
      return false;
    }
  };
}
