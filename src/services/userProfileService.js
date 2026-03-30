import { supabase } from '../lib/supabaseClients.js';

/**
 * Resolve o nome do usuário autenticado com fallback:
 * profiles.name -> user_metadata.name -> fallbackName -> "Usuário"
 */
export async function getNomeUsuario(fallbackName = '') {
  const normalizedFallback = String(fallbackName || '').trim();
  const fallback = normalizedFallback || 'Usuário';

  if (!supabase) return fallback;

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user?.id) return fallback;

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle();

  const profileName = String(profile?.name || '').trim();
  if (profileName) return profileName;

  const metadataName = String(user.user_metadata?.name || '').trim();
  if (metadataName) return metadataName;

  return fallback;
}
