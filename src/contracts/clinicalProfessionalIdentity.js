/**
 * Identidade profissional clínica vs operador administrativo vs RT institucional.
 * SSOT de papel: collaborator.rhCategoria / cargo (catálogo RH). Não inferir papel só pelo CRO.
 */

import { loadDb } from '../db/index.js';
import {
  isAgendaProfessional,
  isCorpoClinicoCategory,
} from '../constants/collaboratorRhCatalog.js';
import { normalizeTenantId } from '../services/tenantIsolation.js';

export const COLLABORATOR_ROLE_TYPE = {
  CLINICAL_PROFESSIONAL: 'CLINICAL_PROFESSIONAL',
  CLINICAL_SUPPORT: 'CLINICAL_SUPPORT',
  ADMINISTRATIVE: 'ADMINISTRATIVE',
  UNKNOWN: 'UNKNOWN',
};

export const CLINICAL_PROFESSIONAL_SOURCE = {
  EXPLICIT_CLINICAL_ID: 'appointment.clinicalProfessionalId',
  APPOINTMENT_IF_CLINICAL: 'appointment.professionalId',
  ABSENT: 'clinical_professional_absent',
};

export const PROFESSIONAL_READINESS_GATE = {
  OK: 'ok',
  MISSING_CLINICAL: 'missing_clinical',
  MISSING_REGISTRATION: 'missing_registration',
};

const SUPPORT_CATEGORY = 'Apoio Clínico';

function pickNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function collaboratorDisplayName(collaborator) {
  return pickNonEmpty(
    collaborator?.nomeCompleto,
    collaborator?.name,
    collaborator?.apelido,
    collaborator?.full_name,
  );
}

export function findTenantScopedCollaborator(collaborators, collaboratorId, tenantId) {
  const id = String(collaboratorId || '').trim();
  if (!id || !Array.isArray(collaborators)) return null;
  const row = collaborators.find((item) => item?.id === id) || null;
  if (!row) return null;
  const expected = normalizeTenantId(tenantId);
  const rowTenant = normalizeTenantId(row.tenant_id || row.tenantId);
  if (expected && rowTenant && rowTenant !== expected) return null;
  return row;
}

export function classifyCollaboratorRole(collaborator) {
  if (!collaborator || typeof collaborator !== 'object') {
    return {
      roleType: COLLABORATOR_ROLE_TYPE.UNKNOWN,
      isClinicalProfessional: false,
      requiresProfessionalRegistration: false,
      source: 'missing_collaborator',
    };
  }
  const category = String(collaborator.rhCategoria || '').trim();
  if (isCorpoClinicoCategory(category) || isAgendaProfessional(collaborator)) {
    return {
      roleType: COLLABORATOR_ROLE_TYPE.CLINICAL_PROFESSIONAL,
      isClinicalProfessional: true,
      requiresProfessionalRegistration: true,
      source: 'collaborator.rhCategoria',
    };
  }
  if (category === SUPPORT_CATEGORY || /apoio cl[ií]nico/i.test(category)) {
    return {
      roleType: COLLABORATOR_ROLE_TYPE.CLINICAL_SUPPORT,
      isClinicalProfessional: false,
      requiresProfessionalRegistration: false,
      source: 'collaborator.rhCategoria',
    };
  }
  if (category) {
    return {
      roleType: COLLABORATOR_ROLE_TYPE.ADMINISTRATIVE,
      isClinicalProfessional: false,
      requiresProfessionalRegistration: false,
      source: 'collaborator.rhCategoria',
    };
  }
  return {
    roleType: COLLABORATOR_ROLE_TYPE.CLINICAL_PROFESSIONAL,
    isClinicalProfessional: true,
    requiresProfessionalRegistration: true,
    source: 'legacy_unspecified_role',
  };
}

export function parseProfessionalCouncilRegistration(source = {}, hints = {}) {
  const raw = pickNonEmpty(
    source.cro,
    source.registroProfissional,
    source.conselhoNumero,
    source.conselho_numero,
    source.professionalRegistration,
    source.councilNumber,
    hints.raw,
  );
  const ufHint = pickNonEmpty(
    source.conselhoUf,
    source.croUf,
    source.ufConselho,
    hints.uf,
  ).toUpperCase();
  const councilHint = pickNonEmpty(source.conselhoNome, source.council, hints.council).toUpperCase();
  const structured = /^CRO[\s\-\/]*([A-Z]{2})[\s\-\/]*([0-9.]+)$/i.exec(raw)
    || /^([A-Z]{2})[\s\-\/]+([0-9.]+)$/i.exec(raw);
  const council = councilHint || (structured || /^CRO/i.test(raw) ? 'CRO' : '');
  const uf = (structured ? structured[1] : ufHint).toUpperCase();
  const number = String(structured ? structured[2] : raw).replace(/\D/g, '');
  const valid = Boolean(number);
  let display = '';
  if (valid) {
    const pretty = number.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    display = uf ? `CRO-${uf} ${pretty}` : `${council || 'CRO'} ${pretty}`;
  }
  return {
    council: council || (valid ? 'CRO' : ''),
    councilUf: uf,
    registration: number,
    display,
    raw,
    valid,
  };
}

export function formatCollaboratorDisplayName(collaborator, { fallback = '' } = {}) {
  const name = collaboratorDisplayName(collaborator);
  if (!name) return fallback;
  const role = classifyCollaboratorRole(collaborator);
  if (role.isClinicalProfessional) return `Dr(a). ${name}`;
  return name;
}

