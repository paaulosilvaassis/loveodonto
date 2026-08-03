/**
 * Upload da logomarca → Supabase Storage (binário).
 * A API clinic-profile recebe APENAS logo_url http(s) — nunca base64.
 */
import { supabaseAppClient, supabasePlatformClient } from '../lib/supabaseClients.js';
import { compressClinicLogoFile } from '../utils/clinicLogoImage.js';

export const CLINIC_LOGO_BUCKET = 'clinic-logos';

const DATA_URL_RE = /^data:/i;

export function isHttpUrl(value) {
  const v = String(value || '').trim();
  return v.startsWith('https://') || v.startsWith('http://');
}

export function isDataUrl(value) {
  return DATA_URL_RE.test(String(value || '').trim());
}

async function pickAuthenticatedStorageClient() {
  const clients = [supabasePlatformClient, supabaseAppClient].filter(Boolean);
  for (const client of clients) {
    const { data } = await client.auth.getSession();
    if (data?.session?.access_token) return client;
  }
  return clients[0] || null;
}

/**
 * Upload binário (File ou Blob) para clinic-logos/{tenantId}/logo.{ext}
 */
export async function uploadClinicLogoBlob(tenantId, blob, { ext = 'webp', mime = 'image/webp' } = {}) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenant_id ausente para upload da logomarca.');

  const client = await pickAuthenticatedStorageClient();
  if (!client) {
    throw new Error('Supabase não configurado. Verifique VITE_SUPABASE_* e faça login novamente.');
  }

  const objectPath = `${tid}/logo.${ext}`;
  const { error } = await client.storage.from(CLINIC_LOGO_BUCKET).upload(objectPath, blob, {
    upsert: true,
    contentType: mime,
    cacheControl: '3600',
  });

  if (error) {
    const msg = String(error.message || '');
    if (msg.toLowerCase().includes('bucket') || msg.toLowerCase().includes('not found')) {
      throw new Error(
        'Bucket clinic-logos não encontrado no Supabase. Aplique a migration 013_clinic_logos_storage.sql.',
      );
    }
    throw new Error(`Falha no upload da logomarca (Storage): ${msg}`);
  }

  const { data } = client.storage.from(CLINIC_LOGO_BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error('Upload concluído, mas a URL pública não foi gerada.');
  }
  return data.publicUrl;
}

/** Upload a partir de File com compressão automática (máx. 2 MB). */
export async function uploadClinicLogoFile(tenantId, file) {
  const { blob, mime, ext, originalSize, compressedSize } = await compressClinicLogoFile(file);
  const publicUrl = await uploadClinicLogoBlob(tenantId, blob, { ext, mime });
  if (import.meta.env?.DEV) {
    console.debug('[clinic-logo] upload', { originalSize, compressedSize, publicUrl });
  }
  return publicUrl;
}

/**
 * Resolve logo para salvar em clinic_profiles.
 * - http(s): retorna como está
 * - data: URL legado: comprime e envia ao Storage (não repassa à API)
 * - vazio: null
 */
export async function resolveClinicLogoUrlForSave(tenantId, logoInput, { logoFile = null } = {}) {
  if (logoFile) {
    return uploadClinicLogoFile(tenantId, logoFile);
  }

  const raw = String(logoInput ?? '').trim();
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;

  if (isDataUrl(raw)) {
    const res = await fetch(raw);
    const blob = await res.blob();
    const file = new File([blob], 'logo.webp', { type: blob.type || 'image/webp' });
    return uploadClinicLogoFile(tenantId, file);
  }

  throw new Error('Formato de logomarca inválido. Selecione JPG, PNG ou WEBP.');
}

/** Bloqueia envio de base64 à Admin API. */
export function assertLogoUrlSafeForApi(logoUrl) {
  const raw = String(logoUrl ?? '').trim();
  if (!raw) return null;
  if (isDataUrl(raw)) {
    throw new Error(
      'A logomarca ainda está em base64. O upload para o Supabase Storage deve concluir antes de salvar o perfil.',
    );
  }
  if (!isHttpUrl(raw)) {
    throw new Error('logo_url inválida. Esperada URL pública http(s) do Supabase Storage.');
  }
  return raw;
}
