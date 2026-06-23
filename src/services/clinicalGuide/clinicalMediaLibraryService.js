import { withDb, loadDb } from '../../db/index.js';
import { createId, normalizeText } from '../helpers.js';
import { uploadClinicalGuideImageToStorage } from './clinicalGuideStorageService.js';

function tenantIdFromUser(user) {
  return user?.tenantId || user?.tenant_id || null;
}

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

export function listClinicalMedia(user, { category = null, query = '', favoritesOnly = false } = {}) {
  const tenantId = tenantIdFromUser(user) || clinicId();
  const q = normalizeText(query).toLowerCase();
  return (loadDb().clinicalMediaLibrary || [])
    .filter((item) => !item.deletedAt)
    .filter((item) => !item.tenantId || item.tenantId === tenantId)
    .filter((item) => !category || item.category === category)
    .filter((item) => !favoritesOnly || item.isFavorite)
    .filter((item) => {
      if (!q) return true;
      const hay = [item.title, item.caption, ...(item.tags || [])].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function addClinicalMedia(user, payload) {
  const now = new Date().toISOString();
  const item = {
    id: createId('cmedia'),
    tenantId: tenantIdFromUser(user) || clinicId(),
    title: normalizeText(payload.title) || 'Imagem clínica',
    caption: normalizeText(payload.caption),
    category: payload.category || 'geral',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    imageUrl: payload.imageUrl || '',
    mediaType: payload.mediaType || 'image',
    isFavorite: Boolean(payload.isFavorite),
    createdBy: user?.id || null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  withDb((db) => {
    if (!Array.isArray(db.clinicalMediaLibrary)) db.clinicalMediaLibrary = [];
    db.clinicalMediaLibrary.push(item);
    return db;
  });
  return item;
}

export async function uploadClinicalMediaFile(user, file, meta = {}) {
  if (!file) throw new Error('Arquivo inválido.');
  const maxBytes = 8 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error('Arquivo deve ter no máximo 8 MB.');

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(file);
  });

  const tenantId = tenantIdFromUser(user) || clinicId();
  const imageUrl = await uploadClinicalGuideImageToStorage({
    tenantId,
    guideId: 'media-library',
    file,
    dataUrlFallback: dataUrl,
  });

  return addClinicalMedia(user, {
    title: meta.title || file.name?.replace(/\.[^.]+$/, '') || 'Imagem clínica',
    caption: meta.caption || '',
    category: meta.category || 'geral',
    tags: meta.tags || [],
    imageUrl,
    mediaType: file.type?.startsWith('video/') ? 'video' : 'image',
  });
}

export function toggleClinicalMediaFavorite(user, mediaId) {
  return withDb((db) => {
    const index = (db.clinicalMediaLibrary || []).findIndex((m) => m.id === mediaId);
    if (index < 0) throw new Error('Mídia não encontrada.');
    db.clinicalMediaLibrary[index] = {
      ...db.clinicalMediaLibrary[index],
      isFavorite: !db.clinicalMediaLibrary[index].isFavorite,
      updatedAt: new Date().toISOString(),
    };
    return db.clinicalMediaLibrary[index];
  });
}

export function softDeleteClinicalMedia(user, mediaId) {
  return withDb((db) => {
    const index = (db.clinicalMediaLibrary || []).findIndex((m) => m.id === mediaId);
    if (index < 0) throw new Error('Mídia não encontrada.');
    db.clinicalMediaLibrary[index] = {
      ...db.clinicalMediaLibrary[index],
      deletedAt: new Date().toISOString(),
    };
    return true;
  });
}
