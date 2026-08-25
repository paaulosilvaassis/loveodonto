/**
 * SSOT de signatários da cerimônia clínica.
 * Reutiliza SIGNATURE_SIGNER_ROLES (V2) — sem taxonomia paralela.
 */

import { loadDb } from '../db/index.js';
import { getPatient } from '../services/patientService.js';
import { detectAllTreatmentTypes } from '../components/clinical/contract/detectTreatmentType.js';
import { resolveRequiredTcles } from './contractTcleRegistry.js';
import { detectPartyModel } from './contractVariableResolver.js';
import { DEFAULT_CONTRACT_SETTINGS } from './contractConstants.js';
import { resolvePatientFullName } from '../utils/patientIdentity.js';
import { resolveAttendingProfessionalCro } from './clinicTechnicalResponsible.js';
import { resolveClinicalProfessionalIdentity } from './clinicalProfessionalIdentity.js';
import { resolveContractForSelectedBudget } from './resolveContractForSelectedBudget.js';
import { normalizeTenantId } from '../services/tenantIsolation.js';

export const CLINICAL_SIGNER_ROLE = {
  PATIENT: 'PATIENT',
  LEGAL_GUARDIAN: 'LEGAL_GUARDIAN',
  FINANCIAL_RESPONSIBLE: 'FINANCIAL_RESPONSIBLE',
  PROFESSIONAL: 'PROFESSIONAL',
  CLINIC_REPRESENTATIVE: 'CLINIC_REPRESENTATIVE',
  WITNESS: 'WITNESS',
};

export const CLINICAL_SIGNER_ROLE_LABELS = {
  PATIENT: 'Paciente',
  LEGAL_GUARDIAN: 'Responsável legal',
  FINANCIAL_RESPONSIBLE: 'Responsável financeiro',
  PROFESSIONAL: 'Profissional responsável',
  CLINIC_REPRESENTATIVE: 'Responsável técnico',
  WITNESS: 'Testemunha',
};

export const CLINICAL_SIGNING_ORDER = {
  ANY_ORDER: 'ANY_ORDER',
  SEQUENTIAL: 'SEQUENTIAL',
};

export const CEREMONY_VERSION = 'clinical_ms_v1';

