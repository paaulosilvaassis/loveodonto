import {
  isBrUfValid,
  isCorpoClinicoCategory,
} from '../constants/collaboratorRhCatalog.js';
import { withDb } from '../db/index.js';
import { requirePermission } from '../permissions/permissions.js';
import { createId, assertRequired, normalizeText } from './helpers.js';
import { logAction } from './logService.js';
import { isCepValid, isCpfValid, isPhoneValid, onlyDigits, validateFileMeta } from '../utils/validators.js';
import {
  isCollaboratorEmailValid,
  resolveCollaboratorProfileRole,
} from '../utils/collaboratorAccessRole.js';
import { provisionCollaboratorSystemAccess, linkCollaboratorTenantAccess, listTenantUsersAccess } from './collaboratorAccessProvisionService.js';
import { normalizeTenantId } from './tenantIsolation.js';
import {
  readGetCollaborator,
  readGetProfessionalOptions,
  readListCollaborators,
} from './collaboratorServiceReadAdapter.js';
import {
  scheduleCollaboratorDualWriteCreate,
  scheduleCollaboratorDualWriteUpdate,
} from './collaboratorServiceWriteAdapter.js';

export function syncLocalCollaboratorAccess(collaboratorId, tenantUser, profileRole) {
  const userId = String(tenantUser?.user_id || '').trim();
  if (!userId) return;
  const role = String(profileRole || tenantUser?.role || tenantUser?.role_slug || 'atendimento').trim();
  const tenantId = normalizeTenantId(tenantUser?.tenant_id || tenantUser?.tenantId);
  withDb((db) => {
    db.collaboratorAccess = (db.collaboratorAccess || []).filter(
      (item) => item.collaboratorId !== collaboratorId && item.userId !== userId,
    );
    db.collaboratorAccess.push({
      collaboratorId,
      userId,
      tenant_id: tenantId || undefined,
      role,
      permissions: [],
      lastLoginAt: '',
    });
    return db;
  });
}

/** Alterar estatus sozinho não exige revalidar RH completo (evita bloquear registros legados). */
const RH_PROFILE_KEYS = new Set([
  'rhCategoria',
  'cargo',
  'rhFuncaoDescricao',
  'conselhoNome',
  'conselhoUf',
  'tipoVinculo',
  'setor',
  'especialidades',
  'registroProfissional',
  'apelido',
  'nomeCompleto',
  'nomeSocial',
  'sexo',
  'dataNascimento',
  'email',
]);

function collaboratorPayloadTouchesRhProfile(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return Object.keys(payload).some((k) => RH_PROFILE_KEYS.has(k));
}

function validateCollaboratorRhOrThrow(collab) {
  assertRequired(collab.rhCategoria, 'Categoria é obrigatória.');
  assertRequired(collab.cargo, 'Cargo é obrigatório.');
  assertRequired(collab.tipoVinculo, 'Tipo de vínculo é obrigatório.');
  assertRequired(collab.setor, 'Setor é obrigatório.');
  if (isCorpoClinicoCategory(collab.rhCategoria)) {
    assertRequired(collab.registroProfissional, 'Número do conselho é obrigatório para o corpo clínico.');
    assertRequired(collab.conselhoUf, 'UF do conselho é obrigatória para o corpo clínico.');
    const uf = String(collab.conselhoUf || '').trim().toUpperCase();
    if (!isBrUfValid(uf)) throw new Error('UF do conselho inválida. Use a sigla da UF (ex.: SP).');
  }
}

const normalizeCargo = (value) => normalizeText(value);
const CANCELED_APPOINTMENT_STATUSES = new Set(['cancelado', 'desmarcou']);

/** Comparação estável do CRO / registro profissional (evita falso “já cadastrado” por espaços ou maiúsculas). */
function normalizeRegistroProfissionalKey(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function collaboratorStatusLabel(status) {
  const s = String(status || 'ativo').trim().toLowerCase();
  return s === 'ativo' ? 'Ativo' : 'Inativo';
}

function findCollaboratorByRegistroKey(db, registroRaw, excludeCollaboratorId) {
  const key = normalizeRegistroProfissionalKey(registroRaw);
  if (!key) return null;
  return (
    (db.collaborators || []).find(
      (item) =>
        item.id !== excludeCollaboratorId
        && normalizeRegistroProfissionalKey(item.registroProfissional) === key,
    ) || null
  );
}

const timeToMinutes = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time || '')) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};

