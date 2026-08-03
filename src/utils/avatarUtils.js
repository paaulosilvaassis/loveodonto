import { supabaseAppClient } from '../lib/supabaseClients.js';

const PHOTO_KEYS = [
  'fotoUrl',
  'photoUrl',
  'avatarUrl',
  'imageUrl',
  'photo',
  'profile_photo',
  'profilePhoto',
  'picture',
  'foto',
  'photo_url',
  'avatar_url',
  'image_url',
];

const STORAGE_BUCKETS = ['collaborators', 'avatars', 'profiles', 'staff'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveAbsoluteUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  if (
    trimmed.startsWith('data:')
    || trimmed.startsWith('blob:')
    || trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
  ) {
    return trimmed;
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith('/')) {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${trimmed}`;
    }
    return trimmed;
  }

  const storageUrl = resolveSupabaseStorageUrl(trimmed);
  if (storageUrl) return storageUrl;

  return trimmed;
}

function resolveSupabaseStorageUrl(path) {
  if (!supabaseAppClient || !path) return '';

  const clean = String(path).replace(/^\//, '');

  for (const bucket of STORAGE_BUCKETS) {
    if (clean.startsWith(`${bucket}/`)) {
      const objectPath = clean.slice(bucket.length + 1);
      const { data } = supabaseAppClient.storage.from(bucket).getPublicUrl(objectPath);
      if (data?.publicUrl) return data.publicUrl;
    }
  }

  for (const bucket of STORAGE_BUCKETS) {
    const { data } = supabaseAppClient.storage.from(bucket).getPublicUrl(clean);
    if (data?.publicUrl) return data.publicUrl;
  }

  return '';
}

/**
 * Extrai URL de avatar de colaborador, usuário ou objeto equivalente.
 */
export function getUserAvatarUrl(entity) {
  if (!entity) return '';
  if (typeof entity === 'string') return resolveAbsoluteUrl(entity);

  if (typeof entity !== 'object') return '';

  for (const key of PHOTO_KEYS) {
    if (isNonEmptyString(entity[key])) {
      return resolveAbsoluteUrl(entity[key]);
    }
  }

  if (entity.profile && entity.profile !== entity) {
    const nested = getUserAvatarUrl(entity.profile);
    if (nested) return nested;
  }

  if (entity.linked_collaborator) {
    const linked = getUserAvatarUrl(entity.linked_collaborator);
    if (linked) return linked;
  }

  if (entity.collaborator) {
    const linked = getUserAvatarUrl(entity.collaborator);
    if (linked) return linked;
  }

  return '';
}

export function getDisplayName(entity, fallback = '') {
  if (!entity || typeof entity !== 'object') return fallback;
  return (
    entity.nomeCompleto
    || entity.full_name
    || entity.name
    || entity.apelido
    || entity.displayName
    || entity.email
    || fallback
  );
}

export function getInitialsFromName(name, email = '') {
  const display = String(name || '').trim();
  if (display && !display.includes('@')) {
    const parts = display.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] || '');
    const initials = `${first}${second}`.toUpperCase();
    if (initials) return initials;
  }
  const mail = String(email || display || '').trim();
  if (mail) return mail[0].toUpperCase();
  return '?';
}

export function mapCollaboratorToProfessionalOption(collaborator) {
  const avatarUrl = getUserAvatarUrl(collaborator);
  return {
    id: collaborator.id,
    name: collaborator.nomeCompleto || collaborator.apelido || 'Profissional',
    specialty: collaborator.especialidades?.[0] || collaborator.cargo || '',
    avatarUrl,
    photoUrl: avatarUrl,
    collaborator,
  };
}
