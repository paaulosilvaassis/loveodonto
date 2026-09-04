/**
 * CLOUD.3 — Escrita core de pacientes via Admin API.
 * POST /internal/app/patients
 * PUT /internal/app/patients/:legacyId
 * DELETE /internal/app/patients/:legacyId (soft-delete)
 *
 * Tenant exclusivamente via Core Tenant — nunca via body/query do frontend.
 */

import { mapPatientListRow, PATIENTS_LIST_SELECT, FORBIDDEN_TENANT_IDS } from './patientsApiList.js';
import { assertPatientsPermission } from './patientsPermissionGuard.js';

export class PatientsWriteValidationError extends Error {
  constructor(message, code = 'INVALID_BODY') {
    super(message);
    this.name = 'PatientsWriteValidationError';
    this.code = code;
  }
}

export class PatientsWriteForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'PatientsWriteForbiddenError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertNoTenantIdInBody(body = {}) {
  const tenantFromBody = normalizeText(body?.tenant_id ?? body?.tenantId);
  if (tenantFromBody) {
    throw new PatientsWriteValidationError(
      'tenant_id não é aceito no body. O tenant é resolvido pelo contexto autenticado.',
      'TENANT_BODY_FORBIDDEN',
    );
  }
}

function assertTenantAllowed(tenantId) {
  const tid = normalizeText(tenantId);
  if (!tid || FORBIDDEN_TENANT_IDS.has(tid.toLowerCase())) {
    throw new PatientsWriteForbiddenError('tenant_id inválido.', 'TENANT_FORBIDDEN');
  }
  return tid;
}

function isMissingPatientsTableError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('relation')
  );
}

function mapWriteBodyToInsertRow(body = {}, tenantId) {
  const legacyId = normalizeText(body.legacy_id ?? body.legacyId ?? body.id);
  if (!legacyId) {
    throw new PatientsWriteValidationError('legacy_id é obrigatório.', 'LEGACY_ID_REQUIRED');
  }
  const fullName = normalizeText(body.full_name ?? body.fullName);
  if (!fullName) {
    throw new PatientsWriteValidationError('full_name é obrigatório.', 'FULL_NAME_REQUIRED');
  }
  const cpfRaw = normalizeText(body.cpf).replace(/\D/g, '');
  const cpf = cpfRaw.length === 11 ? cpfRaw : null;

  return {
    tenant_id: tenantId,
    legacy_id: legacyId,
    guid: normalizeText(body.guid) || undefined,
    full_name: fullName,
    nickname: normalizeText(body.nickname) || '',
    social_name: normalizeText(body.social_name ?? body.socialName) || '',
    sex: normalizeText(body.sex) || '',
    birth_date: normalizeText(body.birth_date ?? body.birthDate) || null,
    cpf,
    photo_url: normalizeText(body.photo_url ?? body.photoUrl) || null,
    status: normalizeText(body.status) || 'active',
    blocked: Boolean(body.blocked),
    block_reason: normalizeText(body.block_reason ?? body.blockReason) || '',
    tags: Array.isArray(body.tags) ? body.tags : [],
    lead_source: normalizeText(body.lead_source ?? body.leadSource) || '',
    has_financial_responsible: Boolean(
      body.has_financial_responsible ?? body.hasFinancialResponsible,
    ),
    dependent_full_name: normalizeText(
      body.dependent_full_name ?? body.dependentFullName,
    ) || '',
    has_pending_data: Boolean(body.has_pending_data ?? body.hasPendingData),
    pending_fields: Array.isArray(body.pending_fields ?? body.pendingFields)
      ? (body.pending_fields ?? body.pendingFields)
      : [],
    pending_critical_fields: Array.isArray(
      body.pending_critical_fields ?? body.pendingCriticalFields,
    )
      ? (body.pending_critical_fields ?? body.pendingCriticalFields)
      : [],
  };
}