const buildDayRanges = (workHour) => {
  if (!workHour?.ativo) return [];
  const ranges = [];
  const firstStart = timeToMinutes(workHour.inicio);
  const firstEnd = timeToMinutes(workHour.fim);
  const secondStart = timeToMinutes(workHour.intervaloInicio);
  const secondEnd = timeToMinutes(workHour.intervaloFim);

  if (firstStart != null && firstEnd != null && firstEnd > firstStart) {
    ranges.push({ start: firstStart, end: firstEnd });
  }
  if (secondStart != null && secondEnd != null && secondEnd > secondStart) {
    ranges.push({ start: secondStart, end: secondEnd });
  }
  return ranges;
};

/** Junta intervalos [start,end) em minutos, ordenados e sem sobreposição. */
function mergeRanges(ranges) {
  if (!Array.isArray(ranges) || ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const out = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/** Remove a interseção de [c,d) de [a,b), retorna 0–2 segmentos. */
function subtractSegment(a, b, c, d) {
  if (d <= a || c >= b) return [{ start: a, end: b }];
  if (c <= a && d >= b) return [];
  if (c <= a && d > a && d < b) return [{ start: d, end: b }];
  if (c > a && c < b && d >= b) return [{ start: a, end: c }];
  if (c > a && d < b) return [
    { start: a, end: c },
    { start: d, end: b },
  ];
  return [];
}

/** oldMerged − newMerged: partes da disponibilidade antiga que deixam de existir. */
function removedAvailabilityMinutes(oldMerged, newMerged) {
  let remaining = oldMerged.map((r) => ({ ...r }));
  for (const n of newMerged) {
    const next = [];
    for (const o of remaining) {
      next.push(...subtractSegment(o.start, o.end, n.start, n.end));
    }
    remaining = mergeRanges(next);
  }
  return remaining;
}

function workHoursByWeekdayMap(rows) {
  const map = new Map();
  (rows || []).forEach((item) => {
    if (item == null || item.diaSemana === '') return;
    const d = Number(item.diaSemana);
    if (!Number.isFinite(d) || d < 0 || d > 6) return;
    map.set(d, item);
  });
  return map;
}

function removedRangesByWeekday(prevWorkHours, nextWorkHours) {
  const prevMap = workHoursByWeekdayMap(prevWorkHours);
  const nextMap = workHoursByWeekdayMap(nextWorkHours);
  const removedByDay = new Map();
  for (let dia = 0; dia < 7; dia++) {
    const oldWh = prevMap.get(dia);
    const newWh = nextMap.get(dia);
    const oldMerged = mergeRanges(buildDayRanges(oldWh));
    const newMerged = mergeRanges(buildDayRanges(newWh));
    const removed = removedAvailabilityMinutes(oldMerged, newMerged);
    if (removed.length > 0) removedByDay.set(dia, removed);
  }
  return removedByDay;
}

/** true se [aStart,aEnd) cruza [rStart,rEnd) com sobreposição de tempo. */
function intervalsOverlapMinutes(aStart, aEnd, rStart, rEnd) {
  return aStart < rEnd && aEnd > rStart;
}

function resolvePatientDisplayName(patient) {
  if (!patient) return '';
  return (
    patient.full_name ||
    patient.nickname ||
    patient.social_name ||
    patient.name ||
    ''
  ).trim();
}

/**
 * Conflitos apenas quando a nova grade REMOVE disponibilidade que existia antes
 * e há agendamento (não cancelado) intersectando o trecho removido.
 */
function listWorkHoursRemovalConflicts(db, collaboratorId, prevWorkHours, nextWorkHours) {
  const today = new Date().toISOString().slice(0, 10);
  const removedByDay = removedRangesByWeekday(prevWorkHours, nextWorkHours);
  if (removedByDay.size === 0) return [];

  const patientMap = new Map((db.patients || []).map((patient) => [patient.id, patient]));
  const professional = (db.collaborators || []).find((item) => item.id === collaboratorId);

  return (db.appointments || [])
    .filter((appointment) => {
      if (appointment.professionalId !== collaboratorId) return false;
      if (CANCELED_APPOINTMENT_STATUSES.has(String(appointment.status || '').toLowerCase())) return false;
      return String(appointment.date || '') >= today;
    })
    .map((appointment) => {
      const weekDay = new Date(`${appointment.date}T12:00:00`).getDay();
      const removedRanges = removedByDay.get(weekDay);
      if (!removedRanges?.length) return null;

      const start = timeToMinutes(appointment.startTime);
      const end = timeToMinutes(appointment.endTime);
      if (start == null || end == null || end <= start) return null;

      const hitsRemoved = removedRanges.some((r) => intervalsOverlapMinutes(start, end, r.start, r.end));
      if (!hitsRemoved) return null;

      const patient = appointment.patientId ? patientMap.get(appointment.patientId) : null;
      const patientName =
        resolvePatientDisplayName(patient) ||
        appointment.leadDisplayName ||
        'Paciente não identificado';

      return {
        appointmentId: appointment.id,
        patientName,
        date: appointment.date,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        procedureName: appointment.procedureName || '',
        professionalName: professional?.nomeCompleto || professional?.apelido || 'Profissional',
        status: appointment.status || '',
      };
    })
    .filter(Boolean);
}

const ensureUnique = (db, { cpf, email, registro, excludeCollaboratorId } = {}) => {
  if (cpf) {
    const exists = db.collaboratorDocuments.some(
      (doc) =>
        onlyDigits(doc.cpf) === onlyDigits(cpf) &&
        (!excludeCollaboratorId || doc.collaboratorId !== excludeCollaboratorId)
    );
    if (exists) throw new Error('CPF já cadastrado.');
  }
  if (email) {
    const emailNorm = String(email || '').trim().toLowerCase();
    const exists = db.collaborators.some(
      (item) => String(item.email || '').trim().toLowerCase() === emailNorm && item.id !== excludeCollaboratorId
    );
    if (exists) throw new Error('E-mail já cadastrado.');
  }
  if (registro) {
    const existing = findCollaboratorByRegistroKey(db, registro, excludeCollaboratorId);
    if (existing) {
      const nome = (existing.nomeCompleto || existing.apelido || 'outro colaborador').trim();
      const situacao = collaboratorStatusLabel(existing.status);
      const err = new Error(
        `Este número de registro profissional (CRO) já está cadastrado para "${nome}" (situação: ${situacao}). `
        + 'Se for a mesma pessoa, abra o cadastro existente. Se estiver inativa, veja na aba Inativos.',
      );
      err.code = 'DUPLICATE_REGISTRO_PROFISSIONAL';
      err.existingCollaboratorId = existing.id;
      err.existingCollaboratorName = nome;
      err.existingStatus = existing.status || 'ativo';
      throw err;
    }
  }
};

export const listCollaborators = (filters = {}) => readListCollaborators(filters);

export const getCollaborator = (collaboratorId) => readGetCollaborator(collaboratorId);

export const createCollaborator = (user, payload) => {
  requirePermission(user, 'collaborators:write');
  const espec = Array.isArray(payload.especialidades)
    ? payload.especialidades.map((e) => normalizeText(e)).filter(Boolean)
    : [];
  const conselhoUfRaw = String(payload.conselhoUf || '').trim().toUpperCase().slice(0, 2);
  const collaborator = {
    id: createId('col'),
    tenant_id: normalizeTenantId(user?.tenantId || user?.tenant_id) || null,
    status: payload.status || 'ativo',
    apelido: normalizeText(payload.apelido),
    nomeCompleto: normalizeText(payload.nomeCompleto),
    nomeSocial: normalizeText(payload.nomeSocial),
    sexo: normalizeText(payload.sexo),
    dataNascimento: normalizeText(payload.dataNascimento),
    fotoUrl: payload.fotoUrl || '',
    rhCategoria: normalizeText(payload.rhCategoria),
    cargo: normalizeCargo(payload.cargo),
    rhFuncaoDescricao: normalizeText(payload.rhFuncaoDescricao),
    conselhoNome: normalizeText(payload.conselhoNome),
    conselhoUf: normalizeText(conselhoUfRaw),
    tipoVinculo: normalizeText(payload.tipoVinculo),
    setor: normalizeText(payload.setor),
    especialidades: espec,
    registroProfissional: normalizeRegistroProfissionalKey(payload.registroProfissional),
    email: normalizeText(payload.email),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assertRequired(collaborator.apelido, 'Apelido é obrigatório.');
  assertRequired(collaborator.nomeCompleto, 'Nome completo é obrigatório.');
  validateCollaboratorRhOrThrow(collaborator);

  withDb((db) => {
    ensureUnique(db, {
      cpf: payload.cpf,
      email: collaborator.email,
      registro: collaborator.registroProfissional,
    });
    db.collaborators.push(collaborator);
    logAction('collaborator:create', { collaboratorId: collaborator.id, userId: user.id });
    return db;
  });
  scheduleCollaboratorDualWriteCreate(user, collaborator);
  return collaborator;
};

/**
 * Cria colaborador localmente e provisiona acesso SaaS quando houver e-mail válido.
 * Falhas de provisionamento são retornadas em accessError (não silenciosas).
 */
export async function createCollaboratorWithSystemAccess(user, payload, options = {}) {
  const requireSystemAccess = options.require_system_access !== false
    && options.allow_system_access !== false;
  const emailRaw = String(payload.email || '').trim().toLowerCase();
  const hasValidEmail = isCollaboratorEmailValid(emailRaw);

  if (requireSystemAccess && !hasValidEmail) {
    const err = new Error('E-mail válido é obrigatório para colaboradores com acesso ao sistema.');
    err.code = 'EMAIL_REQUIRED_FOR_ACCESS';
    throw err;
  }

  const collaborator = createCollaborator(user, payload);
  const email = String(collaborator.email || '').trim().toLowerCase();

  if (!isCollaboratorEmailValid(email)) {
    return {
      collaborator,
      systemAccess: null,
      noAccess: true,
      accessError: null,
    };
  }

  const tenantId = String(options.tenant_id || user?.tenantId || '').trim();
  const profileRole = String(
    options.profile_role
    || resolveCollaboratorProfileRole({
      rhCategoria: collaborator.rhCategoria,
      cargo: collaborator.cargo,
    }),
  ).trim();

  try {
    const systemAccess = await provisionCollaboratorSystemAccess({
      tenant_id: tenantId,
      collaborator_id: collaborator.id,
      collaborator_full_name: collaborator.nomeCompleto || collaborator.apelido || email,
      create_system_access: true,
      email,
      profile_role: profileRole,
      send_invite: options.send_invite !== false,
    });
    syncLocalCollaboratorAccess(collaborator.id, systemAccess?.tenant_user, profileRole);
    return {
      collaborator,
      systemAccess,
      noAccess: false,
      accessError: null,
      linkedExisting: Boolean(systemAccess?.linkedExisting),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err || 'Falha ao provisionar acesso.');
    const lower = message.toLowerCase();
    if (lower.includes('já possui acesso nesta clínica')) {
      try {
        const linked = await linkCollaboratorTenantAccess({
          tenant_id: tenantId,
          collaborator_id: collaborator.id,
          email,
          full_name: collaborator.nomeCompleto || collaborator.apelido || email,
        });
        syncLocalCollaboratorAccess(collaborator.id, linked?.tenant_user, profileRole);
        return {
          collaborator,
          systemAccess: linked,
          noAccess: false,
          accessError: null,
          linkedExisting: true,
        };
      } catch (linkErr) {
        const linkMessage = linkErr instanceof Error ? linkErr.message : String(linkErr || '');
        const accessError = linkErr instanceof Error ? linkErr : new Error(linkMessage);
        if (import.meta.env?.DEV) {
          console.debug('[createCollaboratorWithSystemAccess] falha ao vincular acesso existente', accessError);
        }
        return {
          collaborator,
          systemAccess: null,
          noAccess: false,
          accessError,
        };
      }
    }
    const accessError = err instanceof Error ? err : new Error(message);
    if (import.meta.env?.DEV) {
      console.debug('[createCollaboratorWithSystemAccess] falha ao provisionar acesso', accessError);
    }
    return {
      collaborator,
      systemAccess: null,
      noAccess: false,
      accessError,
    };
  }
}

/**
 * Backfill opcional: vincula ou provisiona acesso para colaboradores com e-mail e sem tenant_user.
 */
export async function backfillCollaboratorsPendingAccess(user, { provisionMissing = false } = {}) {
  const tenantId = String(user?.tenantId || '').trim();
  if (!tenantId) return { linked: 0, provisioned: 0, skipped: 0, errors: [] };

  let collaborators = [];
  try {
    const { listTenantCollaborators } = await import('./tenantCollaboratorService.js');
    collaborators = await listTenantCollaborators(tenantId, { legacy: true });
  } catch {
    return { linked: 0, provisioned: 0, skipped: 0, errors: ['Falha ao listar colaboradores do tenant.'] };
  }
  collaborators = collaborators.filter((item) => isCollaboratorEmailValid(item.email));
  if (collaborators.length === 0) return { linked: 0, provisioned: 0, skipped: 0, errors: [] };

  let users = [];
  try {
    const result = await listTenantUsersAccess(tenantId);
    users = result.users || [];
  } catch (err) {
    return {
      linked: 0,
      provisioned: 0,
      skipped: collaborators.length,
      errors: [err?.message || 'Falha ao listar usuários do tenant.'],
    };
  }

  const byCollaboratorId = new Map(
    users.filter((row) => row.collaborator_id).map((row) => [row.collaborator_id, row]),
  );
  const byEmail = new Map(
    users.map((row) => [String(row.email || '').trim().toLowerCase(), row]),
  );

  let linked = 0;
  let provisioned = 0;
  let skipped = 0;
  const errors = [];

  for (const collaborator of collaborators) {
    const email = String(collaborator.email || '').trim().toLowerCase();
    if (byCollaboratorId.has(collaborator.id)) {
      skipped += 1;
      continue;
    }

    const existingByEmail = byEmail.get(email);
    if (existingByEmail?.id) {
      try {
        await linkCollaboratorTenantAccess({
          tenant_id: tenantId,
          collaborator_id: collaborator.id,
          email,
          full_name: collaborator.nomeCompleto || collaborator.apelido || email,
        });
        syncLocalCollaboratorAccess(collaborator.id, existingByEmail, existingByEmail.role);
        linked += 1;
      } catch (err) {
        errors.push(`${collaborator.nomeCompleto || collaborator.id}: ${err?.message || 'falha ao vincular'}`);
      }
      continue;
    }

    if (!provisionMissing) {
      skipped += 1;
      continue;
    }

    const profileRole = resolveCollaboratorProfileRole({
      rhCategoria: collaborator.rhCategoria,
      cargo: collaborator.cargo,
    });

    try {
      const result = await provisionCollaboratorSystemAccess({
        tenant_id: tenantId,
        collaborator_id: collaborator.id,
        collaborator_full_name: collaborator.nomeCompleto || collaborator.apelido || email,
        create_system_access: true,
        email,
        profile_role: profileRole,
        send_invite: true,
      });
      syncLocalCollaboratorAccess(collaborator.id, result?.tenant_user, profileRole);
      provisioned += 1;
    } catch (err) {
      errors.push(`${collaborator.nomeCompleto || collaborator.id}: ${err?.message || 'falha ao provisionar'}`);
    }
  }

  return { linked, provisioned, skipped, errors };
}

export const updateCollaborator = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  let prevSnapshot = null;
  const result = withDb((db) => {
    const index = db.collaborators.findIndex((item) => item.id === collaboratorId);
    if (index < 0) throw new Error('Colaborador não encontrado.');
    const prev = db.collaborators[index];
    prevSnapshot = { ...prev };
    const mergedEspecialidades =
      payload.especialidades !== undefined
        ? (Array.isArray(payload.especialidades)
            ? payload.especialidades.map((e) => normalizeText(e)).filter(Boolean)
            : prev.especialidades || [])
        : prev.especialidades || [];
    const conselhoUfIncoming =
      payload.conselhoUf !== undefined
        ? String(payload.conselhoUf || '').trim().toUpperCase().slice(0, 2)
        : prev.conselhoUf;
    const next = {
      ...prev,
      ...payload,
      apelido: normalizeText(payload.apelido ?? prev.apelido),
      nomeCompleto: normalizeText(payload.nomeCompleto ?? prev.nomeCompleto),
      nomeSocial: normalizeText(payload.nomeSocial ?? prev.nomeSocial),
      sexo: normalizeText(payload.sexo ?? prev.sexo),
      dataNascimento: normalizeText(payload.dataNascimento ?? prev.dataNascimento),
      rhCategoria: normalizeText(payload.rhCategoria ?? prev.rhCategoria),
      cargo: normalizeCargo(payload.cargo ?? prev.cargo),
      rhFuncaoDescricao: normalizeText(payload.rhFuncaoDescricao ?? prev.rhFuncaoDescricao),
      conselhoNome: normalizeText(payload.conselhoNome !== undefined ? payload.conselhoNome : prev.conselhoNome),
      conselhoUf: normalizeText(conselhoUfIncoming ?? ''),
      tipoVinculo: normalizeText(payload.tipoVinculo ?? prev.tipoVinculo),
      setor: normalizeText(payload.setor ?? prev.setor),
      especialidades: mergedEspecialidades,
      registroProfissional: normalizeRegistroProfissionalKey(
        payload.registroProfissional !== undefined ? payload.registroProfissional : prev.registroProfissional,
      ),
      email: normalizeText(payload.email ?? prev.email),
      fotoUrl: payload.fotoUrl !== undefined ? payload.fotoUrl : prev.fotoUrl,
      status: payload.status !== undefined ? payload.status : prev.status,
      updatedAt: new Date().toISOString(),
    };
    if (collaboratorPayloadTouchesRhProfile(payload)) {
      validateCollaboratorRhOrThrow(next);
    }
    ensureUnique(db, {
      email: next.email,
      registro: next.registroProfissional,
      excludeCollaboratorId: collaboratorId,
    });
    db.collaborators[index] = next;
    logAction('collaborator:update', { collaboratorId, userId: user.id });
    return next;
  });
  scheduleCollaboratorDualWriteUpdate(user, collaboratorId, result, prevSnapshot);
  return result;
};

export const uploadCollaboratorPhoto = (user, collaboratorId, file) => {
  requirePermission(user, 'collaborators:write');
  const validation = validateFileMeta(file, ['image/png', 'image/jpeg']);
  if (!validation.ok) throw new Error(validation.message);
  return updateCollaborator(user, collaboratorId, { fotoUrl: file.dataUrl });
};

export const updateCollaboratorDocuments = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  if (payload.cpf && !isCpfValid(payload.cpf)) {
    throw new Error('CPF inválido.');
  }
  return withDb((db) => {
    ensureUnique(db, { cpf: payload.cpf, excludeCollaboratorId: collaboratorId });
    const next = {
      collaboratorId,
      cpf: normalizeText(payload.cpf),
      rg: normalizeText(payload.rg),
      pisPasep: normalizeText(payload.pisPasep),
      ctps: normalizeText(payload.ctps),
      cnpj: normalizeText(payload.cnpj),
      tipoContratacao: normalizeText(payload.tipoContratacao),
      dataAdmissao: normalizeText(payload.dataAdmissao),
      dataDemissao: normalizeText(payload.dataDemissao),
      observacoes: normalizeText(payload.observacoes),
    };
    db.collaboratorDocuments = db.collaboratorDocuments.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorDocuments.push(next);
    logAction('collaborator:update-documents', { collaboratorId, userId: user.id });
    return next;
  });
};

export const addCollaboratorEducation = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const education = {
    id: createId('edu'),
    collaboratorId,
    formacao: normalizeText(payload.formacao),
    instituicao: normalizeText(payload.instituicao),
    anoConclusao: normalizeText(payload.anoConclusao),
    cursos: normalizeText(payload.cursos),
  };
  return withDb((db) => {
    db.collaboratorEducation.push(education);
    logAction('collaborator:add-education', { collaboratorId, userId: user.id });
    return education;
  });
};

