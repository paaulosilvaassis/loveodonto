/**
 * Phase 4.8E — POST/GET /internal/app/assets/avatar
 * Bucket privado collaborator-photos; signed URL; foto_url = storage path.
 * Zero IndexedDB.
 */

import busboy from 'busboy';
import {
  CollaboratorsListForbiddenError,
  CollaboratorsListQueryError,
  assertNoTenantIdQueryParam,
  resolveAuthenticatedTenantForCollaboratorsList,
} from './collaboratorsApiList.js';
import {
  CollaboratorPermissionsNotFoundError,
  resolveAdminTenantForPermissions,
  resolveCollaboratorInTenant,
} from './collaboratorsPermissionsApi.js';
import {
  LOGO_MAX_BYTES,
  validateLogoFileInput,
} from './assetsLogoApi.js';

export const PRODUCTION_PROJECT_REF = 'uoepkwhqztmsjnzirpev';
export const COLLABORATOR_PHOTOS_BUCKET = 'collaborator-photos';
export const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;
export const AVATAR_MAX_BYTES = LOGO_MAX_BYTES;

const DATA_URI_RE = /^data:image\//i;

export class AssetsAvatarValidationError extends Error {
  constructor(message, code = 'PAYLOAD_INVALID', details = {}) {
    super(message);
    this.name = 'AssetsAvatarValidationError';
    this.code = code;
    this.details = details;
  }
}

export class AssetsAvatarStorageError extends Error {
  constructor(message = 'Falha ao enviar avatar ao Storage.', code = 'STORAGE_UPLOAD_FAILED') {
    super(message);
    this.name = 'AssetsAvatarStorageError';
    this.code = code;
  }
}

export class AssetsAvatarProfileError extends Error {
  constructor(message = 'Falha ao atualizar collaborators.foto_url.', code = 'DB_WRITE_FAILED') {
    super(message);
    this.name = 'AssetsAvatarProfileError';
    this.code = code;
  }
}

export class AssetsAvatarRollbackError extends Error {
  constructor(message = 'Falha ao salvar foto_url e rollback do Storage também falhou.', code = 'ROLLBACK_FAILED') {
    super(message);
    this.name = 'AssetsAvatarRollbackError';
    this.code = code;
  }
}

export class AssetsAvatarNotFoundError extends Error {
  constructor(message = 'Avatar não encontrado para este colaborador.', code = 'AVATAR_NOT_FOUND') {
    super(message);
    this.name = 'AssetsAvatarNotFoundError';
    this.code = code;
  }
}