function mapWriteBodyToUpdateRow(body = {}) {
  const patch = {};
  if (body.full_name !== undefined || body.fullName !== undefined) {
    patch.full_name = normalizeText(body.full_name ?? body.fullName);
  }
  if (body.nickname !== undefined) patch.nickname = normalizeText(body.nickname);
  if (body.social_name !== undefined || body.socialName !== undefined) {
    patch.social_name = normalizeText(body.social_name ?? body.socialName);
  }
  if (body.sex !== undefined) patch.sex = normalizeText(body.sex);
  if (body.birth_date !== undefined || body.birthDate !== undefined) {
    patch.birth_date = normalizeText(body.birth_date ?? body.birthDate) || null;
  }
  if (body.cpf !== undefined) {
    const digits = normalizeText(body.cpf).replace(/\D/g, '');
    patch.cpf = digits.length === 11 ? digits : null;
  }
  if (body.photo_url !== undefined || body.photoUrl !== undefined) {
    patch.photo_url = normalizeText(body.photo_url ?? body.photoUrl) || null;
  }
  if (body.status !== undefined) patch.status = normalizeText(body.status) || 'active';
  if (body.blocked !== undefined) patch.blocked = Boolean(body.blocked);
  if (body.block_reason !== undefined || body.blockReason !== undefined) {
    patch.block_reason = normalizeText(body.block_reason ?? body.blockReason);
  }
  if (body.block_at !== undefined || body.blockAt !== undefined) {
    patch.block_at = body.block_at ?? body.blockAt ?? null;
  }
  if (body.lead_source !== undefined || body.leadSource !== undefined) {
    patch.lead_source = normalizeText(body.lead_source ?? body.leadSource);
  }
  if (body.has_financial_responsible !== undefined || body.hasFinancialResponsible !== undefined) {
    patch.has_financial_responsible = Boolean(
      body.has_financial_responsible ?? body.hasFinancialResponsible,
    );
  }
  if (body.dependent_full_name !== undefined || body.dependentFullName !== undefined) {
    patch.dependent_full_name = normalizeText(
      body.dependent_full_name ?? body.dependentFullName,
    );
  }
  if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.has_pending_data !== undefined || body.hasPendingData !== undefined) {
    patch.has_pending_data = Boolean(body.has_pending_data ?? body.hasPendingData);
  }
  if (body.pending_fields !== undefined || body.pendingFields !== undefined) {
    patch.pending_fields = Array.isArray(body.pending_fields ?? body.pendingFields)
      ? (body.pending_fields ?? body.pendingFields)
      : [];
  }
  if (body.pending_critical_fields !== undefined || body.pendingCriticalFields !== undefined) {
    patch.pending_critical_fields = Array.isArray(
      body.pending_critical_fields ?? body.pendingCriticalFields,
    )
      ? (body.pending_critical_fields ?? body.pendingCriticalFields)
      : [];
  }
  // Nunca reescreve legacy_id
  patch.updated_at = new Date().toISOString();
  return patch;
}

