/**
 * Phase 5.9 — Escrita core de agendamentos via Admin API.
 * POST /internal/app/appointments
 * PUT /internal/app/appointments/:id
 * PATCH /internal/app/appointments/:id/cancel
 *
 * Tenant exclusivamente via Core Tenant — nunca via body/query do frontend.
 */

import { mapAppointmentListRow } from './appointmentsApiList.js';

export const APPOINTMENT_WRITE_SELECT = [
  'id',
  'tenant_id',
  'legacy_id',
  'patient_id',
  'lead_id',
  'professional_id',
  'room_id',
  'date',
  'start_time',
  'end_time',
  'duration_minutes',
  'slot_capacity',
  'status',
  'procedure_name',
  'channel',
  'notes',
  'insurance',
  'is_return',
  'cancel_reason',
  'check_in_at',
  'finished_at',
  'created_at',
  'updated_at',
].join(', ');

export class AppointmentsWriteValidationError extends Error {
  constructor(message, code = 'INVALID_BODY') {
    super(message);
    this.name = 'AppointmentsWriteValidationError';
    this.code = code;
  }
}

export class AppointmentsWriteForbiddenError extends Error {
  constructor(message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'AppointmentsWriteForbiddenError';
    this.code = code;
  }
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

export function assertNoTenantIdInBody(body = {}) {
  const tenantFromBody = normalizeText(body?.tenant_id ?? body?.tenantId);
  if (tenantFromBody) {
    throw new AppointmentsWriteValidationError(
      'tenant_id não é aceito no body. O tenant é resolvido pelo contexto autenticado.',
      'TENANT_BODY_FORBIDDEN',
    );
  }
}

function isMissingAppointmentsTableError(error) {
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
    throw new AppointmentsWriteValidationError('legacy_id é obrigatório.', 'LEGACY_ID_REQUIRED');
  }
  const date = normalizeText(body.date);
  const startTime = normalizeText(body.start_time ?? body.startTime);
  const endTime = normalizeText(body.end_time ?? body.endTime);
  if (!date || !startTime || !endTime) {
    throw new AppointmentsWriteValidationError('date, start_time e end_time são obrigatórios.');
  }

  return {
    tenant_id: tenantId,
    legacy_id: legacyId,
    patient_id: normalizeText(body.patient_id ?? body.patientId) || null,
    lead_id: normalizeText(body.lead_id ?? body.leadId) || null,
    professional_id: normalizeText(body.professional_id ?? body.professionalId) || null,
    room_id: normalizeText(body.room_id ?? body.roomId) || null,
    date,
    start_time: startTime,
    end_time: endTime,
    duration_minutes: Number(body.duration_minutes ?? body.durationMinutes ?? 0) || 0,
    slot_capacity: Number(body.slot_capacity ?? body.slotCapacity ?? 1) === 2 ? 2 : 1,
    status: normalizeText(body.status) || 'agendado',
    procedure_name: normalizeText(body.procedure_name ?? body.procedureName) || '',
    channel: normalizeText(body.channel) || '',
    notes: normalizeText(body.notes) || '',
    insurance: normalizeText(body.insurance) || '',
    is_return: Boolean(body.is_return ?? body.isReturn),
  };
}