export const removeCollaboratorEducation = (user, educationId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorEducation = db.collaboratorEducation.filter((item) => item.id !== educationId);
    logAction('collaborator:remove-education', { educationId, userId: user.id });
    return db.collaboratorEducation;
  });
};

export const updateCollaboratorNationality = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    naturalidadeCidade: normalizeText(payload.naturalidadeCidade),
    naturalidadeUf: normalizeText(payload.naturalidadeUf),
    nacionalidade: normalizeText(payload.nacionalidade),
  };
  return withDb((db) => {
    db.collaboratorNationality = db.collaboratorNationality.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorNationality.push(next);
    logAction('collaborator:update-nationality', { collaboratorId, userId: user.id });
    return next;
  });
};

export const addCollaboratorPhone = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const ddd = onlyDigits(payload.ddd);
  const numero = onlyDigits(payload.numero);
  if (!isPhoneValid(`${ddd}${numero}`)) throw new Error('Telefone inválido.');
  const phone = {
    id: createId('phone'),
    collaboratorId,
    tipo: normalizeText(payload.tipo),
    ddd,
    numero,
    principal: Boolean(payload.principal),
  };
  return withDb((db) => {
    if (phone.principal) {
      db.collaboratorPhones.forEach((item) => {
        if (item.collaboratorId === collaboratorId) item.principal = false;
      });
    }
    db.collaboratorPhones.push(phone);
    logAction('collaborator:add-phone', { collaboratorId, userId: user.id });
    return phone;
  });
};

