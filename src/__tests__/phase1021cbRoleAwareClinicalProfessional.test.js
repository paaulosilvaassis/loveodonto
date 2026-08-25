/**
 * PHASE_10.21CB — role-aware clinical professional + CRO gate.
 * Sem gerar contrato real, sem e-mail, sem assinatura de produção.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { DEFAULT_CONTRACT_SETTINGS } from '../contracts/contractConstants.js';
import { INITIAL_GENERATED_CONTRACT_VERSION } from '../contracts/generatedContractVersion.js';
import {
  COLLABORATOR_ROLE_TYPE,
  CLINICAL_PROFESSIONAL_SOURCE,
  PROFESSIONAL_READINESS_GATE,
  classifyCollaboratorRole,
  formatCollaboratorDisplayName,
  parseProfessionalCouncilRegistration,
  resolveClinicalProfessionalIdentity,
  evaluateClinicalProfessionalReadinessGate,
  findTenantScopedCollaborator,
} from '../contracts/clinicalProfessionalIdentity.js';
import { resolveClinicTechnicalResponsible } from '../contracts/clinicTechnicalResponsible.js';
import {
  enrichContractReadinessChecklist,
  buildContractPrerequisiteResolutionCards,
  PROFESSIONAL_GATE_TAGS,
} from '../contracts/contractPrerequisitesResolution.js';
import { resolveRequiredSigners, CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-cb-clinic';
const OTHER_TENANT = 'tenant-cb-other';

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function adminCol(overrides = {}) {
  return {
    id: 'col-admin-cb',
    tenant_id: TENANT,
    nomeCompleto: 'Operador Administrativo',
    rhCategoria: 'Diretoria e Gestão',
    cargo: 'Sócio',
    registroProfissional: '',
    conselhoNome: '',
    conselhoUf: '',
    status: 'ativo',
    ...overrides,
  };
}

function dentistCol(overrides = {}) {
  return {
    id: 'col-dentist-cb',
    tenant_id: TENANT,
    nomeCompleto: 'Dentista Clínica',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Cirurgião-Dentista',
    registroProfissional: '27267',
    conselhoNome: 'CRO',
    conselhoUf: 'MG',
    status: 'ativo',
    ...overrides,
  };
}

function seedClinic({
  professionalId = 'col-admin-cb',
  clinicalProfessionalId = null,
  collaborators = [adminCol(), dentistCol()],
  rtName = 'Responsável Técnica',
  rtCro = 'CRO-MG 27267',
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clínica CB' }, { id: OTHER_TENANT, name: 'Outra' }];
    db.clinicProfile = { id: 'clinic-cb', tenant_id: TENANT, razaoSocial: 'Clínica CB' };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: rtName,
      croResponsavelTecnico: rtCro,
    };
    db.collaborators = collaborators;
    db.appointments = [{
      id: 'appt-cb',
      patientId: 'pat-cb',
      professionalId,
      clinicalProfessionalId,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      appointmentId: 'appt-cb',
      patientId: 'pat-cb',
      budget: {
        id: 'budget-cb',
        status: BUDGET_STATUS.APROVADO,
        planName: 'Profilaxia',
        procedures: [{ name: 'Profilaxia', quantity: 1, unitValue: 150 }],
      },
    }];
    db.contractSettings = [{
      clinicId: 'clinic-cb',
      settings: { ...DEFAULT_CONTRACT_SETTINGS, requireResponsibleProfessional: true },
    }];
    return db;
  });
}

function baseChecklist() {
  return {
    ok: true,
    canGenerate: true,
    partyLabel: 'Paciente sem responsável',
    warnings: [],
    requiredTcles: [],
    groups: {
      clinica: [], paciente: [], dependente: [], responsavel: [], profissional: [],
      contrato: [], financeiro: [], tcle: [], lgpd: [], template: [],
    },
    missing: [],
  };
}

describe('PHASE_10.21CB role-aware clinical professional', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A) admin como appointment.professionalId não exige CRO', () => {
    seedClinic();
    const identity = resolveClinicalProfessionalIdentity({
      appointmentId: 'appt-cb',
      tenantId: TENANT,
    });
    expect(identity.operator?.roleType).toBe(COLLABORATOR_ROLE_TYPE.ADMINISTRATIVE);
    expect(identity.clinicalProfessional).toBeNull();
    expect(identity.requiresProfessionalRegistration).toBe(false);
    const gate = evaluateClinicalProfessionalReadinessGate(identity);
    expect(gate.code).toBe(PROFESSIONAL_READINESS_GATE.MISSING_CLINICAL);
    const enriched = enrichContractReadinessChecklist(baseChecklist(), {
      professionalGate: gate.code,
      professionalId: gate.ctaCollaboratorId,
      requiresProfessionalRegistration: false,
    });
    const labels = (enriched.groups.profissional || []).map((item) => item.label).join(' ');
    expect(labels).toContain('Defina o profissional clínico responsável pelo atendimento.');
    expect(labels).not.toMatch(/CRO do profissional responsável não informado/i);
    expect(labels).not.toMatch(/Operador Administrativo/);
  });

  it('B) admin não recebe prefixo Dr(a.)', () => {
    expect(formatCollaboratorDisplayName(adminCol())).toBe('Operador Administrativo');
    expect(formatCollaboratorDisplayName(dentistCol())).toBe('Dr(a). Dentista Clínica');
  });

  it('C) dentista com CRO → gate PASS', () => {
    seedClinic({ professionalId: 'col-dentist-cb' });
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: 'appt-cb', tenantId: TENANT });
    expect(identity.isClinicalProfessional).toBe(true);
    expect(identity.registration).toBe('27267');
    const gate = evaluateClinicalProfessionalReadinessGate(identity);
    expect(gate.code).toBe(PROFESSIONAL_READINESS_GATE.OK);
    const enriched = enrichContractReadinessChecklist(baseChecklist(), {
      professionalGate: gate.code,
      professionalId: gate.ctaCollaboratorId,
      professionalCro: identity.registration,
      requiresProfessionalRegistration: true,
    });
    expect(enriched.canGenerate).toBe(true);
    expect(enriched.groups.profissional).toEqual([]);
  });

  it('D) dentista sem CRO → BLOCK com nome', () => {
    seedClinic({
      professionalId: 'col-dentist-cb',
      collaborators: [adminCol(), dentistCol({ registroProfissional: '', conselhoUf: 'MG' })],
    });
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: 'appt-cb', tenantId: TENANT });
    const gate = evaluateClinicalProfessionalReadinessGate(identity);
    expect(gate.code).toBe(PROFESSIONAL_READINESS_GATE.MISSING_REGISTRATION);
    expect(gate.label).toBe('Registro profissional de Dentista Clínica não informado.');
    const cards = buildContractPrerequisiteResolutionCards({
      checklist: enrichContractReadinessChecklist(baseChecklist(), {
        professionalGate: gate.code,
        professionalId: gate.ctaCollaboratorId,
        clinicalProfessionalName: identity.displayName,
        requiresProfessionalRegistration: true,
      }),
      appointmentId: 'appt-cb',
      professionalId: gate.ctaCollaboratorId,
    });
    const professional = cards.cards.find((card) => card.group === 'profissional');
    expect(professional?.items[0]?.label).toContain('Dentista Clínica');
    expect(professional?.destination?.ctaLabel).toBe('Corrigir dados do profissional');
    expect(professional?.destination?.href).toContain('collaboratorId=col-dentist-cb');
  });

  it('E/F) CRO da RT não é copiado para admin e RT permanece separada', () => {
    seedClinic();
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: 'appt-cb', tenantId: TENANT });
    expect(identity.operator?.registration).toBe('');
    expect(identity.clinicalProfessional).toBeNull();
    const rt = resolveClinicTechnicalResponsible({
      responsavelTecnico: 'Responsável Técnica',
      croResponsavelTecnico: 'CRO-MG 27267',
    });
    expect(rt.name).toBe('Responsável Técnica');
    expect(rt.cro).toBe('CRO-MG 27267');
    expect(identity.operator?.registration).not.toBe('27267');
  });

  it('G) signer PROFESSIONAL não usa admin', () => {
    seedClinic();
    const resolved = resolveRequiredSigners({
      tenantId: TENANT,
      patientId: 'pat-cb',
      appointmentId: 'appt-cb',
      budgetId: 'budget-cb',
    });
    const professional = resolved.requiredSigners.find((s) => s.role === CLINICAL_SIGNER_ROLE.PROFESSIONAL);
    expect(professional?.personId).not.toBe('col-admin-cb');
    expect(resolved.blockers.some((b) => b.code === 'PROFESSIONAL_MISSING')).toBe(true);
    expect(resolved.blockers.some((b) => b.code === 'PROFESSIONAL_CRO_MISSING')).toBe(false);
  });

  it('H) clinicalProfessionalId explícito tem precedência', () => {
    seedClinic({
      professionalId: 'col-admin-cb',
      clinicalProfessionalId: 'col-dentist-cb',
    });
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: 'appt-cb', tenantId: TENANT });
    expect(identity.source).toBe(CLINICAL_PROFESSIONAL_SOURCE.EXPLICIT_CLINICAL_ID);
    expect(identity.collaboratorId).toBe('col-dentist-cb');
    expect(identity.operator?.collaboratorId).toBe('col-admin-cb');
    expect(evaluateClinicalProfessionalReadinessGate(identity).code).toBe(PROFESSIONAL_READINESS_GATE.OK);
  });

  it('I) appointment.professionalId dentista pode ser usado', () => {
    seedClinic({ professionalId: 'col-dentist-cb' });
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: 'appt-cb', tenantId: TENANT });
    expect(identity.source).toBe(CLINICAL_PROFESSIONAL_SOURCE.APPOINTMENT_IF_CLINICAL);
    expect(identity.collaboratorId).toBe('col-dentist-cb');
  });

  it('J/K) ausência de dentista → mensagem e CTA sem abrir cadastro do admin', () => {
    seedClinic();
    const gate = evaluateClinicalProfessionalReadinessGate(
      resolveClinicalProfessionalIdentity({ appointmentId: 'appt-cb', tenantId: TENANT }),
    );
    const cards = buildContractPrerequisiteResolutionCards({
      checklist: enrichContractReadinessChecklist(baseChecklist(), {
        professionalGate: gate.code,
        professionalId: gate.ctaCollaboratorId,
      }),
      appointmentId: 'appt-cb',
      professionalId: 'col-admin-cb',
    });
    const professional = cards.cards.find((card) => card.group === 'profissional');
    expect(professional?.items[0]?.tag).toBe(PROFESSIONAL_GATE_TAGS.MISSING_CLINICAL);
    expect(professional?.destination?.ctaLabel).toBe('Definir profissional clínico');
    expect(professional?.destination?.action).toBe('assign_clinical_professional');
    expect(professional?.destination?.mode).toBe('assign_clinical_modal');
    expect(String(professional?.destination?.href || '')).not.toContain('/admin/colaboradores');
    expect(professional?.destination?.href).toBeNull();
    expect(professional?.destination?.professionalId).toBeNull();
  });

  it('L) tenant isolation: não usa colaborador de outra clínica', () => {
    seedClinic({
      collaborators: [
        adminCol(),
        dentistCol({ id: 'col-dentist-cb', tenant_id: OTHER_TENANT }),
      ],
      professionalId: 'col-dentist-cb',
    });
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: 'appt-cb', tenantId: TENANT });
    expect(identity.clinicalProfessional).toBeNull();
    expect(findTenantScopedCollaborator(
      [dentistCol({ tenant_id: OTHER_TENANT })],
      'col-dentist-cb',
      TENANT,
    )).toBeNull();
  });

  it('M) writer BZ version=1 permanece no código', () => {
    expect(INITIAL_GENERATED_CONTRACT_VERSION).toBe(1);
    expect(readSrc('src/services/contractService.js')).toContain('version: INITIAL_GENERATED_CONTRACT_VERSION');
  });

  it('N/O/P) este módulo não cria contrato, assinatura ou e-mail', () => {
    const src = readSrc('src/contracts/clinicalProfessionalIdentity.js');
    expect(src).not.toMatch(/createContractDraft|sendContractForSignature|resend|nodemailer/);
    expect(classifyCollaboratorRole(adminCol()).requiresProfessionalRegistration).toBe(false);
    expect(classifyCollaboratorRole(dentistCol()).requiresProfessionalRegistration).toBe(true);
  });

  it('normaliza formatos de CRO sem emprestar identidade', () => {
    expect(parseProfessionalCouncilRegistration({ registroProfissional: 'CRO-MG 27267' })).toMatchObject({
      council: 'CRO',
      councilUf: 'MG',
      registration: '27267',
    });
    expect(parseProfessionalCouncilRegistration({ cro: 'CRO/MG 27267' }).registration).toBe('27267');
    expect(parseProfessionalCouncilRegistration({ registroProfissional: '27267', conselhoUf: 'MG' }).display).toBe('CRO-MG 27.267');
  });

  it('header da agenda não prefixa Dr(a). cegamente', () => {
    const page = readSrc('src/pages/ClinicalAppointmentPage.jsx');
    expect(page).toContain('formatCollaboratorDisplayName(professional');
    expect(page).not.toMatch(/Dr\(a\)\.\s*\{professional/);
  });
});
