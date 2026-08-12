/**
 * PHASE_10.21Z — Regressão: CTA "Criar novo orçamento" sem appointmentId ativo.
 * Causa raiz classificada: I (appointmentId ausente).
 * Fix: ensureActiveClinicalAppointmentId cria/promove sessão clínica.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import {
  findActiveClinicalAppointmentId,
  ensureActiveClinicalAppointmentId,
  startNewBudgetForPatient,
  createNewBudget,
} from '../services/clinicalBudgetHubService.js';
import { getBudget } from '../services/clinicalService.js';
import { ensureStagingFictionalPriceBase } from '../domain/contracts/staging/ensureStagingFictionalPriceBase.js';

const TENANT = 'tenant-1021z';
const PATIENT_ID = 'patient-1021z-fake';
const USER = {
  id: 'user-1021z',
  role: 'admin',
  tenant_id: TENANT,
  collaboratorId: 'col-1021z',
};

describe('PHASE_10.21Z — create budget CTA without active appointment', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    withDb((db) => {
      db.tenants = [{ id: TENANT, name: 'Clinic 1021Z' }];
      db.collaborators = [{
        id: 'col-1021z',
        nomeCompleto: 'Dr Teste 1021Z',
        active: true,
        tenant_id: TENANT,
      }];
      db.rooms = [{ id: 'room-1', name: 'Consultório 1', active: true }];
      db.patients = [{
        id: PATIENT_ID,
        full_name: 'TESTE PACKAGE MANIFEST 1021Z',
        tenant_id: TENANT,
      }];
      db.appointments = [];
      db.clinicalAppointments = [];
      return db;
    });
  });

  afterEach(() => {
    resetDb();
  });

  it('ensureActiveClinicalAppointmentId cria EM_ATENDIMENTO quando não há sessão', () => {
    expect(findActiveClinicalAppointmentId(PATIENT_ID)).toBeNull();
    const appointmentId = ensureActiveClinicalAppointmentId(USER, PATIENT_ID);
    expect(appointmentId).toBeTruthy();
    const apt = loadDb().appointments.find((a) => a.id === appointmentId);
    expect(apt.status).toBe(APPOINTMENT_STATUS.EM_ATENDIMENTO);
    expect(apt.patientId).toBe(PATIENT_ID);
    expect(apt.tenant_id).toBe(TENANT);
    expect(findActiveClinicalAppointmentId(PATIENT_ID)).toBe(appointmentId);
  });

  it('ensureActiveClinicalAppointmentId promove agendamento do dia', () => {
    const existingId = 'appt-1021z-waiting';
    withDb((db) => {
      db.appointments.push({
        id: existingId,
        patientId: PATIENT_ID,
        professionalId: 'col-1021z',
        roomId: 'room-1',
        date: new Date().toISOString().slice(0, 10),
        startTime: '09:00',
        endTime: '09:30',
        status: APPOINTMENT_STATUS.EM_ESPERA,
        tenant_id: TENANT,
      });
      return db;
    });
    const appointmentId = ensureActiveClinicalAppointmentId(USER, PATIENT_ID);
    expect(appointmentId).toBe(existingId);
    expect(loadDb().appointments.find((a) => a.id === existingId).status)
      .toBe(APPOINTMENT_STATUS.EM_ATENDIMENTO);
  });

  it('startNewBudgetForPatient conclui sem InactiveClinicalSessionError quando não há sessão prévia', () => {
    let result;
    expect(() => {
      result = startNewBudgetForPatient(USER, PATIENT_ID);
    }).not.toThrow();
    expect(result.appointmentId).toBeTruthy();
    const budget = getBudget(result.appointmentId);
    expect(budget).toBeTruthy();
  });

  it('createNewBudget navega para atendimento-clinico (não para jornada)', () => {
    const navigate = vi.fn();
    const result = createNewBudget(navigate, USER, PATIENT_ID);
    expect(result.appointmentId).toBeTruthy();
    expect(navigate).toHaveBeenCalledTimes(1);
    const [path, opts] = navigate.mock.calls[0];
    expect(path).toBe(`/atendimento-clinico/${result.appointmentId}`);
    expect(path).not.toMatch(/jornada-do-paciente/);
    expect(opts?.state?.section).toBe('planejamento');
  });

  it('falha com feedback claro se não há profissional', () => {
    withDb((db) => {
      db.collaborators = [];
      return db;
    });
    const userSemProf = { ...USER, collaboratorId: null };
    expect(() => ensureActiveClinicalAppointmentId(userSemProf, PATIENT_ID))
      .toThrow(/profissional disponível/i);
  });
});

describe('PHASE_10.21Z — staging fictional price base seed (fail-closed)', () => {
  beforeEach(async () => {
    await initDb();
    resetDb();
    withDb((db) => {
      db.priceTables = [];
      db.priceTableProcedures = [];
      return db;
    });
  });

  afterEach(() => {
    resetDb();
  });

  it('não seeda quando staging test mode está off', () => {
    const result = ensureStagingFictionalPriceBase();
    expect(result.seeded).toBe(false);
    expect(result.reason).toBe('staging_test_mode_off');
    expect(loadDb().priceTableProcedures || []).toHaveLength(0);
  });
});
