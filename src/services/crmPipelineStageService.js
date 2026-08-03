import { withDb, loadDb } from '../db/index.js';
import { createId } from './helpers.js';
import { logAction } from './logService.js';
import { resolveTenantIdForWrite } from './tenantWriteGuard.js';
import { readGetPipelineStage, readListPipelineStages } from './crmReadAdapter.js';
import {
  scheduleCrmDualWriteCreatePipelineStage,
  scheduleCrmDualWriteDeletePipelineStage,
  scheduleCrmDualWriteUpdatePipelineStage,
} from './crmWriteAdapter.js';

// ─── Tipos de fase ───────────────────────────────────────────────────────────
export const STAGE_TYPE = {
  NORMAL: 'normal',
  CONVERSION: 'conversion',
  LOST: 'lost',
};

export const STAGE_TYPE_LABELS = {
  [STAGE_TYPE.NORMAL]: 'Normal',
  [STAGE_TYPE.CONVERSION]: 'Conversão',
  [STAGE_TYPE.LOST]: 'Perda',
};

/** Paleta sugerida para o seletor de cor das fases. */
export const STAGE_COLOR_PRESETS = [
  '#94a3b8', '#60a5fa', '#2563eb', '#a78bfa', '#6A00FF', '#EC4899',
  '#f59e0b', '#fbbf24', '#f97316', '#34d399', '#10b981', '#ef4444',
];

const VALID_STAGE_TYPES = Object.values(STAGE_TYPE);

const DEFAULT_STAGE_BLUEPRINT = [
  { key: 'novo_lead', label: 'Novo lead', color: '#60a5fa', stageType: STAGE_TYPE.NORMAL },
  { key: 'contato_realizado', label: 'Primeiro contato', color: '#2563eb', stageType: STAGE_TYPE.NORMAL },
  { key: 'em_negociacao', label: 'Em negociação', color: '#a78bfa', stageType: STAGE_TYPE.NORMAL },
  { key: 'avaliacao_agendada', label: 'Avaliação agendada', color: '#6A00FF', stageType: STAGE_TYPE.NORMAL },
  { key: 'avaliacao_realizada', label: 'Compareceu', color: '#EC4899', stageType: STAGE_TYPE.NORMAL },
  { key: 'orcamento_apresentado', label: 'Fechamento', color: '#f59e0b', stageType: STAGE_TYPE.NORMAL },
  { key: 'aprovado', label: 'Convertido', color: '#10b981', stageType: STAGE_TYPE.CONVERSION },
  { key: 'perdido', label: 'Perdido', color: '#ef4444', stageType: STAGE_TYPE.LOST },
];

// ─── Helpers internos ────────────────────────────────────────────────────────