export const removeCollaboratorPhone = (user, phoneId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorPhones = db.collaboratorPhones.filter((item) => item.id !== phoneId);
    logAction('collaborator:remove-phone', { phoneId, userId: user.id });
    return db.collaboratorPhones;
  });
};

export const addCollaboratorAddress = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  if (payload.cep && !isCepValid(payload.cep)) throw new Error('CEP inválido.');
  const address = {
    id: createId('addr'),
    collaboratorId,
    tipo: normalizeText(payload.tipo),
    cep: normalizeText(payload.cep),
    logradouro: normalizeText(payload.logradouro),
    numero: normalizeText(payload.numero),
    complemento: normalizeText(payload.complemento),
    bairro: normalizeText(payload.bairro),
    cidade: normalizeText(payload.cidade),
    uf: normalizeText(payload.uf),
    principal: Boolean(payload.principal),
  };
  return withDb((db) => {
    if (address.principal) {
      db.collaboratorAddresses.forEach((item) => {
        if (item.collaboratorId === collaboratorId) item.principal = false;
      });
    }
    db.collaboratorAddresses.push(address);
    logAction('collaborator:add-address', { collaboratorId, userId: user.id });
    return address;
  });
};

export const removeCollaboratorAddress = (user, addressId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorAddresses = db.collaboratorAddresses.filter((item) => item.id !== addressId);
    logAction('collaborator:remove-address', { addressId, userId: user.id });
    return db.collaboratorAddresses;
  });
};