function mapWriteBodyToUpdateRow(body = {}) {
  const patch = {};
  if (body.patient_id !== undefined || body.patientId !== undefined) {
    patch.patient_id = normalizeText(body.patient_id ?? body.patientId) || null;
  }
  if (body.lead_id !== undefined || body.leadId !== undefined) {
    patch.lead_id = normalizeText(body.lead_id ?? body.leadId) || null;
  }
  if (body.professional_id !== undefined || body.professionalId !== undefined) {
    patch.professional_id = normalizeText(body.professional_id ?? body.professionalId) || null;
  }
  if (body.room_id !== undefined || body.roomId !== undefined) {
    patch.room_id = normalizeText(body.room_id ?? body.roomId) || null;
  }
  if (body.date !== undefined) patch.date = normalizeText(body.date);
  if (body.start_time !== undefined || body.startTime !== undefined) {
    patch.start_time = normalizeText(body.start_time ?? body.startTime);
  }
  if (body.end_time !== undefined || body.endTime !== undefined) {
    patch.end_time = normalizeText(body.end_time ?? body.endTime);
  }
  if (body.duration_minutes !== undefined || body.durationMinutes !== undefined) {
    patch.duration_minutes = Number(body.duration_minutes ?? body.durationMinutes ?? 0) || 0;
  }
  if (body.slot_capacity !== undefined || body.slotCapacity !== undefined) {
    patch.slot_capacity = Number(body.slot_capacity ?? body.slotCapacity ?? 1) === 2 ? 2 : 1;
  }
  if (body.status !== undefined) patch.status = normalizeText(body.status);
  if (body.procedure_name !== undefined || body.procedureName !== undefined) {
    patch.procedure_name = normalizeText(body.procedure_name ?? body.procedureName) || '';
  }
  if (body.channel !== undefined) patch.channel = normalizeText(body.channel) || '';
  if (body.notes !== undefined) patch.notes = normalizeText(body.notes) || '';
  if (body.insurance !== undefined) patch.insurance = normalizeText(body.insurance) || '';
  if (body.is_return !== undefined || body.isReturn !== undefined) {
    patch.is_return = Boolean(body.is_return ?? body.isReturn);
  }
  if (body.cancel_reason !== undefined || body.cancelReason !== undefined) {
    patch.cancel_reason = normalizeText(body.cancel_reason ?? body.cancelReason) || '';
  }
  patch.updated_at = new Date().toISOString();
  return patch;
}

async function findAppointmentByRef(supabase, tenantId, ref) {
  const needle = normalizeText(ref);
  if (!needle) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(needle);
  let query = supabase
    .from('appointments')
    .select(APPOINTMENT_WRITE_SELECT)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null);
  query = isUuid
    ? query.or(`id.eq.${needle},legacy_id.eq.${needle}`)
    : query.or(`legacy_id.eq.${needle},id.eq.${needle}`);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (isMissingAppointmentsTableError(error)) {
      throw Object.assign(new Error('Tabela appointments indisponível.'), { code: 'APPOINTMENTS_TABLE_MISSING' });
    }
    throw error;
  }
  return data;
}

export async function upsertAppointmentForTenant(supabase, tenantId, body) {
  const row = mapWriteBodyToInsertRow(body, tenantId);
  const existing = await findAppointmentByRef(supabase, tenantId, row.legacy_id);
  if (existing?.id) {
    const { data, error } = await supabase
      .from('appointments')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('tenant_id', tenantId)
      .select(APPOINTMENT_WRITE_SELECT)
      .single();
    if (error) throw error;
    return mapAppointmentListRow(data);
  }

  const { data, error } = await supabase
    .from('appointments')
    .insert(row)
    .select(APPOINTMENT_WRITE_SELECT)
    .single();
  if (error) {
    if (isMissingAppointmentsTableError(error)) {
      throw Object.assign(new Error('Tabela appointments indisponível.'), { code: 'APPOINTMENTS_TABLE_MISSING' });
    }
    throw error;
  }
  return mapAppointmentListRow(data);
}

export async function updateAppointmentForTenant(supabase, tenantId, ref, body) {
  const existing = await findAppointmentByRef(supabase, tenantId, ref);
  if (!existing) {
    throw new AppointmentsWriteValidationError('Agendamento não encontrado.', 'APPOINTMENT_NOT_FOUND');
  }
  const patch = mapWriteBodyToUpdateRow(body);
  const { data, error } = await supabase
    .from('appointments')
    .update(patch)
    .eq('id', existing.id)
    .eq('tenant_id', tenantId)
    .select(APPOINTMENT_WRITE_SELECT)
    .single();
  if (error) {
    if (isMissingAppointmentsTableError(error)) {
      throw Object.assign(new Error('Tabela appointments indisponível.'), { code: 'APPOINTMENTS_TABLE_MISSING' });
    }
    throw error;
  }
  return mapAppointmentListRow(data);
}