function normalizeCro(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function readSettings() {
  const db = loadDb();
  const cid = db.clinicProfile?.id;
  const row = (db.contractSettings || []).find((s) => !cid || s.clinicId === cid) || (db.contractSettings || [])[0];
  return { ...DEFAULT_CONTRACT_SETTINGS, ...(row?.settings || {}) };
}

function profileOf(patientId) {
  if (!patientId) return {};
  const row = (loadDb().patients || []).find((p) => p.id === patientId) || {};
  let bundle = null;
  try {
    bundle = getPatient(patientId);
  } catch {
    bundle = null;
  }
  return { ...row, ...(bundle?.profile || {}) };
}

function treatingDentist(appointmentId, tenantId) {
  const identity = resolveClinicalProfessionalIdentity({ appointmentId, tenantId });
  const clinical = identity.clinicalProfessional;
  if (!clinical) {
    return {
      personId: null,
      name: '',
      cro: '',
      uf: '',
      tenantId: identity.tenantId || tenantId || null,
      source: identity.source,
    };
  }
  return {
    personId: clinical.collaboratorId,
    name: normalizeName(clinical.displayName),
    cro: String(clinical.registration || clinical.registrationDisplay || '').trim(),
    uf: String(clinical.councilUf || '').trim(),
    tenantId: clinical.tenantId || identity.tenantId || tenantId || null,
    source: clinical.source,
  };
}

function technicalResponsible() {
  const db = loadDb();
  const doc = db.clinicDocumentation || {};
  const name = normalizeName(doc.responsavelTecnico || doc.responsavel_tecnico || '');
  const cro = String(doc.croResponsavelTecnico || doc.conselhoRegionalNumero || '').trim();
  const expectedTenant = normalizeTenantId(db.clinicProfile?.tenant_id || db.clinicProfile?.tenantId);
  const collaborators = db.collaborators || [];
  const croNorm = normalizeCro(cro);
  const linked = collaborators.find((c) => {
    const rowTenant = normalizeTenantId(c.tenant_id || c.tenantId);
    if (expectedTenant && rowTenant && rowTenant !== expectedTenant) return false;
    const cCro = normalizeCro(resolveAttendingProfessionalCro(c));
    return croNorm && cCro && cCro === croNorm;
  }) || null;
  return {
    personId: linked?.id || null,
    name,
    cro,
    uf: String(doc.ufConselho || '').trim(),
    source: 'clinicDocumentation.responsavelTecnico',
  };
}

function sameProfessionalPerson(a, b) {
  if (!a || !b) return false;
  if (a.personId && b.personId && a.personId === b.personId) return true;
  const croA = normalizeCro(a.cro);
  const croB = normalizeCro(b.cro);
  return Boolean(croA && croB && croA === croB);
}

export function getDocumentSignerRules({
  tcleApplicable = false,
  tcleRequired = false,
  settings = readSettings(),
  overrides = {},
} = {}) {
  const requireProfessional = overrides.requireResponsibleProfessional
    ?? settings.requireResponsibleProfessional
    ?? true;
  const requireRt = overrides.requireTechnicalResponsible
    ?? settings.requireTechnicalResponsible
    ?? false;
  const requireWitness = overrides.requireWitness ?? settings.requireWitness ?? false;
  const lgpdRequired = settings.lgpdRequired !== false;
  const imageRequired = Boolean(settings.imageUseRequired);

  return {
    CONTRACT_SERVICES: {
      [CLINICAL_SIGNER_ROLE.PATIENT]: true,
      [CLINICAL_SIGNER_ROLE.PROFESSIONAL]: Boolean(requireProfessional),
      [CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE]: Boolean(requireRt),
      [CLINICAL_SIGNER_ROLE.WITNESS]: Boolean(requireWitness),
    },
    TCLE: {
      [CLINICAL_SIGNER_ROLE.PATIENT]: Boolean(tcleRequired && tcleApplicable),
      [CLINICAL_SIGNER_ROLE.PROFESSIONAL]: Boolean(tcleRequired && tcleApplicable && requireProfessional),
      [CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE]: false,
    },
    LGPD: {
      [CLINICAL_SIGNER_ROLE.PATIENT]: lgpdRequired,
    },
    IMAGE_USE: {
      [CLINICAL_SIGNER_ROLE.PATIENT]: imageRequired,
    },
  };
}

function unionRequiredRoles(rules) {
  const required = new Set();
  for (const spec of Object.values(rules)) {
    for (const [role, isRequired] of Object.entries(spec)) {
      if (isRequired) required.add(role);
    }
  }
  return required;
}

function documentsForRole(rules, role) {
  return Object.entries(rules)
    .filter(([, spec]) => spec[role])
    .map(([docType]) => docType);
}

/**
 * @returns {{ requiredSigners: Array, blockers: Array, signingOrder: string, rules: object, identity: object }}
 */
export function resolveRequiredSigners({
  tenantId = null,
  patientId = null,
  appointmentId = null,
  budgetId = null,
  contractId = null,
  documentType = null,
} = {}) {
  const db = loadDb();
  const settings = readSettings();
  const blockers = [];
  const expectedTenant = tenantId || db.clinicProfile?.tenant_id || null;
  let contract = null;
  if (contractId) {
    contract = (db.generatedContracts || []).find((c) => c.id === contractId) || null;
  } else if (budgetId) {
    const resolved = resolveContractForSelectedBudget({
      budgetId,
      appointmentId,
      patientId,
      clinicId: db.clinicProfile?.id || null,
    });
    contract = resolved.ok ? resolved.contract : null;
  } else if (appointmentId) {
    contract = (db.generatedContracts || []).find((c) => (
      c.quoteId === appointmentId && (!patientId || c.patientId === patientId)
    )) || null;
  }

  if (contractId && contract && contract.id !== contractId) {
    return failIdentity('Contrato informado não corresponde ao atendimento.');
  }
  if (expectedTenant && contract?.tenant_id && contract.tenant_id !== expectedTenant) {
    return failIdentity('Contrato não pertence a este tenant.');
  }
  if (patientId && contract?.patientId && contract.patientId !== patientId) {
    return failIdentity('Contrato não pertence a este paciente.');
  }
  if (budgetId && contract?.budgetId && contract.budgetId !== budgetId) {
    return failIdentity('Contrato não pertence a este orçamento.');
  }

  const resolvedPatientId = patientId || contract?.patientId || null;
  const profile = profileOf(resolvedPatientId);
  const party = detectPartyModel(profile);
  const clinical = (db.clinicalAppointments || []).find((c) => c.appointmentId === appointmentId) || null;
  const budget = clinical?.budget || null;
  const procedures = budget?.procedures || [];
  const treatmentTypes = detectAllTreatmentTypes({ planName: budget?.planName, procedures });
  const requiredTcles = resolveRequiredTcles(treatmentTypes);
  const tcleApplicable = requiredTcles.length > 0;
  const tcleRequired = tcleApplicable;
  const overrides = contract?.metadata?.signerRules || {};
  const rules = getDocumentSignerRules({ tcleApplicable, tcleRequired, settings, overrides });
  const scopedRules = documentType && rules[documentType] ? { [documentType]: rules[documentType] } : rules;
  const requiredRoles = unionRequiredRoles(scopedRules);
  const signingOrder = overrides.signingOrder || settings.signingOrder || CLINICAL_SIGNING_ORDER.ANY_ORDER;
  const dentist = treatingDentist(appointmentId || contract?.quoteId, expectedTenant);
  const rt = technicalResponsible();
  const mergeDentistRt = sameProfessionalPerson(dentist, rt);

  const signers = [];
  const pushSigner = (slot) => {
    signers.push({
      ...slot,
      label: CLINICAL_SIGNER_ROLE_LABELS[slot.role] || slot.role,
      status: 'pending',
      required: Boolean(slot.required),
    });
  };

  if (requiredRoles.has(CLINICAL_SIGNER_ROLE.PATIENT) || true) {
    pushSigner({
      role: CLINICAL_SIGNER_ROLE.PATIENT,
      personId: resolvedPatientId,
      name: resolvePatientFullName({ profile, patient: profile }) || normalizeName(profile.full_name),
      required: requiredRoles.has(CLINICAL_SIGNER_ROLE.PATIENT),
      signingOrder: 1,
      source: 'patientId',
      documentTypes: documentsForRole(scopedRules, CLINICAL_SIGNER_ROLE.PATIENT),
    });
  }

  const guardianRequired = Boolean(settings.guardianSignatureForMinors && party.isMinor);
  if (guardianRequired || party.hasGuardian) {
    const guardianName = normalizeName(profile.guardian_full_name || profile.legal_guardian_name);
    const guardianId = profile.guardian_patient_id || profile.legal_guardian_id || null;
    if (guardianRequired && !guardianName && !guardianId) {
      blockers.push({
        code: 'LEGAL_RESPONSIBLE_MISSING',
        message: 'Responsável obrigatório ausente.',
        ctaLabel: 'Completar responsável',
        ctaHref: resolvedPatientId ? `/pacientes/${resolvedPatientId}` : '/pacientes',
      });
    }
    if (guardianName || guardianId || guardianRequired) {
      pushSigner({
        role: CLINICAL_SIGNER_ROLE.LEGAL_GUARDIAN,
        personId: guardianId,
        name: guardianName,
        required: guardianRequired,
        signingOrder: 2,
        source: 'patient.guardian',
        documentTypes: documentsForRole(scopedRules, CLINICAL_SIGNER_ROLE.PATIENT),
      });
    }
  }

  if (party.hasFinancialResponsible) {
    const finName = normalizeName(profile.financial_responsible_name || profile.guardian_full_name);
    const finId = profile.financial_responsible_id || null;
    const sameAsGuardian = finId && signers.some((s) => s.role === CLINICAL_SIGNER_ROLE.LEGAL_GUARDIAN && s.personId === finId);
    if (!sameAsGuardian) {
      pushSigner({
        role: CLINICAL_SIGNER_ROLE.FINANCIAL_RESPONSIBLE,
        personId: finId,
        name: finName,
        required: true,
        signingOrder: 3,
        source: 'patient.financial_responsible',
        documentTypes: ['CONTRACT_SERVICES'],
      });
    }
  }

  const professionalRequired = requiredRoles.has(CLINICAL_SIGNER_ROLE.PROFESSIONAL);
  if (professionalRequired || dentist.personId || dentist.name) {
    if (professionalRequired && !dentist.personId) {
      blockers.push({
        code: 'PROFESSIONAL_MISSING',
        message: 'Defina o profissional clínico responsável pelo atendimento.',
        ctaLabel: 'Definir profissional clínico',
        ctaHref: appointmentId
          ? `/atendimento-clinico/${encodeURIComponent(appointmentId)}?section=contratos`
          : null,
        ctaAction: 'assign_clinical_professional',
      });
    } else if (professionalRequired && !dentist.cro) {
      blockers.push({
        code: 'PROFESSIONAL_CRO_MISSING',
        message: dentist.name
          ? `Registro profissional de ${dentist.name} não informado.`
          : 'Registro profissional de profissional clínico não informado.',
        ctaLabel: 'Corrigir dados do profissional',
        ctaHref: dentist.personId
          ? `/admin/colaboradores?tab=profissional&collaboratorId=${encodeURIComponent(dentist.personId)}`
          : '/admin/colaboradores?tab=profissional',
      });
    }
    const rtRequired = requiredRoles.has(CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE);
    const rolesSatisfied = [CLINICAL_SIGNER_ROLE.PROFESSIONAL];
    if (mergeDentistRt && (rtRequired || rt.name)) {
      rolesSatisfied.push(CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE);
    }
    pushSigner({
      role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
      personId: dentist.personId,
      name: dentist.name,
      cro: dentist.cro,
      uf: dentist.uf,
      required: professionalRequired,
      signingOrder: 4,
      source: dentist.source,
      roles: rolesSatisfied,
      documentTypes: [
        ...documentsForRole(scopedRules, CLINICAL_SIGNER_ROLE.PROFESSIONAL),
        ...(rolesSatisfied.includes(CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE)
          ? documentsForRole(scopedRules, CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE)
          : []),
      ],
      dedupedRoles: mergeDentistRt ? rolesSatisfied : [CLINICAL_SIGNER_ROLE.PROFESSIONAL],
    });
  }

  const rtRequired = requiredRoles.has(CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE);
  if (rtRequired && !mergeDentistRt) {
    if (!rt.name) {
      blockers.push({
        code: 'TECHNICAL_RESPONSIBLE_MISSING',
        message: 'Responsável técnico da clínica ausente.',
        ctaLabel: 'Completar responsável técnico',
        ctaHref: '/configuracoes/clinica',
      });
    } else if (!rt.cro) {
      blockers.push({
        code: 'TECHNICAL_RESPONSIBLE_CRO_MISSING',
        message: 'Responsável técnico sem CRO.',
        ctaLabel: 'Completar responsável técnico',
        ctaHref: '/configuracoes/clinica',
      });
    }
    pushSigner({
      role: CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE,
      personId: rt.personId,
      name: rt.name,
      cro: rt.cro,
      required: true,
      signingOrder: 5,
      source: rt.source,
      documentTypes: documentsForRole(scopedRules, CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE),
    });
  }

  const ceremonyWitnesses = contract?.metadata?.signatureCeremony?.witnesses || [];
  const witnessRequired = requiredRoles.has(CLINICAL_SIGNER_ROLE.WITNESS);
  if (witnessRequired && ceremonyWitnesses.length < 1) {
    blockers.push({
      code: 'WITNESS_REQUIRED',
      message: 'Testemunha obrigatória pela configuração do contrato.',
      ctaLabel: 'Adicionar testemunha',
      action: 'add_witness',
    });
  }
  ceremonyWitnesses.forEach((w, idx) => {
    pushSigner({
      role: CLINICAL_SIGNER_ROLE.WITNESS,
      personId: w.personId || `witness-${idx + 1}`,
      name: w.name,
      required: witnessRequired,
      signingOrder: 6 + idx,
      source: 'ceremony.witnesses',
      witnessIndex: idx + 1,
      documentTypes: documentsForRole(scopedRules, CLINICAL_SIGNER_ROLE.WITNESS),
    });
  });

  return {
    requiredSigners: signers,
    blockers,
    signingOrder,
    rules,
    tcleApplicable,
    tcleRequired,
    dentistRtDeduped: Boolean(mergeDentistRt && rtRequired),
    identity: {
      tenantId: expectedTenant,
      patientId: resolvedPatientId,
      appointmentId,
      budgetId: budgetId || contract?.budgetId || budget?.id || null,
      contractId: contract?.id || null,
    },
  };
}

function failIdentity(message) {
  return {
    requiredSigners: [],
    blockers: [{ code: 'IDENTITY', message, ctaLabel: 'Ir para Contrato', ctaSection: 'contratos' }],
    signingOrder: CLINICAL_SIGNING_ORDER.ANY_ORDER,
    rules: {},
    identity: {},
    rejected: true,
  };
}

export function mapLegacySignerRole(role) {
  const raw = String(role || '').toUpperCase();
  if (raw === 'PATIENT') return CLINICAL_SIGNER_ROLE.PATIENT;
  if (raw === 'GUARDIAN' || raw === 'LEGAL_GUARDIAN' || raw === 'LEGAL_RESPONSIBLE') {
    return CLINICAL_SIGNER_ROLE.LEGAL_GUARDIAN;
  }
  if (raw === 'FINANCIAL_RESPONSIBLE') return CLINICAL_SIGNER_ROLE.FINANCIAL_RESPONSIBLE;
  if (raw === 'PROFESSIONAL' || raw === 'TREATING_DENTIST') return CLINICAL_SIGNER_ROLE.PROFESSIONAL;
  if (raw === 'CLINIC' || raw === 'CLINIC_REPRESENTATIVE' || raw === 'TECHNICAL_RESPONSIBLE') {
    return CLINICAL_SIGNER_ROLE.CLINIC_REPRESENTATIVE;
  }
  if (raw === 'WITNESS' || raw === 'WITNESS_1' || raw === 'WITNESS_2') return CLINICAL_SIGNER_ROLE.WITNESS;
  return raw || CLINICAL_SIGNER_ROLE.PATIENT;
}
