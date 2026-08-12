/**
 * PHASE_10.21AA — Regressão: seed staging de pré-requisitos clínicos do contrato.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import {
  ensureStagingFictionalClinicContractPrereqs,
} from '../domain/contracts/staging/ensureStagingFictionalClinicContractPrereqs.js';
import { getClinicForumCityFromDb } from '../components/clinical/contract/buildProfessionalContractContext.js';
import { resolveClinicTechnicalResponsible } from '../contracts/clinicTechnicalResponsible.js';
import { getContractReadinessChecklist } from '../services/contractValidationService.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { createId } from '../services/helpers.js';
import { saveBudget, updateBudgetStatus } from '../services/clinicalService.js';

describe('PHASE_10.21AA — staging clinic contract prereqs seed', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    withDb((db) => {
      db.clinicAddresses = [];
      db.clinicDocumentation = { cnpj: '11222333000181' };
      db.clinicProfile = {
        razaoSocial: 'Clinica Staging LTDA',
        nomeFantasia: 'Staging Clinic',
      };
      db.collaborators = [{
        id: 'col-aa',
        nomeCompleto: 'Dr Smoke',
        active: true,
      }];
      db.priceTables = [];
      db.priceTableProcedures = [];
      return db;
    });
  });

  afterEach(() => {
    resetDb();
  });

  it('fora do staging mode não seeda', () => {
    const result = ensureStagingFictionalClinicContractPrereqs();
    expect(result.seeded).toBe(false);
    expect(result.reason).toBe('staging_test_mode_off');
  });
});

describe('PHASE_10.21AA — canGenerate SSOT after required data', () => {
  const TENANT = 'tenant-1021aa';
  const PATIENT_ID = 'patient-1021aa';
  const APPT_ID = 'appt-1021aa';

  beforeEach(async () => {
    await initDb();
    resetDb();
    withDb((db) => {
      db.tenants = [{ id: TENANT, name: 'AA' }];
      db.clinicProfile = {
        razaoSocial: 'Clinica AA LTDA',
        nomeFantasia: 'AA',
        tenant_id: TENANT,
      };
      db.clinicDocumentation = {
        cnpj: '11222333000181',
        responsavelTecnico: 'Dr. Responsavel AA',
        croResponsavelTecnico: 'CRO-SP 12345',
      };
      db.clinicAddresses = [{
        id: 'addr-aa',
        principal: true,
        logradouro: 'Rua AA',
        numero: '1',
        bairro: 'Centro',
        cidade: 'São Paulo',
        uf: 'SP',
        cep: '01000-000',
      }];
      db.collaborators = [{
        id: 'col-aa',
        nomeCompleto: 'Dr AA',
        cro: 'CRO-SP 111',
        active: true,
        tenant_id: TENANT,
      }];
      db.patients = [{
        id: PATIENT_ID,
        full_name: 'TESTE AA',
        cpf: '39053344705',
        birth_date: '1990-01-15',
        tenant_id: TENANT,
      }];
      db.patientAddresses = [{
        id: 'paddr-aa',
        patient_id: PATIENT_ID,
        street: 'Av Paciente',
        logradouro: 'Av Paciente',
        number: '10',
        numero: '10',
        neighborhood: 'Bairro',
        bairro: 'Bairro',
        city: 'São Paulo',
        cidade: 'São Paulo',
        state: 'SP',
        uf: 'SP',
        cep: '01310-100',
        principal: true,
      }];
      db.appointments = [{
        id: APPT_ID,
        patientId: PATIENT_ID,
        professionalId: 'col-aa',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        date: '2026-08-12',
        tenant_id: TENANT,
      }];
      db.clinicalAppointments = [{
        id: createId('clinical'),
        appointmentId: APPT_ID,
        patientId: PATIENT_ID,
        plannedProcedures: [],
        budgetHistory: [],
      }];
      db.documentRecords = [{
        id: 'doc-aa-tcle',
        patientId: PATIENT_ID,
        appointmentId: APPT_ID,
        category: 'consentimentos',
        templateKey: 'consent_implante',
        metadata: { tcleId: 'tcle_implante' },
      }];
      return db;
    });

    saveBudget({ id: 'user-aa', role: 'admin', tenant_id: TENANT }, APPT_ID, {
      id: createId('budget'),
      status: BUDGET_STATUS.RASCUNHO,
      planName: 'Implante unitário',
      procedures: [{
        id: createId('proc'),
        name: 'Implante unitário',
        quantity: 1,
        unitValue: 3500,
        totalValue: 3500,
      }],
      paymentOptions: [{
        id: createId('pay'),
        label: 'À vista PIX',
        type: 'a_vista',
        total: 3500,
        accepted: true,
        presentToPatient: true,
        presentationStatus: 'escolhida',
      }],
      totalValue: 3500,
      professionalId: 'col-aa',
    });
    updateBudgetStatus({ id: 'user-aa', role: 'admin', tenant_id: TENANT }, APPT_ID, BUDGET_STATUS.APROVADO);
  });

  afterEach(() => {
    resetDb();
  });

  it('forum + responsável técnico resolvem a partir do cadastro da clínica', () => {
    const forum = getClinicForumCityFromDb(loadDb());
    expect(forum.clinicForumCity).toBe('São Paulo - SP');
    const tech = resolveClinicTechnicalResponsible(loadDb().clinicDocumentation, loadDb().clinicProfile);
    expect(tech.name).toMatch(/Responsavel/i);
    expect(tech.cro).toMatch(/12345/);
  });

  it('getContractReadinessChecklist.canGenerate=true com dados + TCLE anexado', () => {
    const checklist = getContractReadinessChecklist({
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      patientId: PATIENT_ID,
      currentUser: { id: 'user-aa', role: 'admin', tenant_id: TENANT, name: 'Dr AA' },
      attachedTcleIds: ['tcle_implante'],
      strict: true,
    });
    expect(checklist.missing.map((m) => m.tag)).toEqual([]);
    expect(checklist.canGenerate).toBe(true);
  });

  it('canGenerate=false quando TCLE falta (sem bypass)', () => {
    const checklist = getContractReadinessChecklist({
      quoteSource: 'clinical_budget',
      quoteId: APPT_ID,
      patientId: PATIENT_ID,
      currentUser: { id: 'user-aa', role: 'admin', tenant_id: TENANT, name: 'Dr AA' },
      attachedTcleIds: [],
      strict: true,
    });
    expect(checklist.canGenerate).toBe(false);
    expect(checklist.groups.tcle.length).toBeGreaterThan(0);
  });
});