export const updateCollaboratorRelationships = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    estadoCivil: normalizeText(payload.estadoCivil),
    dependentes: payload.dependentes || [],
    contatoEmergenciaNome: normalizeText(payload.contatoEmergenciaNome),
    contatoEmergenciaTelefone: normalizeText(payload.contatoEmergenciaTelefone),
  };
  return withDb((db) => {
    db.collaboratorRelationships = db.collaboratorRelationships.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorRelationships.push(next);
    logAction('collaborator:update-relationships', { collaboratorId, userId: user.id });
    return next;
  });
};

export const updateCollaboratorCharacteristics = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    observacoesGerais: normalizeText(payload.observacoesGerais),
  };
  return withDb((db) => {
    db.collaboratorCharacteristics = db.collaboratorCharacteristics.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorCharacteristics.push(next);
    logAction('collaborator:update-characteristics', { collaboratorId, userId: user.id });
    return next;
  });
};

export const updateCollaboratorAdditional = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const next = {
    collaboratorId,
    notes: normalizeText(payload.notes),
  };
  return withDb((db) => {
    db.collaboratorAdditional = db.collaboratorAdditional.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorAdditional.push(next);
    logAction('collaborator:update-additional', { collaboratorId, userId: user.id });
    return next;
  });
};

export const addCollaboratorInsurance = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  const insurance = {
    id: createId('ins'),
    collaboratorId,
    convenioNome: normalizeText(payload.convenioNome),
    detalhes: normalizeText(payload.detalhes),
    validade: normalizeText(payload.validade),
  };
  return withDb((db) => {
    db.collaboratorInsurances.push(insurance);
    logAction('collaborator:add-insurance', { collaboratorId, userId: user.id });
    return insurance;
  });
};

