import { withDb, loadDb } from '../../db/index.js';
import { createId, normalizeText } from '../helpers.js';
import { seedClinicalGuidesForDb } from './clinicalGuideSeed.js';
import { CLINICAL_GUIDE_CATEGORIES } from './clinicalGuideCategories.js';
import { uploadClinicalGuideImageToStorage } from './clinicalGuideStorageService.js';

const VISIBILITY = {
  ALL: 'all',
  CREATOR: 'creator_only',
};

function tenantIdFromUser(user) {
  return user?.tenantId || user?.tenant_id || null;
}

function clinicId() {
  return loadDb().clinicProfile?.id || 'clinic-1';
}

function slugify(text) {
  return normalizeText(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeGuide(row) {
  if (!row || row.deletedAt) return null;
  return {
    ...row,
    indications: Array.isArray(row.indications) ? row.indications : [],
    contraindications: Array.isArray(row.contraindications) ? row.contraindications : [],
    treatmentSteps: Array.isArray(row.treatmentSteps) ? row.treatmentSteps : [],
    preCare: Array.isArray(row.preCare) ? row.preCare : [],
    postCare: Array.isArray(row.postCare) ? row.postCare : [],
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    risks: Array.isArray(row.risks) ? row.risks : [],
    faq: Array.isArray(row.faq) ? row.faq : [],
    keywords: Array.isArray(row.keywords) ? row.keywords : [],
    beforeAfter: row.beforeAfter || null,
    videos: Array.isArray(row.videos) ? row.videos : [],
    pdfUrl: row.pdfUrl || '',
    mediaVersion: row.mediaVersion || 1,
    active: row.active !== false,
  };
}

function canViewGuide(guide, user) {
  if (!guide || !guide.active) return false;
  if (guide.isSystemDefault) return true;
  const tenantId = tenantIdFromUser(user);
  if (guide.tenantId && tenantId && guide.tenantId !== tenantId) return false;
  if (guide.visibility === VISIBILITY.CREATOR && guide.createdBy && user?.id !== guide.createdBy) {
    return false;
  }
  return true;
}

function canManageGuide(guide, user) {
  if (!user) return false;
  if (user.isMaster || user.role === 'admin' || user.role === 'master' || user.role === 'gerente') return true;
  if (!guide?.isCustom) return false;
  return guide.createdBy === user.id;
}

export function ensureClinicalGuidesSeeded() {
  return withDb((db) => seedClinicalGuidesForDb(db));
}

export function listClinicalGuideCategories() {
  return CLINICAL_GUIDE_CATEGORIES;
}

export function listClinicalGuides(user, { category = null, includeInactive = false } = {}) {
  ensureClinicalGuidesSeeded();
  const db = loadDb();
  return (db.clinicalGuides || [])
    .map(normalizeGuide)
    .filter(Boolean)
    .filter((guide) => (includeInactive || guide.active))
    .filter((guide) => canViewGuide(guide, user))
    .filter((guide) => !category || guide.category === category)
    .sort((a, b) => {
      if (a.isSystemDefault !== b.isSystemDefault) return a.isSystemDefault ? -1 : 1;
      return String(a.title).localeCompare(String(b.title), 'pt-BR');
    });
}

export function getClinicalGuide(guideId, user) {
  ensureClinicalGuidesSeeded();
  const guide = normalizeGuide((loadDb().clinicalGuides || []).find((g) => g.id === guideId));
  if (!guide || !canViewGuide(guide, user)) return null;
  return guide;
}

export function getClinicalGuideBySlug(slug, user) {
  ensureClinicalGuidesSeeded();
  const guide = normalizeGuide((loadDb().clinicalGuides || []).find((g) => g.slug === slug));
  if (!guide || !canViewGuide(guide, user)) return null;
  return guide;
}

export function listClinicalGuideImages(guideId, { patientView = false, imageType = null } = {}) {
  ensureClinicalGuidesSeeded();
  return (loadDb().clinicalGuideImages || [])
    .filter((img) => img.guideId === guideId)
    .filter((img) => !patientView || img.visibleToPatient !== false)
    .filter((img) => !imageType || img.imageType === imageType)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export function getGuideBeforeAfter(guide) {
  if (!guide) return null;
  if (guide.beforeAfter?.before && guide.beforeAfter?.after) {
    return guide.beforeAfter;
  }
  const images = listClinicalGuideImages(guide.id);
  const before = images.find((img) => img.imageType === 'before');
  const after = images.find((img) => img.imageType === 'after');
  if (before?.imageUrl && after?.imageUrl) {
    return { before: before.imageUrl, after: after.imageUrl };
  }
  return null;
}

export function listGuideStepCards(guide) {
  const images = listClinicalGuideImages(guide.id).filter((img) => ['step', 'cover'].includes(img.imageType));
  const steps = guide.treatmentSteps || [];
  return steps.map((step, index) => {
    const img = images[index] || images[0];
    return {
      title: typeof step === 'string' ? step : step.title,
      description: typeof step === 'string' ? '' : (step.description || img?.description || ''),
      imageUrl: img?.imageUrl || guide.coverImageUrl,
    };
  });
}

export function searchClinicalGuides(user, query, options = {}) {
  const q = normalizeText(query).toLowerCase();
  if (!q) return listClinicalGuides(user, options);
  return listClinicalGuides(user, options).filter((guide) => {
    const haystack = [
      guide.title,
      guide.shortDescription,
      guide.slug,
      ...(guide.keywords || []),
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

const PROCEDURE_MATCH_RULES = [
  { pattern: /protocolo\s*total/i, slug: 'protocolo-total' },
  { pattern: /protocolo\s*superior/i, slug: 'protocolo-superior' },
  { pattern: /protocolo\s*inferior/i, slug: 'protocolo-inferior' },
  { pattern: /implante\s*unit[aá]rio|implante\s*dent[aá]rio/i, slug: 'implante-unitario' },
  { pattern: /overdenture/i, slug: 'overdenture' },
  { pattern: /pr[oó]tese\s*sobre\s*implante|coroa\s*sobre\s*implante/i, slug: 'protese-sobre-implante' },
  { pattern: /flexite/i, slug: 'flexite' },
  { pattern: /lente.*resina/i, slug: 'lente-contato-resina' },
  { pattern: /lente.*porcelana|faceta.*porcelana/i, slug: 'lente-contato-porcelana' },
  { pattern: /clareamento/i, slug: 'clareamento-dental' },
  { pattern: /restaura[cç][aã]o|obtura[cç][aã]o/i, slug: 'restauracao' },
  { pattern: /tratamento\s*de\s*canal|endodont/i, slug: 'tratamento-canal' },
  { pattern: /siso|terceiro\s*molar/i, slug: 'extracao-siso' },
  { pattern: /alinhador|invisalign/i, slug: 'alinhadores' },
  { pattern: /aparelho|ortodont|br[aá]quete/i, slug: 'aparelho-convencional' },
  { pattern: /profilaxia|limpeza/i, slug: 'limpeza-profilaxia' },
  { pattern: /raspagem|periodont/i, slug: 'raspagem' },
  { pattern: /gengivoplastia/i, slug: 'gengivoplastia' },
  { pattern: /ponte\s*fixa|ponte\s*dent[aá]ria/i, slug: 'ponte-fixa' },
  { pattern: /coroa\s*dent|coroa\s*cer[aâ]mica/i, slug: 'coroa-dentaria' },
  { pattern: /implante/i, slug: 'implante-unitario' },
];

export function matchGuidesForProcedures(user, procedureNames = []) {
  ensureClinicalGuidesSeeded();
  const names = (procedureNames || []).map((n) => String(n || '')).filter(Boolean);
  const matched = new Map();

  for (const name of names) {
    for (const rule of PROCEDURE_MATCH_RULES) {
      if (!rule.pattern.test(name)) continue;
      const guide = getClinicalGuideBySlug(rule.slug, user);
      if (guide) matched.set(guide.id, guide);
      break;
    }
  }

  return Array.from(matched.values());
}

export function duplicateClinicalGuide(guideId, user) {
  const source = getClinicalGuide(guideId, user);
  if (!source) throw new Error('Guia não encontrado.');
  const now = new Date().toISOString();
  const newId = createId('cguide');
  const tenantId = tenantIdFromUser(user) || clinicId();
  const title = `${source.title} (cópia)`;
  const slug = `${source.slug}-copia-${Date.now().toString(36)}`;

  return withDb((db) => {
    const copy = {
      ...source,
      id: newId,
      tenantId,
      title,
      slug,
      isSystemDefault: false,
      isCustom: true,
      visibility: VISIBILITY.ALL,
      createdBy: user?.id || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    db.clinicalGuides.push(copy);

    const sourceImages = (db.clinicalGuideImages || []).filter((img) => img.guideId === guideId);
    for (const img of sourceImages) {
      db.clinicalGuideImages.push({
        ...img,
        id: createId('cguideimg'),
        tenantId,
        guideId: newId,
        createdAt: now,
      });
    }
    return copy;
  });
}

export function createClinicalGuide(user, payload) {
  const title = normalizeText(payload.title);
  if (!title) throw new Error('Informe o nome do tratamento.');
  const now = new Date().toISOString();
  const tenantId = tenantIdFromUser(user) || clinicId();
  const guideId = createId('cguide');
  const slug = slugify(payload.slug || title) || `guia-${Date.now().toString(36)}`;

  const guide = {
    id: guideId,
    tenantId,
    title,
    slug,
    category: payload.category || 'dentistica_estetica',
    shortDescription: normalizeText(payload.shortDescription),
    patientDescription: normalizeText(payload.patientDescription),
    technicalDescription: normalizeText(payload.technicalDescription),
    indications: ensureArray(payload.indications),
    contraindications: ensureArray(payload.contraindications),
    treatmentSteps: ensureArray(payload.treatmentSteps),
    preCare: ensureArray(payload.preCare),
    postCare: ensureArray(payload.postCare),
    benefits: ensureArray(payload.benefits),
    risks: ensureArray(payload.risks),
    averageDuration: normalizeText(payload.averageDuration),
    faq: ensureArray(payload.faq),
    internalNotes: normalizeText(payload.internalNotes),
    coverImageUrl: payload.coverImageUrl || '',
    beforeAfter: payload.beforeAfter || null,
    videos: ensureArray(payload.videos),
    pdfUrl: payload.pdfUrl || '',
    isSystemDefault: false,
    isCustom: true,
    visibility: payload.visibility || VISIBILITY.ALL,
    active: payload.active !== false,
    keywords: ensureArray(payload.keywords).length ? ensureArray(payload.keywords) : [title.toLowerCase()],
    createdBy: user?.id || null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  withDb((db) => {
    if (!Array.isArray(db.clinicalGuides)) db.clinicalGuides = [];
    db.clinicalGuides.push(guide);
    return db;
  });

  return guide;
}

export function updateClinicalGuide(user, guideId, payload) {
  const existing = getClinicalGuide(guideId, user);
  if (!existing) throw new Error('Guia não encontrado.');
  if (existing.isSystemDefault && !canManageGuide({ isCustom: true }, user)) {
    throw new Error('Guias padrão do sistema não podem ser editados diretamente. Duplique para personalizar.');
  }
  if (!canManageGuide(existing, user) && !user?.isMaster && user?.role !== 'admin') {
    throw new Error('Sem permissão para editar este guia.');
  }

  const now = new Date().toISOString();
  return withDb((db) => {
    const index = (db.clinicalGuides || []).findIndex((g) => g.id === guideId);
    if (index < 0) throw new Error('Guia não encontrado.');
    db.clinicalGuides[index] = {
      ...db.clinicalGuides[index],
      ...payload,
      title: payload.title != null ? normalizeText(payload.title) : db.clinicalGuides[index].title,
      updatedAt: now,
    };
    return db.clinicalGuides[index];
  });
}

export function softDeleteClinicalGuide(user, guideId) {
  const existing = getClinicalGuide(guideId, user);
  if (!existing) throw new Error('Guia não encontrado.');
  if (existing.isSystemDefault) throw new Error('Guias padrão do sistema não podem ser excluídos.');
  if (!canManageGuide(existing, user)) throw new Error('Sem permissão para excluir este guia.');

  const now = new Date().toISOString();
  return withDb((db) => {
    const index = (db.clinicalGuides || []).findIndex((g) => g.id === guideId);
    if (index < 0) throw new Error('Guia não encontrado.');
    db.clinicalGuides[index] = {
      ...db.clinicalGuides[index],
      active: false,
      deletedAt: now,
      updatedAt: now,
    };
    return db.clinicalGuides[index];
  });
}

export function addClinicalGuideImage(user, guideId, {
  imageUrl, caption = '', description = '', imageType = 'gallery',
  visibleToPatient = true, sortOrder = null,
}) {
  const guide = getClinicalGuide(guideId, user);
  if (!guide) throw new Error('Guia não encontrado.');
  if (!imageUrl) throw new Error('Imagem inválida.');

  const now = new Date().toISOString();
  const tenantId = guide.tenantId || tenantIdFromUser(user) || clinicId();
  const db = loadDb();
  const existing = (db.clinicalGuideImages || []).filter((img) => img.guideId === guideId);
  const image = {
    id: createId('cguideimg'),
    tenantId,
    guideId,
    imageUrl,
    caption: normalizeText(caption),
    description: normalizeText(description),
    imageType,
    sortOrder: sortOrder ?? existing.length,
    visibleToPatient: visibleToPatient !== false,
    createdAt: now,
  };

  withDb((dbState) => {
    if (!Array.isArray(dbState.clinicalGuideImages)) dbState.clinicalGuideImages = [];
    dbState.clinicalGuideImages.push(image);
    const guideIndex = dbState.clinicalGuides.findIndex((g) => g.id === guideId);
    if (guideIndex >= 0 && !dbState.clinicalGuides[guideIndex].coverImageUrl) {
      dbState.clinicalGuides[guideIndex].coverImageUrl = imageUrl;
      dbState.clinicalGuides[guideIndex].updatedAt = now;
    }
    return dbState;
  });

  return image;
}

export function updateClinicalGuideImage(user, imageId, patch) {
  const now = new Date().toISOString();
  return withDb((db) => {
    const index = (db.clinicalGuideImages || []).findIndex((img) => img.id === imageId);
    if (index < 0) throw new Error('Imagem não encontrada.');
    const guide = getClinicalGuide(db.clinicalGuideImages[index].guideId, user);
    if (!guide) throw new Error('Sem permissão.');
    db.clinicalGuideImages[index] = {
      ...db.clinicalGuideImages[index],
      ...patch,
      updatedAt: now,
    };
    return db.clinicalGuideImages[index];
  });
}

export function removeClinicalGuideImage(user, imageId) {
  return withDb((db) => {
    const index = (db.clinicalGuideImages || []).findIndex((img) => img.id === imageId);
    if (index < 0) throw new Error('Imagem não encontrada.');
    const guideId = db.clinicalGuideImages[index].guideId;
    const guide = getClinicalGuide(guideId, user);
    if (!guide || (!canManageGuide(guide, user) && !guide.isSystemDefault)) {
      if (!canManageGuide(guide, user)) throw new Error('Sem permissão.');
    }
    db.clinicalGuideImages.splice(index, 1);
    return true;
  });
}

export async function uploadClinicalGuideImageFile(user, guideId, file, options = {}) {
  if (!file) throw new Error('Arquivo inválido.');
  const maxBytes = 5 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error('Imagem deve ter no máximo 5 MB.');

  const dataUrl = await readFileAsDataUrl(file);
  const tenantId = tenantIdFromUser(user) || clinicId();
  const imageUrl = await uploadClinicalGuideImageToStorage({
    tenantId,
    guideId,
    file,
    dataUrlFallback: dataUrl,
  });

  const imageType = options.imageType || 'gallery';
  const image = addClinicalGuideImage(user, guideId, {
    imageUrl,
    caption: options.caption || file.name?.replace(/\.[^.]+$/, '') || '',
    description: options.description || '',
    imageType,
    sortOrder: options.sortOrder ?? null,
  });

  if (options.setAsCover || imageType === 'cover') {
    updateClinicalGuide(user, guideId, { coverImageUrl: imageUrl });
  }

  if (imageType === 'before' || imageType === 'after') {
    const guide = getClinicalGuide(guideId, user);
    const key = imageType === 'before' ? 'before' : 'after';
    updateClinicalGuide(user, guideId, {
      beforeAfter: { ...(guide.beforeAfter || {}), [key]: imageUrl },
    });
  }

  return image;
}

export async function uploadClinicalGuidePdfFile(user, guideId, file) {
  if (!file) throw new Error('Arquivo inválido.');
  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Envie um arquivo PDF.');
  }
  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) throw new Error('PDF deve ter no máximo 10 MB.');

  const dataUrl = await readFileAsDataUrl(file);
  const tenantId = tenantIdFromUser(user) || clinicId();
  const pdfUrl = await uploadClinicalGuideImageToStorage({
    tenantId,
    guideId: `${guideId}/pdf`,
    file,
    dataUrlFallback: dataUrl,
  });

  updateClinicalGuide(user, guideId, { pdfUrl });
  return pdfUrl;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
  });
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    return value.split('\n').map((line) => line.trim()).filter(Boolean);
  }
  return [];
}

export function canUserManageClinicalGuides(user) {
  if (!user) return false;
  return user.isMaster || ['admin', 'master', 'gerente'].includes(String(user.role || '').toLowerCase());
}

export { VISIBILITY, canManageGuide, canViewGuide };
