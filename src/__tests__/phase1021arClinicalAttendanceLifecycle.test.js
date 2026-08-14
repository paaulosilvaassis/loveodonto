/**
 * PHASE_10.21AR — lifecycle Agenda vs Jornada (stale em_atendimento).
 * Sem auto-finalizar. Sem mutar contrato/orçamento/assinatura.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS, finishAppointment } from '../services/appointmentService.js';
import {
  ATTENDANCE_LIFECYCLE,
  getAgendaStatusPresentation,
  resolveClinicalAttendanceState,
  todayLocalIso,
} from '../services/clinicalAttendanceState.js';
import {
  listJourneyEntriesByDate,
  listJourneyOperationalEntries,
} from '../services/journeyEntryService.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER_TENANT = 'tenant-other-ar';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OTHER_PATIENT = 'patient-other-ar';
const APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const CLINICAL = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const CONTRACT = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const USER = { id: 'user-ar', role: 'admin', tenant_id: TENANT, tenantId: TENANT };

function shiftDate(base, days) {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayLocalIso(dt);
}

function seed({
  date,
  status = APPOINTMENT_STATUS.EM_ATENDIMENTO,
  finishedAt = null,
  clinicalStatus = null,
  clinicalFinishedAt = null,
  extraAppointments = [],
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }, { id: OTHER_TENANT, name: 'Outro' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.patients = [
      { id: PATIENT, full_name: 'Paulo Henrique Silva de Assis', tenant_id: TENANT },
      { id: OTHER_PATIENT, full_name: 'Outro Paciente', tenant_id: TENANT },
    ];
    db.collaborators = [{ id: 'col-1', nomeCompleto: 'Juliana', tenant_id: TENANT }];
    db.rooms = [{ id: 'room-1', name: 'Consultório 1', active: true }];
    db.appointments = [
      {
        id: APPT,
        patientId: PATIENT,
        professionalId: 'col-1',
        roomId: 'room-1',
        consultorioId: 'room-1',
        date,
        startTime: '17:30',
        endTime: '18:00',
        status,
        finishedAt,
        startedAt: status === APPOINTMENT_STATUS.EM_ATENDIMENTO ? `${date}T20:30:00.000Z` : null,
        tenant_id: TENANT,
      },
      ...extraAppointments,
    ];
    db.clinicalAppointments = [{
      id: CLINICAL,
      appointmentId: APPT,
      patientId: PATIENT,
      status: clinicalStatus,
      finishedAt: clinicalFinishedAt,
      budget: {
        id: BUDGET,
        budgetNumber: 'ORC-001',
        status: 'CONTRATO_GERADO',
        totalValue: 150,
      },
    }];
    db.generatedContracts = [{
      id: CONTRACT,
      contractNumber: 'CTR-2026-00001',
      status: 'signed',
      budgetId: BUDGET,
      patientId: PATIENT,
      quoteId: APPT,
      tenant_id: TENANT,
      renderedHtml: '<p>histórico</p>',
      metadata: { signatureCeremony: { version: 'clinical_ms_v1' } },
    }];
    db.contractSignatures = [{ id: 'sig-hist', contractId: CONTRACT, signerRole: 'PATIENT', personId: PATIENT }];
  });
}

describe('PHASE_10.21AR clinical attendance lifecycle SSOT', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A) hoje + em_atendimento: Agenda e Jornada ativos, sala ocupada', () => {
    const today = todayLocalIso();
    seed({ date: today });
    const apt = loadDb().appointments[0];
    const state = resolveClinicalAttendanceState({ appointment: apt, asOfDate: today, tenantId: TENANT });
    expect(state.isInAttendance).toBe(true);
    expect(state.isStale).toBe(false);
    expect(state.isRoomOccupied).toBe(true);
    expect(state.displayLabel).toBe('Em atendimento');
    const journey = listJourneyOperationalEntries(today);
    expect(journey.some((row) => row.id === APPT && row.attendance.isInAttendance)).toBe(true);
  });

  it('B/L) ontem ainda aberto não some da Jornada de hoje', () => {
    const today = todayLocalIso();
    const yesterday = shiftDate(today, -1);
    seed({ date: yesterday });
    const byDate = listJourneyEntriesByDate(today);
    expect(byDate.some((row) => row.id === APPT)).toBe(false);
    const operational = listJourneyOperationalEntries(today);
    expect(operational.some((row) => row.id === APPT)).toBe(true);
  });

  it('C) ontem + stale: Agenda indica não encerrado e CTA correto', () => {
    const today = todayLocalIso();
    const yesterday = shiftDate(today, -1);
    seed({ date: yesterday });
    const apt = loadDb().appointments[0];
    const view = getAgendaStatusPresentation(apt, {}, { asOfDate: today, tenantId: TENANT });
    expect(view.isStale).toBe(true);
    expect(view.label).toBe('Atendimento não encerrado');
    expect(view.ctaLabel).toBe('Resolver atendimento');
    expect(view.ctaHref).toBe(`/atendimento-clinico/${APPT}`);
    expect(view.message).toContain('17:30');
    expect(view.isRoomOccupied).toBe(false);
  });

  it('D) finalizado: Agenda/Jornada/room concordam', () => {
    const today = todayLocalIso();
    seed({ date: today, status: APPOINTMENT_STATUS.FINALIZADO, finishedAt: `${today}T18:00:00.000Z` });
    const apt = loadDb().appointments[0];
    const state = resolveClinicalAttendanceState({ appointment: apt, asOfDate: today, tenantId: TENANT });
    expect(state.isFinished).toBe(true);
    expect(state.isInAttendance).toBe(false);
    expect(state.isRoomOccupied).toBe(false);
    expect(state.displayLabel).toBe('Finalizado');
  });

  it('E) clinical finalizado + appointment em_atendimento = inconsistência fail-closed', () => {
    const today = todayLocalIso();
    seed({ date: today, clinicalFinishedAt: `${today}T18:00:00.000Z` });
    const db = loadDb();
    const state = resolveClinicalAttendanceState({
      appointment: db.appointments[0],
      clinicalAppointment: db.clinicalAppointments[0],
      asOfDate: today,
      tenantId: TENANT,
    });
    expect(state.requiresResolution).toBe(true);
    expect(state.reason).toBe('APPOINTMENT_OPEN_CLINICAL_CLOSED');
    expect(state.isRoomOccupied).toBe(false);
  });

  it('F) appointment finalizado + clinical aberto = inconsistência', () => {
    const today = todayLocalIso();
    seed({
      date: today,
      status: APPOINTMENT_STATUS.FINALIZADO,
      finishedAt: `${today}T18:00:00.000Z`,
    });
    const db = loadDb();
    const state = resolveClinicalAttendanceState({
      appointment: db.appointments[0],
      clinicalAppointment: db.clinicalAppointments[0],
      asOfDate: today,
      tenantId: TENANT,
    });
    expect(state.requiresResolution).toBe(true);
    expect(state.reason).toBe('APPOINTMENT_CLOSED_CLINICAL_OPEN');
  });

  it('G) listar duas vezes permanece coerente', () => {
    const today = todayLocalIso();
    const yesterday = shiftDate(today, -1);
    seed({ date: yesterday });
    const first = listJourneyOperationalEntries(today);
    const second = listJourneyOperationalEntries(today);
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(second.find((r) => r.id === APPT).attendance.isStale).toBe(true);
  });

  it('H) isolamento de tenant', () => {
    const today = todayLocalIso();
    seed({
      date: today,
      extraAppointments: [{
        id: 'appt-other-tenant',
        patientId: OTHER_PATIENT,
        professionalId: 'col-1',
        roomId: 'room-1',
        date: today,
        startTime: '10:00',
        endTime: '10:30',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: OTHER_TENANT,
      }],
    });
    const rows = listJourneyOperationalEntries(today, { tenantId: TENANT });
    expect(rows.some((r) => r.id === 'appt-other-tenant')).toBe(false);
    const foreign = resolveClinicalAttendanceState({
      appointment: loadDb().appointments.find((a) => a.id === 'appt-other-tenant'),
      asOfDate: today,
      tenantId: TENANT,
    });
    expect(foreign.reason).toBe('TENANT_MISMATCH');
  });

  it('I) outro paciente não é alterado ao finalizar', () => {
    const today = todayLocalIso();
    seed({
      date: today,
      extraAppointments: [{
        id: 'appt-other-patient',
        patientId: OTHER_PATIENT,
        professionalId: 'col-1',
        roomId: 'room-1',
        date: today,
        startTime: '10:00',
        endTime: '10:30',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: TENANT,
      }],
    });
    finishAppointment(USER, APPT);
    const other = loadDb().appointments.find((a) => a.id === 'appt-other-patient');
    expect(other.status).toBe(APPOINTMENT_STATUS.EM_ATENDIMENTO);
    expect(other.patientId).toBe(OTHER_PATIENT);
  });

  it('J) finalizar duas vezes é idempotente', () => {
    const today = todayLocalIso();
    seed({ date: today });
    const first = finishAppointment(USER, APPT);
    const second = finishAppointment(USER, APPT);
    expect(first.status).toBe(APPOINTMENT_STATUS.FINALIZADO);
    expect(second.status).toBe(APPOINTMENT_STATUS.FINALIZADO);
    expect(second.finishedAt).toBe(first.finishedAt);
  });

  it('K) finalização não altera orçamento/contrato/documentos/assinaturas', () => {
    const today = todayLocalIso();
    seed({ date: today });
    const before = loadDb();
    finishAppointment(USER, APPT);
    const after = loadDb();
    expect(after.generatedContracts[0]).toEqual(before.generatedContracts[0]);
    expect(after.contractSignatures).toEqual(before.contractSignatures);
    expect(after.clinicalAppointments[0].budget).toEqual(before.clinicalAppointments[0].budget);
    expect(after.appointments[0].status).toBe(APPOINTMENT_STATUS.FINALIZADO);
    expect(after.clinicalAppointments[0].finishedAt).toBeTruthy();
  });

  it('não introduz auto-finalização após virar o dia', () => {
    const today = todayLocalIso();
    const yesterday = shiftDate(today, -1);
    seed({ date: yesterday });
    const state = resolveClinicalAttendanceState({
      appointment: loadDb().appointments[0],
      asOfDate: today,
      tenantId: TENANT,
    });
    expect(loadDb().appointments[0].status).toBe(APPOINTMENT_STATUS.EM_ATENDIMENTO);
    expect(state.lifecycleStatus).toBe(ATTENDANCE_LIFECYCLE.STALE_OPEN);
    expect(state.requiresResolution).toBe(true);
  });
});