export const removeCollaboratorInsurance = (user, insuranceId) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    db.collaboratorInsurances = db.collaboratorInsurances.filter((item) => item.id !== insuranceId);
    logAction('collaborator:remove-insurance', { insuranceId, userId: user.id });
    return db.collaboratorInsurances;
  });
};

export const updateCollaboratorAccess = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:access');
  const next = {
    collaboratorId,
    userId: normalizeText(payload.userId),
    role: normalizeText(payload.role),
    permissions: payload.permissions || [],
    lastLoginAt: payload.lastLoginAt || '',
  };
  return withDb((db) => {
    db.collaboratorAccess = db.collaboratorAccess.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorAccess.push(next);
    logAction('collaborator:update-access', { collaboratorId, userId: user.id });
    return next;
  });
};

export const updateCollaboratorWorkHours = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:write');
  return withDb((db) => {
    const prevWorkHours = (db.collaboratorWorkHours || []).filter(
      (item) => item.collaboratorId === collaboratorId
    );
    const conflicts = listWorkHoursRemovalConflicts(db, collaboratorId, prevWorkHours, payload);
    if (conflicts.length > 0) {
      const error = new Error(
        'Esta alteração reduz a disponibilidade e há pacientes agendados no trecho que deixará de estar aberto. Reagende-os antes de salvar a nova grade de horários.'
      );
      error.code = 'WORK_HOURS_CONFLICT';
      error.details = { collaboratorId, conflicts };
      throw error;
    }

    db.collaboratorWorkHours = db.collaboratorWorkHours.filter((item) => item.collaboratorId !== collaboratorId);
    payload.forEach((item) => {
      db.collaboratorWorkHours.push({
        ...item,
        collaboratorId,
      });
    });
    logAction('collaborator:update-hours', { collaboratorId, userId: user.id });
    return db.collaboratorWorkHours.filter((item) => item.collaboratorId === collaboratorId);
  });
};

export const updateCollaboratorFinance = (user, collaboratorId, payload) => {
  requirePermission(user, 'collaborators:finance');
  const next = {
    collaboratorId,
    tipoRemuneracao: normalizeText(payload.tipoRemuneracao),
    percentualComissao: Number(payload.percentualComissao || 0),
    valorFixo: Number(payload.valorFixo || 0),
    proLabore: Number(payload.proLabore || 0),
    contaBancaria: normalizeText(payload.contaBancaria),
    observacoes: normalizeText(payload.observacoes),
  };
  return withDb((db) => {
    db.collaboratorFinance = db.collaboratorFinance.filter((item) => item.collaboratorId !== collaboratorId);
    db.collaboratorFinance.push(next);
    logAction('collaborator:update-finance', { collaboratorId, userId: user.id });
    return next;
  });
};

export const getProfessionalOptions = (options = {}) => readGetProfessionalOptions(options);