export class AssetsAvatarSignedUrlError extends Error {
  constructor(message = 'Falha ao gerar signed URL.', code = 'SIGNED_URL_FAILED') {
    super(message);
    this.name = 'AssetsAvatarSignedUrlError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function mapValidationError(err) {
  if (err?.name === 'AssetsLogoValidationError') {
    return new AssetsAvatarValidationError(err.message, err.code, err.details || {});
  }
  return err;
}

export function buildAvatarObjectPath(tenantId, collaboratorUuid) {
  const tid = normalizeText(tenantId);
  const cid = normalizeText(collaboratorUuid);
  if (!tid || tid.includes('..') || tid.includes('/')) {
    throw new AssetsAvatarValidationError('tenant_id inválido para path do avatar.', 'UNSAFE_OBJECT_PATH');
  }
  if (!cid || cid.includes('..') || cid.includes('/')) {
    throw new AssetsAvatarValidationError('collaborator_id inválido para path do avatar.', 'UNSAFE_OBJECT_PATH');
  }
  return `${tid}/collaborators/${cid}/avatar.webp`;
}

export function formatAvatarStoragePath(objectPath) {
  return normalizeText(objectPath);
}

export function resolveAvatarObjectPathFromFotoUrl(fotoUrl) {
  const raw = normalizeText(fotoUrl);
  if (!raw || DATA_URI_RE.test(raw)) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return null;
  if (raw.startsWith('collaborator-photos:')) {
    return raw.slice('collaborator-photos:'.length);
  }
  if (raw.includes('/collaborators/') && raw.endsWith('/avatar.webp')) {
    return raw.replace(/^\//, '');
  }
  return null;
}

export function assertNoForbiddenAvatarFormFields(fields = {}) {
  const forbidden = ['tenant_id', 'foto_url', 'fotoUrl', 'base64', 'data', 'legacy_id', 'collaborator_uuid'];
  for (const key of forbidden) {
    if (fields[key] !== undefined && fields[key] !== null && normalizeText(fields[key])) {
      throw new AssetsAvatarValidationError(
        `Campo "${key}" não é suportado neste endpoint.`,
        key === 'tenant_id' ? 'TENANT_BODY_FORBIDDEN' : 'UNSUPPORTED_FIELD',
      );
    }
  }
}

export async function uploadAvatarBufferToStorage(supabase, objectPath, buffer, mimeType) {
  const { error: uploadError } = await supabase.storage
    .from(COLLABORATOR_PHOTOS_BUCKET)
    .upload(objectPath, buffer, {
      contentType: mimeType,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new AssetsAvatarStorageError(
      uploadError.message || 'Falha ao enviar avatar ao Storage.',
      'STORAGE_UPLOAD_FAILED',
    );
  }

  return { objectPath, mimeType, sizeBytes: buffer.length };
}

export async function deleteAvatarObjectFromStorage(supabase, objectPath) {
  const { error } = await supabase.storage.from(COLLABORATOR_PHOTOS_BUCKET).remove([objectPath]);
  if (error) {
    const err = new Error(error.message || 'Falha ao remover avatar do Storage.');
    err.code = 'STORAGE_DELETE_FAILED';
    throw err;
  }
}

export async function createSignedUrlForAvatar(
  supabase,
  objectPath,
  expiresIn = AVATAR_SIGNED_URL_TTL_SECONDS,
) {
  const { data, error } = await supabase.storage
    .from(COLLABORATOR_PHOTOS_BUCKET)
    .createSignedUrl(objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new AssetsAvatarSignedUrlError(
      error?.message || 'Falha ao gerar signed URL.',
      'SIGNED_URL_FAILED',
    );
  }

  if (String(data.signedUrl).includes('/object/public/')) {
    throw new AssetsAvatarSignedUrlError('URL pública não permitida para avatar.', 'SIGNED_URL_FAILED');
  }

  return {
    signed_url: data.signedUrl,
    signed_url_expires_in: expiresIn,
    url_type: 'signed',
  };
}

export async function updateCollaboratorFotoUrlOnly(supabase, tenantId, collaboratorId, storagePath) {
  const pathValue = formatAvatarStoragePath(storagePath);
  if (!pathValue || DATA_URI_RE.test(pathValue)) {
    throw new AssetsAvatarProfileError('foto_url inválida.', 'DB_WRITE_FAILED');
  }

  const { data, error } = await supabase
    .from('collaborators')
    .update({
      foto_url: pathValue,
      updated_at: new Date().toISOString(),
    })
    .eq('id', collaboratorId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .select('id, tenant_id, foto_url, legacy_id, status, cargo')
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) {
    throw new AssetsAvatarProfileError('Colaborador não encontrado para atualizar foto_url.', 'DB_WRITE_FAILED');
  }
  return data;
}

export async function uploadAvatarAsset({
  supabase,
  tenantId,
  collaborator,
  buffer,
  mimeType,
  filename,
}) {
  let validated;
  try {
    validated = validateLogoFileInput({ buffer, mimeType, filename });
  } catch (err) {
    throw mapValidationError(err);
  }

  const objectPath = buildAvatarObjectPath(tenantId, collaborator.id);
  let uploadResult;
  try {
    uploadResult = await uploadAvatarBufferToStorage(
      supabase,
      objectPath,
      validated.buffer,
      validated.mimeType,
    );
  } catch (err) {
    if (err instanceof AssetsAvatarStorageError) throw err;
    throw new AssetsAvatarStorageError(err?.message, 'STORAGE_UPLOAD_FAILED');
  }

  const storagePath = formatAvatarStoragePath(objectPath);
  try {
    await updateCollaboratorFotoUrlOnly(supabase, tenantId, collaborator.id, storagePath);
  } catch (profileErr) {
    try {
      await deleteAvatarObjectFromStorage(supabase, objectPath);
    } catch (deleteErr) {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[ASSET_AVATAR_UPLOAD] rollback delete failed', deleteErr?.message);
      }
      throw new AssetsAvatarRollbackError(
        'Falha ao salvar foto_url e rollback do Storage também falhou.',
        'ROLLBACK_FAILED',
      );
    }
    throw new AssetsAvatarProfileError(
      profileErr?.message || 'Falha ao atualizar collaborators.foto_url.',
      'DB_WRITE_FAILED',
    );
  }

  let signed;
  try {
    signed = await createSignedUrlForAvatar(supabase, objectPath);
  } catch (signedErr) {
    throw new AssetsAvatarSignedUrlError(signedErr?.message, 'SIGNED_URL_FAILED');
  }

  return {
    asset_type: 'avatar',
    path: objectPath,
    storage_ref: `${COLLABORATOR_PHOTOS_BUCKET}:${objectPath}`,
    signed_url: signed.signed_url,
    signed_url_expires_in: signed.signed_url_expires_in,
    mime_type: uploadResult.mimeType,
    size_bytes: uploadResult.sizeBytes,
    url_type: 'signed',
    collaborator_id: collaborator.id,
  };
}

export async function readAvatarSignedUrlForCollaborator({
  supabase,
  collaborator,
  fotoUrl,
}) {
  const objectPath = resolveAvatarObjectPathFromFotoUrl(fotoUrl);
  if (!objectPath) {
    throw new AssetsAvatarNotFoundError(
      'foto_url não referencia storage path canônico.',
      'AVATAR_NOT_FOUND',
    );
  }

  const signed = await createSignedUrlForAvatar(supabase, objectPath);

  return {
    asset_type: 'avatar',
    path: objectPath,
    signed_url: signed.signed_url,
    signed_url_expires_in: signed.signed_url_expires_in,
    url_type: 'signed',
    collaborator_id: collaborator.id,
  };
}

export function parseMultipartAvatarUpload(req) {
  return new Promise((resolve, reject) => {
    const contentType = normalizeText(req.headers?.['content-type']);
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      reject(new AssetsAvatarValidationError(
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
        fileSize: AVATAR_MAX_BYTES + 1,
      },
    });

    bb.on('field', (name, value) => {
      fields[name] = value;
      if (DATA_URI_RE.test(normalizeText(value))) {
        reject(new AssetsAvatarValidationError('Base64/data URI não é aceito.', 'PAYLOAD_INVALID'));
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
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => { limitExceeded = true; });
      stream.on('end', () => {
        if (!limitExceeded) fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('error', (err) => reject(err));

    bb.on('finish', () => {
      try {
        if (limitExceeded) {
          reject(new AssetsAvatarValidationError(
            'Arquivo excede o tamanho máximo permitido (2 MB).',
            'FILE_TOO_LARGE',
            { max_bytes: AVATAR_MAX_BYTES },
          ));
          return;
        }
        assertNoForbiddenAvatarFormFields(fields);
        if (!normalizeText(fields.collaborator_id)) {
          reject(new AssetsAvatarValidationError('Campo collaborator_id é obrigatório.', 'PAYLOAD_INVALID'));
          return;
        }
        if (!fileSeen || !fileBuffer?.length) {
          reject(new AssetsAvatarValidationError('Campo file é obrigatório.', 'PAYLOAD_INVALID'));
          return;
        }
        resolve({
          buffer: fileBuffer,
          mimeType: fileMeta.mimeType,
          filename: fileMeta.filename,
          fields,
          collaborator_id: normalizeText(fields.collaborator_id),
        });
      } catch (err) {
        reject(err);
      }
    });

    req.pipe(bb);
  });
}

function sendAvatarError(res, err, logTag, logPayload) {
  console.log(logTag, { ...logPayload, error: err?.code || err?.message });

  if (err instanceof CollaboratorsListQueryError) {
    return res.status(400).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof AssetsAvatarValidationError) {
    const status = err.code === 'FILE_TOO_LARGE' ? 413 : 400;
    return res.status(status).json({
      ok: false,
      error: err.message,
      code: err.code,
      details: err.details || {},
    });
  }
  if (err instanceof CollaboratorPermissionsNotFoundError) {
    return res.status(404).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof AssetsAvatarNotFoundError) {
    return res.status(404).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof CollaboratorsListForbiddenError) {
    return res.status(403).json({ ok: false, error: err.message, code: err.code || 'FORBIDDEN' });
  }
  if (err instanceof AssetsAvatarRollbackError) {
    return res.status(503).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof AssetsAvatarProfileError) {
    return res.status(500).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof AssetsAvatarStorageError || err instanceof AssetsAvatarSignedUrlError) {
    return res.status(500).json({ ok: false, error: err.message, code: err.code });
  }

  console.error(logTag, err);
  return res.status(500).json({ ok: false, error: 'Falha ao processar avatar.', code: 'INTERNAL_ERROR' });
}

export function createAssetsAvatarPostHandler(deps) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    parseMultipart = parseMultipartAvatarUpload,
    logAssetAudit,
  } = deps;

  return async function assetsAvatarPostHandler(req, res) {
    const started = Date.now();
    const logPayload = {
      tenant_id: null,
      actor_user_id: req.appAuthUser?.id || null,
      collaborator_ref: null,
      collaborator_id: null,
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
      assertNoForbiddenAvatarFormFields(parsed.fields || {});
      logPayload.collaborator_ref = parsed.collaborator_id;

      const { collaborator, resolved_by: resolvedBy } = await resolveCollaboratorInTenant(
        supabase,
        tenantId,
        parsed.collaborator_id,
      );
      logPayload.collaborator_id = collaborator.id;

      const result = await uploadAvatarAsset({
        supabase,
        tenantId,
        collaborator,
        buffer: parsed.buffer,
        mimeType: parsed.mimeType,
        filename: parsed.filename,
      });

      logPayload.path = result.path;
      logPayload.mime_type = result.mime_type;
      logPayload.size_bytes = result.size_bytes;
      logPayload.durationMs = Date.now() - started;

      console.log('[ASSET_AVATAR_UPLOAD]', logPayload);

      if (typeof logAssetAudit === 'function') {
        logAssetAudit({
          audit_event: 'ASSET_AVATAR_UPLOADED',
          tenantId,
          actorUserId: req.appAuthUser.id,
          collaboratorId: collaborator.id,
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
          resolved_by: resolvedBy,
          audit_event: 'ASSET_AVATAR_UPLOADED',
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      return sendAvatarError(res, err, '[ASSET_AVATAR_UPLOAD]', logPayload);
    }
  };
}

export function createAssetsAvatarGetHandler(deps) {
  const {
    supabase,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
    fetchCollaboratorFotoUrl,
  } = deps;

  return async function assetsAvatarGetHandler(req, res) {
    const started = Date.now();
    const logPayload = {
      tenant_id: null,
      actor_user_id: req.appAuthUser?.id || null,
      collaborator_ref: normalizeText(req.params?.collaboratorId),
      collaborator_id: null,
      signed_url_expires_in: AVATAR_SIGNED_URL_TTL_SECONDS,
      durationMs: 0,
    };

    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }

      assertNoTenantIdQueryParam(req.query || {});

      const tenantId = req.tenantContext?.tenantId
        ?? (await resolveAuthenticatedTenantForCollaboratorsList({
          authUserId: req.appAuthUser.id,
          emailHint: req.appAuthUser.email || '',
          resolveActiveTenantUser,
          isActiveTenantUserRow,
        })).tenantId;
      logPayload.tenant_id = tenantId;

      const { collaborator, resolved_by: resolvedBy } = await resolveCollaboratorInTenant(
        supabase,
        tenantId,
        req.params?.collaboratorId,
      );
      logPayload.collaborator_id = collaborator.id;

      let fotoUrl = null;
      if (typeof fetchCollaboratorFotoUrl === 'function') {
        fotoUrl = await fetchCollaboratorFotoUrl(supabase, tenantId, collaborator.id);
      } else {
        const { data, error } = await supabase
          .from('collaborators')
          .select('foto_url')
          .eq('id', collaborator.id)
          .eq('tenant_id', tenantId)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) throw error;
        fotoUrl = data?.foto_url || null;
      }

      if (!normalizeText(fotoUrl)) {
        throw new AssetsAvatarNotFoundError();
      }

      const result = await readAvatarSignedUrlForCollaborator({
        supabase,
        collaborator,
        fotoUrl,
      });

      logPayload.durationMs = Date.now() - started;
      console.log('[ASSET_AVATAR_SIGNED_URL]', logPayload);

      return res.status(200).json({
        ok: true,
        data: result,
        meta: {
          tenant_id: tenantId,
          collaborator_id: collaborator.id,
          collaborator_ref: logPayload.collaborator_ref,
          resolved_by: resolvedBy,
          requested_by: req.appAuthUser.id,
        },
      });
    } catch (err) {
      logPayload.durationMs = Date.now() - started;
      return sendAvatarError(res, err, '[ASSET_AVATAR_SIGNED_URL]', logPayload);
    }
  };
}
