/**
 * Phase 4.8C — POST /internal/app/assets/logo
 * Upload logomarca → Supabase Storage (clinic-logos) + clinic_profiles.logo_url
 * Zero IndexedDB. Sem conversão WEBP server-side (fallback: MIME detectado + path logo.webp).
 */

import busboy from 'busboy';
import {
  CollaboratorsListForbiddenError,
  CollaboratorsListQueryError,
  assertNoTenantIdQueryParam,
} from './collaboratorsApiList.js';
import { resolveAdminTenantForPermissions } from './collaboratorsPermissionsApi.js';

export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
export const CLINIC_LOGOS_BUCKET = 'clinic-logos';
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const DATA_URI_RE = /^data:image\//i;

export class AssetsLogoValidationError extends Error {
  constructor(message, code = 'PAYLOAD_INVALID', details = {}) {
    super(message);
    this.name = 'AssetsLogoValidationError';
    this.code = code;
    this.details = details;
  }
}

export class AssetsLogoStorageError extends Error {
  constructor(message = 'Falha ao enviar logomarca ao Storage.', code = 'STORAGE_UPLOAD_FAILED') {
    super(message);
    this.name = 'AssetsLogoStorageError';
    this.code = code;
  }
}

export class AssetsLogoProfileError extends Error {
  constructor(message = 'Falha ao atualizar clinic_profiles.logo_url.', code = 'DB_WRITE_FAILED') {
    super(message);
    this.name = 'AssetsLogoProfileError';
    this.code = code;
  }
}

export class AssetsLogoRollbackError extends Error {
  constructor(message = 'Falha ao atualizar perfil e rollback do Storage também falhou.', code = 'ROLLBACK_FAILED') {
    super(message);
    this.name = 'AssetsLogoRollbackError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function extensionFromFilename(filename) {
  const name = normalizeText(filename).toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot < 0) return '';
  return name.slice(dot);
}

export function detectImageMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
  ) return 'image/png';
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  return null;
}

export function assertNoForbiddenLogoFormFields(fields = {}) {
  const forbidden = ['tenant_id', 'logo_url', 'logoUrl', 'base64', 'data'];
  for (const key of forbidden) {
    if (fields[key] !== undefined && fields[key] !== null && normalizeText(fields[key])) {
      throw new AssetsLogoValidationError(
        `Campo "${key}" não é suportado neste endpoint.`,
        key === 'tenant_id' ? 'TENANT_BODY_FORBIDDEN' : 'UNSUPPORTED_FIELD',
      );
    }
  }
}

export function validateLogoFileInput({
  buffer,
  mimeType,
  filename,
  declaredSize,
}) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AssetsLogoValidationError('Campo file é obrigatório.', 'PAYLOAD_INVALID');
  }

  const size = declaredSize ?? buffer.length;
  if (size > LOGO_MAX_BYTES) {
    throw new AssetsLogoValidationError(
      'Arquivo excede o tamanho máximo permitido (2 MB).',
      'FILE_TOO_LARGE',
      { max_bytes: LOGO_MAX_BYTES, received_bytes: size },
    );
  }

  const asText = buffer.slice(0, Math.min(buffer.length, 32)).toString('utf8');
  if (DATA_URI_RE.test(asText)) {
    throw new AssetsLogoValidationError('Base64/data URI não é aceito.', 'PAYLOAD_INVALID');
  }

  const ext = extensionFromFilename(filename);
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    throw new AssetsLogoValidationError(
      `Extensão "${ext}" não permitida.`,
      'INVALID_FILE_EXTENSION',
      { extension: ext },
    );
  }

  const detectedMime = detectImageMimeFromBuffer(buffer);
  if (!detectedMime || !ALLOWED_MIMES.has(detectedMime)) {
    throw new AssetsLogoValidationError(
      'Tipo de arquivo inválido. Use JPEG, PNG ou WEBP.',
      'INVALID_FILE_TYPE',
    );
  }

  const headerMime = normalizeText(mimeType).toLowerCase();
  if (headerMime && headerMime !== 'application/octet-stream' && !ALLOWED_MIMES.has(headerMime)) {
    throw new AssetsLogoValidationError(
      'Content-Type do arquivo não permitido.',
      'INVALID_FILE_TYPE',
    );
  }

  if (headerMime && ALLOWED_MIMES.has(headerMime) && headerMime !== detectedMime) {
    throw new AssetsLogoValidationError(
      'Content-Type não corresponde ao conteúdo do arquivo.',
      'MIME_MISMATCH',
      { declared: headerMime, detected: detectedMime },
    );
  }

  return {
    buffer,
    mimeType: detectedMime,
    sizeBytes: buffer.length,
  };
}

