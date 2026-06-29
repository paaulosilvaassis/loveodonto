/**
 * Persiste logomarca da clínica no Supabase Storage (URL pública).
 * Aceita data URL (upload) ou URL http(s) já existente.
 */

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

export async function persistClinicLogoUrl(supabase, tenantId, logoInput) {
  const raw = String(logoInput ?? '').trim();
  if (!raw) return null;

  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    return raw;
  }

  const match = raw.match(DATA_URL_RE);
  if (!match) {
    return raw;
  }

  const mime = match[1];
  const b64 = match[2];
  const ext = extensionForMime(mime);
  const objectPath = `${tenantId}/logo.${ext}`;
  const buffer = Buffer.from(b64, 'base64');

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(objectPath, buffer, {
      contentType: mime,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    const err = new Error(`Falha ao enviar logomarca: ${uploadError.message}`);
    err.code = 'CLINIC_LOGO_UPLOAD_FAILED';
    throw err;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data?.publicUrl || null;
}