export async function cancelAppointmentForTenant(supabase, tenantId, ref, reason = '') {
  return updateAppointmentForTenant(supabase, tenantId, ref, {
    status: 'cancelado',
    cancel_reason: normalizeText(reason),
  });
}

function resolveTenantId(req) {
  return req.tenantContext?.tenantId || null;
}

export function createAppointmentCreateHandler(deps) {
  const { supabase } = deps;
  return async function appointmentCreateHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdInBody(req.body || {});
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'Contexto de tenant ausente.' });
      }

      const row = await upsertAppointmentForTenant(supabase, tenantId, req.body || {});
      return res.status(201).json({ ok: true, data: row, meta: { tenant_id: tenantId } });
    } catch (err) {
      if (err instanceof AppointmentsWriteValidationError) {
        return res.status(400).json({ ok: false, error: err.message, code: err.code });
      }
      if (err?.code === 'APPOINTMENTS_TABLE_MISSING') {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      console.error('[APPOINTMENTS_API_CREATE]', err);
      return res.status(500).json({ ok: false, error: 'Falha ao criar agendamento.' });
    }
  };
}

export function createAppointmentUpdateHandler(deps) {
  const { supabase } = deps;
  return async function appointmentUpdateHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdInBody(req.body || {});
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'Contexto de tenant ausente.' });
      }
      const ref = normalizeText(req.params?.id);
      if (!ref) {
        return res.status(400).json({ ok: false, error: 'ID do agendamento ausente.' });
      }

      const row = await updateAppointmentForTenant(supabase, tenantId, ref, req.body || {});
      return res.status(200).json({ ok: true, data: row, meta: { tenant_id: tenantId } });
    } catch (err) {
      if (err instanceof AppointmentsWriteValidationError) {
        const status = err.code === 'APPOINTMENT_NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ ok: false, error: err.message, code: err.code });
      }
      if (err?.code === 'APPOINTMENTS_TABLE_MISSING') {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      console.error('[APPOINTMENTS_API_UPDATE]', err);
      return res.status(500).json({ ok: false, error: 'Falha ao atualizar agendamento.' });
    }
  };
}

export function createAppointmentCancelHandler(deps) {
  const { supabase } = deps;
  return async function appointmentCancelHandler(req, res) {
    try {
      if (!req.appAuthUser?.id) {
        return res.status(401).json({ ok: false, error: 'Token do app ausente.' });
      }
      assertNoTenantIdInBody(req.body || {});
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'Contexto de tenant ausente.' });
      }
      const ref = normalizeText(req.params?.id);
      if (!ref) {
        return res.status(400).json({ ok: false, error: 'ID do agendamento ausente.' });
      }
      const reason = normalizeText(req.body?.reason ?? req.body?.cancel_reason ?? req.body?.cancelReason);

      const row = await cancelAppointmentForTenant(supabase, tenantId, ref, reason);
      return res.status(200).json({ ok: true, data: row, meta: { tenant_id: tenantId } });
    } catch (err) {
      if (err instanceof AppointmentsWriteValidationError) {
        const status = err.code === 'APPOINTMENT_NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ ok: false, error: err.message, code: err.code });
      }
      if (err?.code === 'APPOINTMENTS_TABLE_MISSING') {
        return res.status(503).json({ ok: false, error: err.message, code: err.code });
      }
      console.error('[APPOINTMENTS_API_CANCEL]', err);
      return res.status(500).json({ ok: false, error: 'Falha ao cancelar agendamento.' });
    }
  };
}