export function buildLogoObjectPath(tenantId) {
  const tid = normalizeText(tenantId);
  if (!tid || tid.includes('..') || tid.includes('/')) {
    throw new AssetsLogoValidationError('tenant_id inválido para path do logo.', 'UNSAFE_OBJECT_PATH');
  }
  return `${tid}/logo.webp`;
}

export async function uploadLogoBufferToStorage(supabase, tenantId, buffer, mimeType) {
  const objectPath = buildLogoObjectPath(tenantId);
  const { error: uploadError } = await supabase.storage
    .from(CLINIC_LOGOS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new AssetsLogoStorageError(
      uploadError.message || 'Falha ao enviar logomarca ao Storage.',
      'STORAGE_UPLOAD_FAILED',
    );
  }

  const { data } = supabase.storage.from(CLINIC_LOGOS_BUCKET).getPublicUrl(objectPath);
  const publicUrl = data?.publicUrl || null;
  if (!publicUrl) {
    throw new AssetsLogoStorageError('URL pública não gerada após upload.', 'STORAGE_UPLOAD_FAILED');
  }

  return { objectPath, publicUrl, mimeType, sizeBytes: buffer.length };
}

export async function deleteLogoObjectFromStorage(supabase, objectPath) {
  const { error } = await supabase.storage.from(CLINIC_LOGOS_BUCKET).remove([objectPath]);
  if (error) {
    const err = new Error(error.message || 'Falha ao remover objeto do Storage.');
    err.code = 'STORAGE_DELETE_FAILED';
    throw err;
  }
}

export async function updateClinicProfileLogoUrlOnly(supabase, tenantId, logoUrl) {
  const normalizedUrl = normalizeText(logoUrl);
  if (!normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('http://')) {
    throw new AssetsLogoProfileError('logo_url deve ser URL http(s) do Storage.', 'DB_WRITE_FAILED');
  }
  if (DATA_URI_RE.test(normalizedUrl)) {
    throw new AssetsLogoProfileError('logo_url não pode ser data URI.', 'DB_WRITE_FAILED');
  }

  const updatedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from('clinic_profiles')
    .update({ logo_url: normalizedUrl, updated_at: updatedAt })
    .eq('tenant_id', tenantId)
    .select('tenant_id, logo_url, name, email')
    .maybeSingle();

  if (updateError) throw updateError;

  if (updated?.tenant_id) {
    return updated;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('clinic_profiles')
    .insert({
      tenant_id: tenantId,
      logo_url: normalizedUrl,
      name: 'Minha Clínica',
      status: 'active',
      updated_at: updatedAt,
    })
    .select('tenant_id, logo_url, name, email')
    .single();

  if (insertError) {
    const err = new AssetsLogoProfileError(
      insertError.message || 'Falha ao atualizar clinic_profiles.logo_url.',
      'DB_WRITE_FAILED',
    );
    throw err;
  }
  return inserted;
}

export async function uploadLogoAsset({
  supabase,
  tenantId,
  buffer,
  mimeType,
  filename,
}) {
  const validated = validateLogoFileInput({ buffer, mimeType, filename });
  let uploadResult;
  try {
    uploadResult = await uploadLogoBufferToStorage(
      supabase,
      tenantId,
      validated.buffer,
      validated.mimeType,
    );
  } catch (err) {
    if (err instanceof AssetsLogoStorageError) throw err;
    throw new AssetsLogoStorageError(err?.message, 'STORAGE_UPLOAD_FAILED');
  }

  try {
    await updateClinicProfileLogoUrlOnly(supabase, tenantId, uploadResult.publicUrl);
  } catch (profileErr) {
    try {
      await deleteLogoObjectFromStorage(supabase, uploadResult.objectPath);
    } catch (deleteErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[ASSET_LOGO_UPLOAD] rollback delete failed', deleteErr?.message);
      }
      throw new AssetsLogoRollbackError(
        'Falha ao salvar logo_url e rollback do Storage também falhou.',
        'ROLLBACK_FAILED',
      );
    }
    throw new AssetsLogoProfileError(
      profileErr?.message || 'Falha ao atualizar clinic_profiles.logo_url.',
      'DB_WRITE_FAILED',
    );
  }

  return {
    asset_type: 'logo',
    url: uploadResult.publicUrl,
    path: uploadResult.objectPath,
    mime_type: uploadResult.mimeType,
    size_bytes: uploadResult.sizeBytes,
    url_type: 'public',
  };
}