async function findPatientByLegacyId(supabase, tenantId, legacyId) {
  const needle = normalizeText(legacyId);
  if (!needle) return null;
  const { data, error } = await supabase
    .from('patients')
    .select(PATIENTS_LIST_SELECT)
    .eq('tenant_id', tenantId)
    .eq('legacy_id', needle)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    if (isMissingPatientsTableError(error)) {
      throw Object.assign(new Error('Tabela patients indisponível.'), { code: 'PATIENTS_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

export async function createPatientForTenant(supabase, tenantId, body) {
  const tid = assertTenantAllowed(tenantId);
  const row = mapWriteBodyToInsertRow(body, tid);
  const existing = await findPatientByLegacyId(supabase, tid, row.legacy_id);
  if (existing?.id) {
    const { data, error } = await supabase
      .from('patients')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('tenant_id', tid)
      .select(PATIENTS_LIST_SELECT)
      .single();
    if (error) throw error;
    return mapPatientListRow(data);
  }

  const { data, error } = await supabase
    .from('patients')
    .insert(row)
    .select(PATIENTS_LIST_SELECT)
    .single();
  if (error) {
    if (isMissingPatientsTableError(error)) {
      throw Object.assign(new Error('Tabela patients indisponível.'), { code: 'PATIENTS_TABLE_MISSING' });
    }
    throw error;
  }
  return mapPatientListRow(data);
}

export async function updatePatientForTenant(supabase, tenantId, legacyId, body) {
  const tid = assertTenantAllowed(tenantId);
  const existing = await findPatientByLegacyId(supabase, tid, legacyId);
  if (!existing) {
    throw new PatientsWriteValidationError('Paciente não encontrado.', 'PATIENT_NOT_FOUND');
  }
  const patch = mapWriteBodyToUpdateRow(body);
  const { data, error } = await supabase
    .from('patients')
    .update(patch)
    .eq('id', existing.id)
    .eq('tenant_id', tid)
    .select(PATIENTS_LIST_SELECT)
    .single();
  if (error) {
    if (isMissingPatientsTableError(error)) {
      throw Object.assign(new Error('Tabela patients indisponível.'), { code: 'PATIENTS_TABLE_MISSING' });
    }
    throw error;
  }
  return mapPatientListRow(data);
}

export async function softDeletePatientForTenant(supabase, tenantId, legacyId) {
  const tid = assertTenantAllowed(tenantId);
  const existing = await findPatientByLegacyId(supabase, tid, legacyId);
  if (!existing) {
    throw new PatientsWriteValidationError('Paciente não encontrado.', 'PATIENT_NOT_FOUND');
  }
  const { error } = await supabase
    .from('patients')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('tenant_id', tid);
  if (error) {
    if (isMissingPatientsTableError(error)) {
      throw Object.assign(new Error('Tabela patients indisponível.'), { code: 'PATIENTS_TABLE_MISSING' });
    }
    throw error;
  }
  return true;
}

function resolveTenantId(req) {
  return req.tenantContext?.tenantId || null;
}

function mapWriteError(res, err, logTag, fallbackMessage) {
  if (err instanceof PatientsWriteValidationError) {
    const status = err.code === 'PATIENT_NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ ok: false, error: err.message, code: err.code });
  }
  if (err instanceof PatientsWriteForbiddenError || err?.code === 'PATIENTS_PERMISSION_DENIED') {
    return res.status(403).json({ ok: false, error: err.message, code: err.code });
  }
  if (err?.code === 'PATIENTS_TABLE_MISSING') {
    return res.status(503).json({ ok: false, error: err.message, code: err.code });
  }
  console.error(logTag, err);
  return res.status(500).json({ ok: false, error: fallbackMessage });
}

export function createPatientCreateHandler(deps) {
  const { supabase } = deps;
  return async function patientCreateHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdInBody(req.body || {});
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'Contexto de tenant ausente.' });
      }
      await assertPatientsPermission(supabase, {
        tenantId,
        userId: req.appAuthUser.id,
        permission: 'patients:write',
      });

      const row = await createPatientForTenant(supabase, tenantId, req.body || {});
      return res.status(201).json({ ok: true, data: row, meta: { tenant_id: tenantId } });
    } catch (err) {
      return mapWriteError(res, err, '[PATIENTS_API_CREATE]', 'Falha ao criar paciente.');
    }
  };
}

export function createPatientUpdateHandler(deps) {
  const { supabase } = deps;
  return async function patientUpdateHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdInBody(req.body || {});
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'Contexto de tenant ausente.' });
      }
      const legacyId = normalizeText(req.params?.legacyId);
      if (!legacyId) {
        return res.status(400).json({ ok: false, error: 'legacyId ausente.' });
      }
      await assertPatientsPermission(supabase, {
        tenantId,
        userId: req.appAuthUser.id,
        permission: 'patients:write',
      });

      const row = await updatePatientForTenant(supabase, tenantId, legacyId, req.body || {});
      return res.status(200).json({ ok: true, data: row, meta: { tenant_id: tenantId } });
    } catch (err) {
      return mapWriteError(res, err, '[PATIENTS_API_UPDATE]', 'Falha ao atualizar paciente.');
    }
  };
}

export function createPatientSoftDeleteHandler(deps) {
  const { supabase } = deps;
  return async function patientSoftDeleteHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'Contexto de tenant ausente.' });
      }
      const legacyId = normalizeText(req.params?.legacyId);
      if (!legacyId) {
        return res.status(400).json({ ok: false, error: 'legacyId ausente.' });
      }
      await assertPatientsPermission(supabase, {
        tenantId,
        userId: req.appAuthUser.id,
        permission: 'patients:write',
      });

      await softDeletePatientForTenant(supabase, tenantId, legacyId);
      return res.status(200).json({ ok: true, data: { soft_deleted: true }, meta: { tenant_id: tenantId } });
    } catch (err) {
      return mapWriteError(res, err, '[PATIENTS_API_DELETE]', 'Falha ao excluir paciente.');
    }
  };
}
