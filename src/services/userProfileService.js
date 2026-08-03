import { loadDb } from '../db/index.js';
import { supabaseAppClient, supabasePlatformClient } from '../lib/supabaseClients.js';
import {
  looksLikeEmail,
  pickGreetingName,
  resolveAuthUserMetadataName,
} from '../utils/userDisplayName.js';

function resolveNameFromLocalDb(userId, email) {
  const db = loadDb();
  const emailNorm = String(email || '').trim().toLowerCase();
  const uid = String(userId || '').trim();

  const collaborators = Array.isArray(db.collaborators) ? db.collaborators : [];
  const collaboratorAccess = Array.isArray(db.collaboratorAccess) ? db.collaboratorAccess : [];

  let collaborator = null;
  if (emailNorm) {
    collaborator = collaborators.find(
      (item) => String(item.email || '').trim().toLowerCase() === emailNorm,
    ) || null;
  }
  if (!collaborator && uid) {
    const access = collaboratorAccess.find((item) => item.userId === uid);
    if (access?.collaboratorId) {
      collaborator = collaborators.find((item) => item.id === access.collaboratorId) || null;
    }
  }

  if (collaborator) {
    const fromRh = String(collaborator.apelido || collaborator.nomeCompleto || '').trim();
    if (fromRh && !looksLikeEmail(fromRh)) return fromRh;
  }

  if (uid) {
    const profile = (db.users_profile || []).find((item) => item.id === uid);
    const profileName = String(profile?.full_name || '').trim();
    if (profileName && !looksLikeEmail(profileName)) return profileName;

    const user = (db.users || []).find((item) => item.id === uid);
    const userName = String(user?.name || '').trim();
    if (userName && !looksLikeEmail(userName)) return userName;
  }

  return '';
}

/**
 * Nome amigável para saudação (dashboard, header).
 * Prioridade: cadastro local (colaborador) → tenant_users (via sessão) → metadata Auth → fallback.
 */
export async function getNomeUsuario(options = '') {
  const params = typeof options === 'string'
    ? { fallbackName: options }
    : (options || {});

  const {
    userId = '',
    email = '',
    fallbackName = '',
  } = params;

  const localName = resolveNameFromLocalDb(userId, email);
  if (localName) return pickGreetingName(localName) || localName;

  const normalizedFallback = String(fallbackName || '').trim();
  if (normalizedFallback && !looksLikeEmail(normalizedFallback)) {
    return pickGreetingName(normalizedFallback) || normalizedFallback;
  }

  const client = supabasePlatformClient || supabaseAppClient;
  if (!client) return 'Usuário';

  const { data: authData } = await client.auth.getUser();
  const authUser = authData?.user;
  if (!authUser?.id) return 'Usuário';

  try {
    const { data: tenantUser } = await client
      .from('tenant_users')
      .select('full_name')
      .eq('user_id', authUser.id)
      .maybeSingle();
    const tenantName = String(tenantUser?.full_name || '').trim();
    if (tenantName && !looksLikeEmail(tenantName)) {
      return pickGreetingName(tenantName) || tenantName;
    }
  } catch {
    /* RLS ou rede — seguir para metadata */
  }

  const metaName = resolveAuthUserMetadataName(authUser);
  if (metaName) return pickGreetingName(metaName) || metaName;

  return 'Usuário';
}
