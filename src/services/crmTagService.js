import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';

const DEFAULT_COLOR = '#6366f1';

function getClinicId() {
  const db = loadDb();
  return db.clinicProfile?.id || 'clinic-1';
}

/**
 * Lista todas as tags da clínica, opcionalmente por categoria.
 */
export function listTags(filters = {}) {
  const db = loadDb();
  const clinicId = getClinicId();
  let list = (db.crmTags || []).filter((t) => t.clinicId === clinicId);
  if (filters.category) list = list.filter((t) => t.category === filters.category);
  return list.sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''));
}

/**
 * Busca tag por nome + categoria (normalizado). Não duplica: mesmo nome + categoria = mesma tag.
 */
export function findTagByNameAndCategory(clinicId, name, category) {
  const db = loadDb();
  const n = (name || '').trim().toLowerCase();
  const c = (category || '').trim();
  return (db.crmTags || []).find(
    (t) => t.clinicId === clinicId && (t.name || '').trim().toLowerCase() === n && (t.category || '').trim() === c
  ) || null;
}

/**
 * Cria tag. Não duplica: se já existir nome+category na clínica, retorna a existente.
 */
export function createTag(data) {
  return withDb((db) => {
    if (!db.crmTags) db.crmTags = [];
    const clinicId = getClinicId();
    const name = (data.name || '').trim();
    const category = (data.category || '').trim();
    if (!name) throw new Error('Nome da tag é obrigatório.');

    const existing = findTagByNameAndCategory(clinicId, name, category);
    if (existing) return existing;

    const now = new Date().toISOString();
    const tag = {
      id: createId('crtag'),
      clinicId,
      name,
      category: category || 'Outros',
      color: (data.color || DEFAULT_COLOR).trim(),
      createdAt: now,
    };
    db.crmTags.push(tag);
    return tag;
  });
}

/**
 * Lista tagIds vinculados ao lead (lead_tags).
 */
export function listLeadTagIds(leadId) {
  const db = loadDb();
  return (db.leadTags || []).filter((lt) => lt.leadId === leadId).map((lt) => lt.tagId);
}

/**
 * Lista tags (objetos completos) vinculadas ao lead.
 */
export function listTagsByLead(leadId) {
  const db = loadDb();
  const tagIds = listLeadTagIds(leadId);
  const tags = (db.crmTags || []).filter((t) => tagIds.includes(t.id));
  return tags;
}

/**
 * Adiciona tag ao lead. Não duplica vínculo.
 */
export function addTagToLead(leadId, tagId) {
  return withDb((db) => {
    if (!db.leadTags) db.leadTags = [];
    const exists = db.leadTags.some((lt) => lt.leadId === leadId && lt.tagId === tagId);
    if (exists) return;

    const tag = (db.crmTags || []).find((t) => t.id === tagId);
    if (!tag) throw new Error('Tag não encontrada.');

    const now = new Date().toISOString();
    db.leadTags.push({
      id: createId('crlt'),
      leadId,
      tagId,
      createdAt: now,
    });

    syncLeadTagsArray(db, leadId);
  });
}

/**
 * Remove tag do lead.
 */
export function removeTagFromLead(leadId, tagId) {
  return withDb((db) => {
    if (!db.leadTags) return;
    const index = db.leadTags.findIndex((lt) => lt.leadId === leadId && lt.tagId === tagId);
    if (index >= 0) db.leadTags.splice(index, 1);
    syncLeadTagsArray(db, leadId);
  });
}

/**
 * Mantém lead.tags (array de nomes) em sincronia com leadTags para compatibilidade com Pipeline/Lista.
 */
function syncLeadTagsArray(db, leadId) {
  const lead = (db.crmLeads || []).find((l) => l.id === leadId);
  if (!lead) return;
  const tagIds = (db.leadTags || []).filter((lt) => lt.leadId === leadId).map((lt) => lt.tagId);
  const names = (db.crmTags || [])
    .filter((t) => tagIds.includes(t.id))
    .map((t) => t.name)
    .filter(Boolean);
  const idx = db.crmLeads.findIndex((l) => l.id === leadId);
  if (idx >= 0) db.crmLeads[idx] = { ...db.crmLeads[idx], tags: names };
}

/**
 * Enriquece lead com tagList (array de { id, name, category, color }) para exibição.
 */
export function enrichLeadWithTags(lead) {
  if (!lead) return lead;
  const tagList = listTagsByLead(lead.id);
  return { ...lead, tagList };
}

/**
 * Lista categorias únicas (para filtro na UI).
 */
export function listTagCategories() {
  const tags = listTags();
  const set = new Set(tags.map((t) => t.category).filter(Boolean));
  return Array.from(set).sort();
}