function identityFromCollaborator(collaborator, source, tenantId) {
  const role = classifyCollaboratorRole(collaborator);
  const parsed = parseProfessionalCouncilRegistration(collaborator || {});
  return {
    collaboratorId: collaborator?.id || null,
    displayName: collaboratorDisplayName(collaborator),
    roleType: role.roleType,
    isClinicalProfessional: role.isClinicalProfessional,
    requiresProfessionalRegistration: role.requiresProfessionalRegistration,
    council: parsed.council,
    councilUf: parsed.councilUf,
    registration: parsed.registration,
    registrationDisplay: parsed.display,
    source,
    tenantId: normalizeTenantId(collaborator?.tenant_id || collaborator?.tenantId || tenantId),
    classificationSource: role.source,
  };
}

function firstExplicitClinicalId(appointment, clinical) {
  return pickNonEmpty(
    appointment?.clinicalProfessionalId,
    appointment?.treatingDentistId,
    clinical?.clinicalProfessionalId,
    clinical?.treatingDentistId,
  );
}

/**
 * Precedência:
 * 1. clinicalProfessionalId / treatingDentistId explícito (se clínico)
 * 2. appointment.professionalId somente se o colaborador for clínico
 * 3. ausente — RT institucional NÃO entra aqui
 */
export function resolveClinicalProfessionalIdentity({
  appointmentId = null,
  appointment = null,
  tenantId = null,
  db = null,
} = {}) {
  const database = db || loadDb();
  const expectedTenant = normalizeTenantId(
    tenantId || database.clinicProfile?.tenant_id || database.clinicProfile?.tenantId,
  );
  const appt = appointment
    || (database.appointments || []).find((row) => row.id === appointmentId)
    || null;
  const clinical = (database.clinicalAppointments || []).find((row) => (
    row.appointmentId === (appointmentId || appt?.id)
  )) || null;
  const collaborators = database.collaborators || [];

  const operatorId = pickNonEmpty(
    appt?.professionalId,
    clinical?.professionalId,
    clinical?.budget?.professionalId,
  );
  const operatorRow = findTenantScopedCollaborator(collaborators, operatorId, expectedTenant);
  const operator = operatorRow
    ? identityFromCollaborator(operatorRow, CLINICAL_PROFESSIONAL_SOURCE.APPOINTMENT_IF_CLINICAL, expectedTenant)
    : null;

  const explicitId = firstExplicitClinicalId(appt, clinical);
  const explicitRow = findTenantScopedCollaborator(collaborators, explicitId, expectedTenant);
  const explicitIdentity = explicitRow
    ? identityFromCollaborator(explicitRow, CLINICAL_PROFESSIONAL_SOURCE.EXPLICIT_CLINICAL_ID, expectedTenant)
    : null;

  let clinicalProfessional = null;
  let source = CLINICAL_PROFESSIONAL_SOURCE.ABSENT;
  if (explicitIdentity?.isClinicalProfessional) {
    clinicalProfessional = explicitIdentity;
    source = CLINICAL_PROFESSIONAL_SOURCE.EXPLICIT_CLINICAL_ID;
  } else if (operator?.isClinicalProfessional) {
    clinicalProfessional = operator;
    source = CLINICAL_PROFESSIONAL_SOURCE.APPOINTMENT_IF_CLINICAL;
  }

  return {
    tenantId: expectedTenant,
    operator,
    clinicalProfessional,
    source,
    collaboratorId: clinicalProfessional?.collaboratorId || null,
    displayName: clinicalProfessional?.displayName || '',
    roleType: clinicalProfessional?.roleType || operator?.roleType || COLLABORATOR_ROLE_TYPE.UNKNOWN,
    isClinicalProfessional: Boolean(clinicalProfessional?.isClinicalProfessional),
    requiresProfessionalRegistration: Boolean(clinicalProfessional?.requiresProfessionalRegistration),
    council: clinicalProfessional?.council || '',
    councilUf: clinicalProfessional?.councilUf || '',
    registration: clinicalProfessional?.registration || '',
    registrationDisplay: clinicalProfessional?.registrationDisplay || '',
  };
}

export function evaluateClinicalProfessionalReadinessGate(identity, {
  requireClinicalProfessional = true,
} = {}) {
  const clinical = identity?.clinicalProfessional || null;
  if (clinical?.isClinicalProfessional) {
    if (clinical.requiresProfessionalRegistration && !clinical.registration) {
      return {
        code: PROFESSIONAL_READINESS_GATE.MISSING_REGISTRATION,
        blocking: true,
        ctaCollaboratorId: clinical.collaboratorId,
        label: `Registro profissional de ${clinical.displayName || 'profissional clínico'} não informado.`,
      };
    }
    return {
      code: PROFESSIONAL_READINESS_GATE.OK,
      blocking: false,
      ctaCollaboratorId: clinical.collaboratorId,
      label: '',
    };
  }
  if (!requireClinicalProfessional) {
    return {
      code: PROFESSIONAL_READINESS_GATE.OK,
      blocking: false,
      ctaCollaboratorId: null,
      label: '',
    };
  }
  return {
    code: PROFESSIONAL_READINESS_GATE.MISSING_CLINICAL,
    blocking: true,
    ctaCollaboratorId: null,
    label: 'Defina o profissional clínico responsável pelo atendimento.',
  };
}
