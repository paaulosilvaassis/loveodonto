/**
 * Upload da logomarca para Supabase Storage antes de salvar clinic_profiles.
 * Evita HTTP 413 ao enviar base64 no JSON do PUT /clinic-profile.
 */
import { supabaseAppClient, supabasePlatformClient } from '../lib/supabaseClients.js';

const DATA_URL_RE = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i;
const BUCKET = 'clinic-logos';

function extensionForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('svg')) return 'svg';
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}

function isHttpUrl(value) {
  const v = String(value || '').trim();
  return v.startsWith('https://') || v.startsWith('http://');
}

function isDataUrl(value) {
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

function dataUrlToBlob(dataUrl) {
  const match = String(dataUrl).trim().match(DATA_URL_RE);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { blob: new Blob([bytes], { type: mime }), mime, ext: extensionForMime(mime) };
}

/**
 * Se logo for data URL, faz upload e retorna URL pública.
 * Se já for http(s), retorna inalterado.
 */
export async function resolveClinicLogoUrlForSave(tenantId, logoInput) {
  const raw = String(logoInput ?? '').trim();
  if (!raw) return null;
  if (isHttpUrl(raw)) return raw;
  if (!isDataUrl(raw)) return raw;

  const tid = String(tenantId || '').trim();
  if (!tid) {
    throw new Error('tenant_id ausente para upload da logomarca.');
  }

  const parsed = dataUrlToBlob(raw);
  if (!parsed) {
    throw new Error('Formato de imagem inválido para logomarca.');
  }

  const client = await pickAuthenticatedStorageClient();
  if (!client) {
    throw new Error('Supabase não configurado para upload da logomarca.');
  }

  const objectPath = `${tid}/logo.${parsed.ext}`;
  const { error } = await client.storage.from(BUCKET).upload(objectPath, parsed.blob, {
    upsert: true,
    contentType: parsed.mime,
    cacheControl: '3600',
  });

  if (error) {
    throw new Error(`Falha ao enviar logomarca para o storage: ${error.message}`);
  }

  const { data } = client.storage.from(BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) {
    throw new Error('Upload da logomarca concluído, mas a URL pública não foi gerada.');
  }
  return data.publicUrl;
}

export { isDataUrl, isHttpUrl };
