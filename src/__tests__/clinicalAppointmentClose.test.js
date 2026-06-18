import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { saveBudget, BUDGET_STATUS } from '../services/clinicalService.js';
import {
  APPOINTMENT_CLOSE_REASON,
  closeClinicalAppointment,
  findPendingDecisionBudget,
} from '../services/clinicalAppointmentCloseService.js';

const USER = { id: 'user-test', role: 'admin', name: 'Teste', tenant_id: 'tenant-1' };
const PATIENT_ID = 'patient-1';
const APPOINTMENT_ID = 'apt-close-test';

function seedAppointment() {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: 'tenant-1' };
    db.patients = [{ id: PATIENT_ID, tenant_id: 'tenant-1', full_name: 'Paciente' }];
    db.appointments = [{
      id: APPOINTMENT_ID,
      tenant_id: 'tenant-1',
      patientId: PATIENT_ID,
      status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
      date: new Date().toISOString().slice(0, 10),
      startTime: '10:00',
      endTime: '10:30',
      checkInAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    }];
    db.clinicalAppointments = [{
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      tenant_id: 'tenant-1',
      plannedProcedures: [],
    }];
    return db;
  });
}

describe('clinicalAppointmentCloseService', () => {
  beforeEach(async () => {
    resetDb();
    await initDb();
    seedAppointment();
  });

  it('finaliza atendimento mantendo orçamento em negociação e cria follow-up', () => {
    saveBudget(USER, APPOINTMENT_ID, {
      id: 'budget-close-1',
      status: BUDGET_STATUS.NEGOCIACAO,
      procedures: [{ id: 'p1', name: 'Limpeza', totalValue: 200 }],
      planName: 'Plano teste',
    });

    const result = closeClinicalAppointment(USER, {
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      budgetId: 'budget-close-1',
      reason: APPOINTMENT_CLOSE_REASON.ANALYZE_LATER,
      notes: 'Paciente pediu para pensar',
    });

    const db = loadDb();
    expect(result.appointment.status).toBe(APPOINTMENT_STATUS.FINALIZADO);
    expect(db.clinicalAppointments[0].budget.status).toBe(BUDGET_STATUS.NEGOCIACAO);
    expect(db.clinicalEvents.some((e) => e.type === 'appointment_finished')).toBe(true);
    expect(db.crmTasks.length).toBe(1);
    expect(db.followUps.length).toBe(1);
    expect(findPendingDecisionBudget(PATIENT_ID)?.id).toBe('budget-close-1');
  });

  it('reprova orçamento quando paciente recusa tratamento', () => {
    saveBudget(USER, APPOINTMENT_ID, {
      id: 'budget-refused',
      status: BUDGET_STATUS.ENVIADO,
      procedures: [],
    });

    closeClinicalAppointment(USER, {
      appointmentId: APPOINTMENT_ID,
      patientId: PATIENT_ID,
      budgetId: 'budget-refused',
      reason: APPOINTMENT_CLOSE_REASON.TREATMENT_REFUSED,
      notes: '',
    });

    const db = loadDb();
    expect(db.clinicalAppointments[0].budget.status).toBe(BUDGET_STATUS.REPROVADO);
    expect(db.crmTasks.length).toBe(0);
  });
});