export function parseMultipartLogoUpload(req) {
  return new Promise((resolve, reject) => {
    const contentType = normalizeText(req.headers?.['content-type']);
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      reject(new AssetsLogoValidationError(
        'Content-Type multipart/form-data é obrigatório.',
        'UNSUPPORTED_MEDIA_TYPE',
      ));
      return;
    }

    const fields = {};
    let fileBuffer = null;
    let fileMeta = { filename: '', mimeType: '' };
    let fileSeen = false;
    let limitExceeded = false;

    const bb = busboy({
      headers: req.headers,
      limits: {
        files: 2,
        fields: 20,
        fileSize: LOGO_MAX_BYTES + 1,
      },
    });

    bb.on('field', (name, value) => {
      fields[name] = value;
      if (DATA_URI_RE.test(normalizeText(value))) {
        reject(new AssetsLogoValidationError('Base64/data URI não é aceito.', 'PAYLOAD_INVALID'));
      }
    });

    bb.on('file', (name, stream, info) => {
      if (name !== 'file') {
        stream.resume();
        return;
      }
      fileSeen = true;
      fileMeta = {
        filename: info.filename || '',
        mimeType: info.mimeType || '',
      };
      const chunks = [];
      stream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      stream.on('limit', () => {
        limitExceeded = true;
      });
      stream.on('end', () => {
        if (!limitExceeded) {
          fileBuffer = Buffer.concat(chunks);
        }
      });
    });

    bb.on('error', (err) => {
      reject(err);
    });

    bb.on('finish', () => {
      try {
        if (limitExceeded) {
          reject(new AssetsLogoValidationError(
            'Arquivo excede o tamanho máximo permitido (2 MB).',
            'FILE_TOO_LARGE',
            { max_bytes: LOGO_MAX_BYTES },
          ));
          return;
        }
        assertNoForbiddenLogoFormFields(fields);
        if (!fileSeen || !fileBuffer?.length) {
          reject(new AssetsLogoValidationError('Campo file é obrigatório.', 'PAYLOAD_INVALID'));
          return;
        }
        resolve({
          buffer: fileBuffer,
          mimeType: fileMeta.mimeType,
          filename: fileMeta.filename,
          fields,
        });
      } catch (err) {
        reject(err);
      }
    });

    req.pipe(bb);
  });
}

export function createAssetsLogoHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    parseMultipart = parseMultipartLogoUpload,
    logAssetAudit,
  } = deps;

  return async function assetsLogoHandler(req, res) {
    const started = Date.now();
    const logPayload = {
      tenant_id: null,
      actor_user_id: req.appAuthUser?.id || null,
      path: null,
      mime_type: null,
      size_bytes: 0,
      durationMs: 0,
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      assertNoTenantIdQueryParam(req.query || {});

      const tenantId = req.tenantContext?.tenantId ?? await resolveAdminTenantForPermissions({
        authUserId: req.appAuthUser.id,
        getTenantAdminActorOrThrow,
        resolveActiveTenantUser,
      });
      logPayload.tenant_id = tenantId;

      const parsed = await parseMultipart(req);
      assertNoForbiddenLogoFormFields(parsed.fields || {});

      const result = await uploadLogoAsset({
        supabase,
        tenantId,
        buffer: parsed.buffer,
        mimeType: parsed.mimeType,
        filename: parsed.filename,
      });

      logPayload.path = result.path;
      logPayload.mime_type = result.mime_type;
      logPayload.size_bytes = result.size_bytes;
      logPayload.durationMs = Date.now() - started;

      console.log('[ASSET_LOGO_UPLOAD]', logPayload);

      if (typeof logAssetAudit === 'function') {
        logAssetAudit({
          audit_event: 'ASSET_LOGO_UPLOADED',
          tenantId,
          actorUserId: req.appAuthUser.id,
          objectPath: result.path,
          sizeBytes: result.size_bytes,
        });
      }

      return res.status(200).json({
        ok: true,
        data: result,
        meta: {
          tenant_id: tenantId,
          updated_by: req.appAuthUser.id,
          audit_event: 'ASSET_LOGO_UPLOADED',
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      console.log('[ASSET_LOGO_UPLOAD]', {
        ...logPayload,
        error: err?.code || err?.message,
      });

      if (err instanceof CollaboratorsListQueryError) {
        const status = err.code === 'TENANT_QUERY_FORBIDDEN' ? 400 : 400;
        return res.status(status).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof AssetsLogoValidationError) {
        const status = err.code === 'FILE_TOO_LARGE' ? 413 : 400;
        return res.status(status).json({
          ok: false,
          error: err.message,
          code: err.code,
          details: err.details || {},
        });
      }
      if (err instanceof CollaboratorsListForbiddenError) {
        return res.status(403).json({ ok: false, error: err.message, code: err.code || 'ADMIN_REQUIRED' });
      }
      if (err instanceof AssetsLogoRollbackError) {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof AssetsLogoProfileError) {
        return res.status(500).json({ ok: false, error: err.message, code: err.code });
      }
      if (err instanceof AssetsLogoStorageError) {
        return res.status(500).json({ ok: false, error: err.message, code: err.code });
      }

      console.error('[ASSET_LOGO_UPLOAD]', err);
      return res.status(500).json({
        ok: false,
        error: 'Falha ao enviar logomarca.',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}
