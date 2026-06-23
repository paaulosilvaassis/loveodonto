import { supabaseAppClient } from '../../lib/supabaseClients.js';

/**
 * Upload opcional para Supabase Storage (bucket clinical-guides).
 * Fallback local: retorna data URL quando Supabase não está configurado.
 */
export async function uploadClinicalGuideImageToStorage({
  tenantId,
  guideId,
  file,
  dataUrlFallback,
}) {
  if (!supabaseAppClient || !tenantId || !guideId || !file) {
    return dataUrlFallback || '';
  }

  const safeName = String(file.name || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${tenantId}/${guideId}/${Date.now()}-${safeName}`;

  const { error } = await supabaseAppClient.storage
    .from('clinical-guides')
    .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

  if (error) {
    if (import.meta.env?.DEV) {
      console.debug('[clinicalGuide] Supabase Storage upload falhou, usando local:', error.message);
    }
    return dataUrlFallback || '';
  }

  const { data } = supabaseAppClient.storage.from('clinical-guides').getPublicUrl(path);
  return data?.publicUrl || dataUrlFallback || '';
}
