/**
 * Atribuição explícita do profissional clínico do atendimento.
 * SSOT: appointment.clinicalProfessionalId
 * Não sobrescreve appointment.professionalId (operador/origem da agenda).
 */
import { loadDb } from '../db/index.js';
import { setAppointmentClinicalProfessional } from '../services/appointmentService.js';
import { normalizeTenantId } from '../services/tenantIsolation.js';
import {
  classifyCollaboratorRole,
  findTenantScopedCollaborator,
  parseProfessionalCouncilRegistration,
  PROFESSIONAL_READINESS_GATE,
} from './clinicalProfessionalIdentity.js';

export const CLINICAL_PROFESSIONAL_SSOT_FIELD = 'clinicalProfessionalId';
export const BLOCKED_CLINICAL_PROFESSIONAL_NOT_ASSIGNED =
  PROFESSIONAL_READINESS_GATE.BLOCKED_CLINICAL_PROFESSIONAL_NOT_ASSIGNED;

function isCollaboratorActive(collaborator) {
  if (!collaborator) return false;
  if (collaborator.active === false) return false;
  const status = String(collaborator.status || 'ativo').trim().toLowerCase();
  return status !== 'inativo' && status !== 'inactive' && status !== 'disabled';
}

function specialtyOf(collaborator) {
  if (Array.isArray(collaborator?.especialidades) && collaborator.especialidades.length) {
    return collaborator.especialidades.filter(Boolean).join(', ');
  }
  return String(collaborator?.especialidade || collaborator?.cargo || '').trim();
}

function toSelectorRow(collaborator) {
  const parsed = parseProfessionalCouncilRegistration(collaborator);
  const role = classifyCollaboratorRole(collaborator);
  return {
    collaboratorId: collaborator.id,
    name: String(collaborator.nomeCompleto || collaborator.name || collaborator.apelido || '').trim(),
    category: String(collaborator.rhCategoria || '').trim(),
    specialty: specialtyOf(collaborator),
    council: parsed.council || 'CRO',
    registration: parsed.registration,
    councilUf: parsed.councilUf,
    registrationDisplay: parsed.display,
    roleType: role.roleType,
  };
}

export function isEligibleClinicalProfessional(collaborator, tenantId) {
  if (!collaborator || !isCollaboratorActive(collaborator)) return false;
  const expected = normalizeTenantId(tenantId);
  const rowTenant = normalizeTenantId(collaborator.tenant_id || collaborator.tenantId);
  if (expected && rowTenant && rowTenant !== expected) return false;
  const role = classifyCollaboratorRole(collaborator);
  if (!role.isClinicalProfessional) return false;
  if (role.requiresProfessionalRegistration) {
    const parsed = parseProfessionalCouncilRegistration(collaborator);
    if (!parsed.valid) return false;
  }
  return true;
}

export function listEligibleClinicalProfessionals({ tenantId = null, db = null } = {}) {
  const database = db || loadDb();
  const expected = normalizeTenantId(
    tenantId || database.clinicProfile?.tenant_id || database.clinicProfile?.tenantId,
  );
  return (database.collaborators || [])
    .filter((row) => isEligibleClinicalProfessional(row, expected))
    .map(toSelectorRow)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function assignClinicalProfessionalToAppointment(user, appointmentId, collaboratorId) {
  const apptId = String(appointmentId || '').trim();
  const chosenId = String(collaboratorId || '').trim();
  if (!user?.id) throw new Error('Sessão inválida.');
  if (!apptId) throw new Error('Atendimento não informado.');
  if (!chosenId) throw new Error('Selecione o profissional clínico.');

  const tenantId = normalizeTenantId(user.tenantId || user.tenant_id);
  const eligible = listEligibleClinicalProfessionals({ tenantId });
  const chosen = eligible.find((row) => row.collaboratorId === chosenId);
  if (!chosen) {
    throw new Error('Profissional clínico inválido para este atendimento.');
  }

  const expected = normalizeTenantId(tenantId);
  const database = loadDb();
  const current = (database.appointments || []).find((row) => row.id === apptId);
  if (!current) throw new Error('Atendimento não encontrado.');
  const apptTenant = normalizeTenantId(current.tenant_id || current.tenantId);
  if (expected && apptTenant && apptTenant !== expected) {
    throw new Error('Atendimento não pertence a esta clínica.');
  }
  const scoped = findTenantScopedCollaborator(database.collaborators || [], chosenId, expected);
  if (!scoped || !isEligibleClinicalProfessional(scoped, expected)) {
    throw new Error('Profissional clínico inválido para este atendimento.');
  }
  return setAppointmentClinicalProfessional(user, apptId, chosenId);
}