const slugify = (label) =>
  String(label || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'fase';

const normalizeStage = (stage) => ({
  ...stage,
  isActive: stage.isActive !== false,
  stageType: VALID_STAGE_TYPES.includes(stage.stageType) ? stage.stageType : STAGE_TYPE.NORMAL,
  tenant_id: stage.tenant_id ?? null,
});

/** Fase pertence ao tenant (legados com tenant_id null contam como "do tenant" até a adoção). */
const isOwnedByTenant = (stage, tenantId) => stage.tenant_id === tenantId || stage.tenant_id == null;

const sortByOrder = (stages) => [...stages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const leadBelongsToTenant = (lead, tenantId) => lead.tenant_id === tenantId || !lead.tenant_id;

const validateStageSet = (stages) => {
  if (!stages.length) return 'O pipeline deve ter pelo menos uma fase.';
  if (stages.some((s) => !String(s.label || '').trim())) return 'Toda fase precisa de um nome.';
  const active = stages.filter((s) => s.isActive !== false);
  if (!active.length) return 'Pelo menos uma fase deve estar ativa.';
  if (!active.some((s) => s.stageType === STAGE_TYPE.CONVERSION)) {
    return 'O pipeline precisa de uma fase de conversão ativa.';
  }
  if (!active.some((s) => s.stageType === STAGE_TYPE.LOST)) {
    return 'O pipeline precisa de uma fase de perda ativa.';
  }
  return null;
};

const buildUniqueKey = (label, usedKeys) => {
  const base = slugify(label);
  let key = base;
  let suffix = 2;
  while (usedKeys.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  usedKeys.add(key);
  return key;
};

// ─── Leitura ────────────────────────────────────────────────────────────────

/**
 * Lista as fases do tenant (ordenadas). Inclui inativas apenas se solicitado.
 * Fallback: fases legadas sem tenant_id (compatibilidade pré-migração 48).
 */
export const listPipelineStagesForTenant = (tenantId, { includeInactive = false } = {}) => {
  const fromRepo = readListPipelineStages(tenantId, { includeInactive });
  if (fromRepo !== null) {
    return sortByOrder(fromRepo.map(normalizeStage));
  }

  const db = loadDb();
  const all = (db.crmPipelineStages || []).map(normalizeStage);
  let stages = all.filter((s) => s.tenant_id === tenantId);
  if (!stages.length) stages = all.filter((s) => s.tenant_id == null);
  if (!includeInactive) stages = stages.filter((s) => s.isActive);
  return sortByOrder(stages);
};

/**
 * Obtém fase do pipeline por id ou key (Wave A read cutover).
 */
export const getPipelineStageForTenant = (tenantId, ref) => {
  const needle = String(ref || '').trim();
  if (!needle) return null;
  const fromRepo = readGetPipelineStage(tenantId, needle);
  if (fromRepo !== null) return fromRepo ? normalizeStage(fromRepo) : null;
  const stages = listPipelineStagesForTenant(tenantId, { includeInactive: true });
  return stages.find((stage) => stage.id === needle || stage.key === needle) || null;
};

/**
 * Conta leads por stageKey (apenas leads do tenant). Usado para regras de exclusão/aviso.
 */
export const countLeadsByStageKey = (tenantId) => {
  const db = loadDb();
  const counts = {};
  (db.crmLeads || [])
    .filter((l) => leadBelongsToTenant(l, tenantId))
    .forEach((l) => {
      counts[l.stageKey] = (counts[l.stageKey] || 0) + 1;
    });
  return counts;
};

export const findConversionStage = (stages) =>
  stages.find((s) => s.stageType === STAGE_TYPE.CONVERSION && s.isActive !== false) || null;

export const findLostStage = (stages) =>
  stages.find((s) => s.stageType === STAGE_TYPE.LOST && s.isActive !== false) || null;

// ─── Escrita ────────────────────────────────────────────────────────────────

/**
 * Garante que o tenant tenha fases próprias:
 * 1. Se já possui fases com tenant_id → retorna.
 * 2. Se existem fases legadas (tenant_id null) → adota (preserva keys dos leads existentes).
 * 3. Se não há nenhuma fase → cria as fases padrão.
 */
export const ensurePipelineStagesForTenant = (user) => {
  const tenantId = resolveTenantIdForWrite(user);
  const db = loadDb();
  const existing = (db.crmPipelineStages || []).filter((s) => s.tenant_id === tenantId);
  if (existing.length > 0) return sortByOrder(existing.map(normalizeStage));

  return withDb((draft) => {
    if (!Array.isArray(draft.crmPipelineStages)) draft.crmPipelineStages = [];
    const already = draft.crmPipelineStages.filter((s) => s.tenant_id === tenantId);
    if (already.length > 0) return sortByOrder(already.map(normalizeStage));

    const now = new Date().toISOString();
    const legacy = draft.crmPipelineStages.filter((s) => s.tenant_id == null);
    if (legacy.length > 0) {
      draft.crmPipelineStages = draft.crmPipelineStages.map((s) =>
        s.tenant_id == null ? { ...normalizeStage(s), tenant_id: tenantId, updatedAt: now } : s
      );
    } else {
      const seeded = DEFAULT_STAGE_BLUEPRINT.map((bp, index) => ({
        id: createId('crmstage'),
        key: bp.key,
        label: bp.label,
        color: bp.color,
        order: index + 1,
        isActive: true,
        stageType: bp.stageType,
        tenant_id: tenantId,
        createdAt: now,
        updatedAt: now,
      }));
      draft.crmPipelineStages.push(...seeded);
    }
    logAction('crm:pipeline_stages_seeded', { tenantId, userId: user?.id });
    return sortByOrder(draft.crmPipelineStages.filter((s) => s.tenant_id === tenantId));
  });
};

/**
 * Salva o conjunto completo de fases do tenant (criar/editar/reordenar/ativar/excluir).
 * Regras: nomes obrigatórios, ≥1 fase ativa, ≥1 conversão ativa, ≥1 perda ativa,
 * exclusão somente de fase sem leads. A ordem final segue a ordem do array recebido.
 */
export const savePipelineStagesForTenant = (user, stagesInput) => {
  const tenantId = resolveTenantIdForWrite(user);
  const validationError = validateStageSet(stagesInput);
  if (validationError) throw new Error(validationError);

  return withDb((draft) => {
    if (!Array.isArray(draft.crmPipelineStages)) draft.crmPipelineStages = [];
    const now = new Date().toISOString();
    const previous = draft.crmPipelineStages.filter((s) => isOwnedByTenant(s, tenantId));
    const previousById = new Map(previous.map((s) => [s.id, s]));
    const keptIds = new Set(stagesInput.filter((s) => s.id).map((s) => s.id));

    const leadCounts = {};
    (draft.crmLeads || [])
      .filter((l) => leadBelongsToTenant(l, tenantId))
      .forEach((l) => {
        leadCounts[l.stageKey] = (leadCounts[l.stageKey] || 0) + 1;
      });

    const removed = previous.filter((s) => !keptIds.has(s.id));
    const blocked = removed.find((s) => (leadCounts[s.key] || 0) > 0);
    if (blocked) {
      throw new Error(`A fase “${blocked.label}” possui leads e não pode ser excluída.`);
    }

    const usedKeys = new Set(
      stagesInput.filter((s) => s.id && previousById.has(s.id)).map((s) => previousById.get(s.id).key)
    );

    const nextStages = stagesInput.map((input, index) => {
      const prev = input.id ? previousById.get(input.id) : null;
      const key = prev?.key || buildUniqueKey(input.label, usedKeys);
      return {
        id: prev?.id || createId('crmstage'),
        key,
        label: String(input.label || '').trim(),
        color: input.color || '#94a3b8',
        order: index + 1,
        isActive: input.isActive !== false,
        stageType: VALID_STAGE_TYPES.includes(input.stageType) ? input.stageType : STAGE_TYPE.NORMAL,
        tenant_id: tenantId,
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      };
    });

    draft.crmPipelineStages = [
      ...draft.crmPipelineStages.filter((s) => !isOwnedByTenant(s, tenantId)),
      ...nextStages,
    ];
    logAction('crm:pipeline_stages_saved', {
      tenantId,
      userId: user?.id,
      total: nextStages.length,
      removed: removed.map((s) => s.key),
    });

    nextStages.forEach((stage) => {
      if (previousById.has(stage.id)) {
        scheduleCrmDualWriteUpdatePipelineStage(user, stage);
      } else {
        scheduleCrmDualWriteCreatePipelineStage(user, stage);
      }
    });
    removed.forEach((stage) => {
      scheduleCrmDualWriteDeletePipelineStage(user, stage.id, tenantId);
    });

    return sortByOrder(nextStages);
  });
};

/**
 * Cria uma fase individual no pipeline (Wave A write cutover).
 */
export const createPipelineStage = (user, data = {}) => {
  const tenantId = resolveTenantIdForWrite(user);
  const stage = withDb((draft) => {
    if (!Array.isArray(draft.crmPipelineStages)) draft.crmPipelineStages = [];
    const owned = draft.crmPipelineStages.filter((s) => isOwnedByTenant(s, tenantId));
    const now = new Date().toISOString();
    const usedKeys = new Set(owned.map((s) => s.key));
    const key = data.key || buildUniqueKey(data.label || 'Nova fase', usedKeys);
    const record = {
      id: createId('crmstage'),
      key,
      label: String(data.label || '').trim(),
      color: data.color || '#94a3b8',
      order: owned.length + 1,
      isActive: data.isActive !== false,
      stageType: VALID_STAGE_TYPES.includes(data.stageType) ? data.stageType : STAGE_TYPE.NORMAL,
      tenant_id: tenantId,
      createdAt: now,
      updatedAt: now,
    };
    const next = sortByOrder([...owned.map(normalizeStage), normalizeStage(record)]);
    const validationError = validateStageSet(next);
    if (validationError) throw new Error(validationError);
    draft.crmPipelineStages = [
      ...draft.crmPipelineStages.filter((s) => !isOwnedByTenant(s, tenantId)),
      ...next,
    ];
    logAction('crm:pipeline_stage_created', { tenantId, stageId: record.id, userId: user?.id });
    return normalizeStage(record);
  });
  scheduleCrmDualWriteCreatePipelineStage(user, stage);
  return stage;
};

/**
 * Atualiza uma fase individual (Wave A write cutover).
 */
export const updatePipelineStage = (user, stageId, data = {}) => {
  const tenantId = resolveTenantIdForWrite(user);
  const stage = withDb((draft) => {
    const owned = (draft.crmPipelineStages || []).filter((s) => isOwnedByTenant(s, tenantId));
    const target = owned.find((s) => s.id === stageId);
    if (!target) throw new Error('Fase não encontrada.');
    const now = new Date().toISOString();
    const updated = normalizeStage({
      ...target,
      ...data,
      label: data.label != null ? String(data.label).trim() : target.label,
      updatedAt: now,
    });
    const next = owned.map((s) => (s.id === stageId ? updated : normalizeStage(s)));
    const validationError = validateStageSet(next);
    if (validationError) throw new Error(validationError);
    draft.crmPipelineStages = [
      ...draft.crmPipelineStages.filter((s) => !isOwnedByTenant(s, tenantId)),
      ...next,
    ];
    logAction('crm:pipeline_stage_updated', { tenantId, stageId, userId: user?.id });
    return updated;
  });
  scheduleCrmDualWriteUpdatePipelineStage(user, stage, data);
  return stage;
};

/**
 * Ativa/desativa uma fase. Mantém as regras mínimas do pipeline.
 */
export const setPipelineStageActive = (user, stageId, isActive) => {
  const tenantId = resolveTenantIdForWrite(user);
  return withDb((draft) => {
    const stages = (draft.crmPipelineStages || []).filter((s) => isOwnedByTenant(s, tenantId));
    const target = stages.find((s) => s.id === stageId);
    if (!target) throw new Error('Fase não encontrada.');
    const next = stages.map((s) =>
      s.id === stageId ? { ...normalizeStage(s), isActive: Boolean(isActive) } : normalizeStage(s)
    );
    const validationError = validateStageSet(next);
    if (validationError) throw new Error(validationError);
    target.isActive = Boolean(isActive);
    target.updatedAt = new Date().toISOString();
    logAction('crm:pipeline_stage_toggled', { tenantId, stageId, isActive, userId: user?.id });
    return normalizeStage(target);
  });
};

/**
 * Exclui uma fase vazia (sem leads). Mantém as regras mínimas do pipeline.
 */
export const deletePipelineStage = (user, stageId) => {
  const tenantId = resolveTenantIdForWrite(user);
  const result = withDb((draft) => {
    const owned = (draft.crmPipelineStages || []).filter((s) => isOwnedByTenant(s, tenantId));
    const target = owned.find((s) => s.id === stageId);
    if (!target) throw new Error('Fase não encontrada.');

    const hasLeads = (draft.crmLeads || []).some(
      (l) => leadBelongsToTenant(l, tenantId) && l.stageKey === target.key
    );
    if (hasLeads) throw new Error(`A fase “${target.label}” possui leads e não pode ser excluída.`);

    const remaining = owned.filter((s) => s.id !== stageId).map(normalizeStage);
    const validationError = validateStageSet(remaining);
    if (validationError) throw new Error(validationError);

    draft.crmPipelineStages = (draft.crmPipelineStages || []).filter((s) => s.id !== stageId);
    logAction('crm:pipeline_stage_deleted', { tenantId, stageId, key: target.key, userId: user?.id });
    return true;
  });
  scheduleCrmDualWriteDeletePipelineStage(user, stageId, tenantId);
  return result;
};
