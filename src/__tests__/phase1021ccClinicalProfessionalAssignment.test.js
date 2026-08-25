/**
 * PHASE_10.21CC — fluxo real de atribuição do profissional clínico ao atendimento.
 * Sem mutar dados de produção, sem gerar contrato, sem e-mail, sem assinatura.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { DEFAULT_CONTRACT_SETTINGS } from '../contracts/contractConstants.js';
import {
  CLINICAL_PROFESSIONAL_SOURCE,
  PROFESSIONAL_READINESS_GATE,
  resolveClinicalProfessionalIdentity,
  evaluateClinicalProfessionalReadinessGate,
} from '../contracts/clinicalProfessionalIdentity.js';
import {
  CLINICAL_PROFESSIONAL_SSOT_FIELD,
  BLOCKED_CLINICAL_PROFESSIONAL_NOT_ASSIGNED,
  listEligibleClinicalProfessionals,
  assignClinicalProfessionalToAppointment,
} from '../contracts/clinicalProfessionalAssignment.js';
import {
  enrichContractReadinessChecklist,
  buildContractPrerequisiteResolutionCards,
  PROFESSIONAL_GATE_TAGS,
} from '../contracts/contractPrerequisitesResolution.js';
import { resolveRequiredSigners, CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';
import { resolveContractVariables } from '../contracts/contractVariableResolver.js';
import { resolveClinicTechnicalResponsible } from '../contracts/clinicTechnicalResponsible.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-cc-clinic';
const OTHER_TENANT = 'tenant-cc-other';
const PAULO_ID = 'col-saas-066dcd98-aecf-4886-8947-a439849e37f7';
const JULIANA_ID = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const OTHER_DENTIST_ID = 'col-other-tenant-dentist';
const INACTIVE_DENTIST_ID = 'col-inactive-dentist';
const NO_CRO_DENTIST_ID = 'col-dentist-no-cro';
const APPT_ID = 'appt-cc-clara';
const USER = { id: 'user-cc-paulo', tenantId: TENANT, tenant_id: TENANT };

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function paulo(overrides = {}) {
  return {
    id: PAULO_ID,
    tenant_id: TENANT,
    nomeCompleto: 'Paulo Henrique Silva de Assis',
    rhCategoria: 'Diretoria e Gestão',
    cargo: 'Sócio',
    registroProfissional: '',
    conselhoNome: '',
    conselhoUf: '',
    status: 'ativo',
    ...overrides,
  };
}

function juliana(overrides = {}) {
  return {
    id: JULIANA_ID,
    tenant_id: TENANT,
    nomeCompleto: 'Juliana de Oliveira Freire',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Implantodontista',
    especialidade: 'Implantodontista',
    registroProfissional: '27267',
    conselhoNome: 'CRO',
    conselhoUf: 'MG',
    status: 'ativo',
    ...overrides,
  };
}

function seedClinic({
  professionalId = PAULO_ID,
  clinicalProfessionalId = null,
  collaborators = [
    paulo(),
    juliana(),
    {
      id: INACTIVE_DENTIST_ID,
      tenant_id: TENANT,
      nomeCompleto: 'Dentista Inativo',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Cirurgião-Dentista',
      registroProfissional: '11111',
      conselhoUf: 'MG',
      status: 'inativo',
    },
    {
      id: NO_CRO_DENTIST_ID,
      tenant_id: TENANT,
      nomeCompleto: 'Dentista Sem CRO',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Cirurgião-Dentista',
      registroProfissional: '',
      conselhoUf: 'MG',
      status: 'ativo',
    },
    {
      id: OTHER_DENTIST_ID,
      tenant_id: OTHER_TENANT,
      nomeCompleto: 'Dentista Outro Tenant',
      rhCategoria: 'Corpo Clínico',
      cargo: 'Cirurgião-Dentista',
      registroProfissional: '99999',
      conselhoUf: 'SP',
      status: 'ativo',
    },
    {
      id: 'col-asb-cc',
      tenant_id: TENANT,
      nomeCompleto: 'Auxiliar Clínica',
      rhCategoria: 'Apoio Clínico',
      cargo: 'Auxiliar em Saúde Bucal (ASB)',
      status: 'ativo',
    },
  ],
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Clínica CC' }, { id: OTHER_TENANT, name: 'Outra' }];
    db.clinicProfile = {
      id: 'clinic-cc',
      tenant_id: TENANT,
      razaoSocial: 'Clínica CC',
    };
    db.clinicDocumentation = {
      cnpj: '11222333000181',
      responsavelTecnico: 'Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    };
    db.clinicAddresses = [{
      principal: true,
      logradouro: 'Rua A',
      numero: '100',
      bairro: 'Centro',
      cidade: 'Belo Horizonte',
      uf: 'MG',
      cep: '30100000',
    }];
    db.collaborators = collaborators;
    db.patients = [{
      id: 'pat-cc',
      tenant_id: TENANT,
      full_name: 'Paciente CC',
      cpf: '52998224725',
      birth_date: '1990-05-10',
    }];
    db.appointments = [{
      id: APPT_ID,
      patientId: 'pat-cc',
      professionalId,
      clinicalProfessionalId,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      tenant_id: TENANT,
    }];
    db.clinicalAppointments = [{
      appointmentId: APPT_ID,
      patientId: 'pat-cc',
      budget: {
        id: 'budget-cc',
        status: BUDGET_STATUS.APROVADO,
        planName: 'Profilaxia',
        procedures: [{ name: 'Profilaxia', quantity: 1, unitValue: 150 }],
      },
    }];
    db.contractSettings = [{
      clinicId: 'clinic-cc',
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

describe('PHASE_10.21CC clinical professional assignment', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A) admin operator + clinicalProfessionalId null → BLOCKED_CLINICAL_PROFESSIONAL_NOT_ASSIGNED', () => {
    seedClinic();
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: APPT_ID, tenantId: TENANT });
    expect(identity.operator?.collaboratorId).toBe(PAULO_ID);
    expect(identity.clinicalProfessional).toBeNull();
    const gate = evaluateClinicalProfessionalReadinessGate(identity);
    expect(gate.code).toBe(BLOCKED_CLINICAL_PROFESSIONAL_NOT_ASSIGNED);
    expect(gate.code).toBe(PROFESSIONAL_READINESS_GATE.MISSING_CLINICAL);
    expect(gate.blocking).toBe(true);
    const cards = buildContractPrerequisiteResolutionCards({
      checklist: enrichContractReadinessChecklist(baseChecklist(), {
        professionalGate: gate.code,
        professionalId: gate.ctaCollaboratorId,
      }),
      appointmentId: APPT_ID,
      professionalId: PAULO_ID,
    });
    const professional = cards.cards.find((card) => card.group === 'profissional');
    expect(professional?.items[0]?.tag).toBe(PROFESSIONAL_GATE_TAGS.MISSING_CLINICAL);
    expect(professional?.destination?.mode).toBe('assign_clinical_modal');
    expect(professional?.destination?.action).toBe('assign_clinical_professional');
    expect(professional?.destination?.href).not.toContain('/admin/colaboradores');
  });

  it('B) seletor: Paulo administrativo não aparece; Juliana aparece', () => {
    seedClinic();
    const rows = listEligibleClinicalProfessionals({ tenantId: TENANT });
    const ids = rows.map((row) => row.collaboratorId);
    expect(ids).toContain(JULIANA_ID);
    expect(ids).not.toContain(PAULO_ID);
    expect(ids).not.toContain(INACTIVE_DENTIST_ID);
    expect(ids).not.toContain(NO_CRO_DENTIST_ID);
    expect(ids).not.toContain(OTHER_DENTIST_ID);
    expect(ids).not.toContain('col-asb-cc');
    const chosen = rows.find((row) => row.collaboratorId === JULIANA_ID);
    expect(chosen).toMatchObject({
      name: 'Juliana de Oliveira Freire',
      category: 'Corpo Clínico',
      specialty: 'Implantodontista',
      council: 'CRO',
      registration: '27267',
      councilUf: 'MG',
    });
  });

  it('C/D) selecionar Juliana persiste clinicalProfessionalId e preserva professionalId do operador', () => {
    seedClinic();
    const updated = assignClinicalProfessionalToAppointment(USER, APPT_ID, JULIANA_ID);
    expect(updated[CLINICAL_PROFESSIONAL_SSOT_FIELD]).toBe(JULIANA_ID);
    expect(updated.professionalId).toBe(PAULO_ID);
    expect(updated.dentistId).not.toBe(JULIANA_ID);
    const persisted = (loadDb().appointments || []).find((row) => row.id === APPT_ID);
    expect(persisted.clinicalProfessionalId).toBe(JULIANA_ID);
    expect(persisted.professionalId).toBe(PAULO_ID);
  });

  it('E) readiness após seleção: professional gate PASS', () => {
    seedClinic();
    assignClinicalProfessionalToAppointment(USER, APPT_ID, JULIANA_ID);
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: APPT_ID, tenantId: TENANT });
    const gate = evaluateClinicalProfessionalReadinessGate(identity);
    expect(gate.code).toBe(PROFESSIONAL_READINESS_GATE.OK);
    expect(gate.blocking).toBe(false);
    const enriched = enrichContractReadinessChecklist(baseChecklist(), {
      professionalGate: gate.code,
      professionalId: gate.ctaCollaboratorId,
      professionalCro: identity.registration,
      requiresProfessionalRegistration: true,
    });
    expect(enriched.canGenerate).toBe(true);
    expect(enriched.groups.profissional).toEqual([]);
  });

  it('F) CRO resolvido 27267 / MG; contractVariableResolver usa Juliana', () => {
    seedClinic();
    assignClinicalProfessionalToAppointment(USER, APPT_ID, JULIANA_ID);
    const identity = resolveClinicalProfessionalIdentity({ appointmentId: APPT_ID, tenantId: TENANT });
    expect(identity.collaboratorId).toBe(JULIANA_ID);
    expect(identity.registration).toBe('27267');
    expect(identity.councilUf).toBe('MG');
    const { map } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      patientId: 'pat-cc',
      currentUser: { name: 'Paulo Henrique Silva de Assis', tenantId: TENANT },
    });
    expect(map['#dentistaNomeCompleto']).toBe('Juliana de Oliveira Freire');
    expect(String(map['#dentistaConselhoNumero']).replace(/\D/g, '')).toBe('27267');
    expect(map['#profissional_nome']).toBe('Juliana de Oliveira Freire');
    expect(map['#responsavel_tecnico']).toContain('Juliana');
  });

  it('G/H) signer PROFESSIONAL = Juliana; Paulo não ocupa o slot', () => {
    seedClinic();
    assignClinicalProfessionalToAppointment(USER, APPT_ID, JULIANA_ID);
    const resolved = resolveRequiredSigners({
      tenantId: TENANT,
      patientId: 'pat-cc',
      appointmentId: APPT_ID,
      budgetId: 'budget-cc',
    });
    const professional = resolved.requiredSigners.find((s) => s.role === CLINICAL_SIGNER_ROLE.PROFESSIONAL);
    expect(professional?.personId).toBe(JULIANA_ID);
    expect(professional?.name).toBe('Juliana de Oliveira Freire');
    expect(String(professional?.cro || '').replace(/\D/g, '')).toBe('27267');
    expect(professional?.personId).not.toBe(PAULO_ID);
    expect(resolved.blockers.some((b) => b.code === 'PROFESSIONAL_MISSING')).toBe(false);
  });

  it('I) RT não é fallback automático do profissional clínico', () => {
    seedClinic();
    const before = resolveClinicalProfessionalIdentity({ appointmentId: APPT_ID, tenantId: TENANT });
    expect(before.clinicalProfessional).toBeNull();
    expect(before.source).toBe(CLINICAL_PROFESSIONAL_SOURCE.ABSENT);
    const rt = resolveClinicTechnicalResponsible({
      responsavelTecnico: 'Juliana de Oliveira Freire',
      croResponsavelTecnico: 'CRO-MG 27267',
    });
    expect(rt.name).toContain('Juliana');
    expect(before.collaboratorId).not.toBe(JULIANA_ID);
    const signers = resolveRequiredSigners({
      tenantId: TENANT,
      patientId: 'pat-cc',
      appointmentId: APPT_ID,
      budgetId: 'budget-cc',
    });
    const professional = signers.requiredSigners.find((s) => s.role === CLINICAL_SIGNER_ROLE.PROFESSIONAL);
    expect(professional?.personId).not.toBe(JULIANA_ID);
    expect(signers.blockers.some((b) => b.code === 'PROFESSIONAL_MISSING')).toBe(true);
  });

  it('J) tenant isolation: profissional de outro tenant rejeitado', () => {
    seedClinic();
    expect(() => assignClinicalProfessionalToAppointment(USER, APPT_ID, OTHER_DENTIST_ID))
      .toThrow(/Profissional clínico inválido/i);
    expect(() => assignClinicalProfessionalToAppointment(USER, APPT_ID, PAULO_ID))
      .toThrow(/Profissional clínico inválido/i);
    const persisted = (loadDb().appointments || []).find((row) => row.id === APPT_ID);
    expect(persisted.clinicalProfessionalId).toBeFalsy();
    expect(persisted.professionalId).toBe(PAULO_ID);
  });

  it('CTA do contrato abre modal no atendimento, não Dados da Equipe', () => {
    const section = readSrc('src/components/clinical/ClinicalContractSection.jsx');
    expect(section).toContain('assign_clinical_professional');
    expect(section).toContain('setAssignProfessionalOpen(true)');
    expect(section).toContain('SelectClinicalProfessionalModal');
    expect(section).toContain('assignClinicalProfessionalToAppointment');
    const assignment = readSrc('src/contracts/clinicalProfessionalAssignment.js');
    expect(assignment).toContain("CLINICAL_PROFESSIONAL_SSOT_FIELD = 'clinicalProfessionalId'");
    expect(assignment).not.toMatch(/professionalId:\s*chosenId/);
    expect(assignment).not.toMatch(/createContractDraft|sendContractForSignature|nodemailer/);
    const modal = readSrc('src/components/clinical/SelectClinicalProfessionalModal.jsx');
    expect(modal).toContain('Selecionar profissional clínico');
    expect(modal).toContain('listEligibleClinicalProfessionals');
  });
});
