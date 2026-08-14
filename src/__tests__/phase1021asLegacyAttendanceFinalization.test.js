/**
 * PHASE_10.21AS — finalização segura do atendimento legado + régua.
 * Testes mutam o DB de teste. Produção do Paulo NÃO é finalizada aqui.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { APPOINTMENT_STATUS } from '../services/appointmentService.js';
import {
  APPOINTMENT_CLOSE_REASON,
  closeClinicalAppointment,
  resolveClinicalFinishReadiness,
} from '../services/clinicalAppointmentCloseService.js';
import {
  getAgendaStatusPresentation,
  resolveClinicalAttendanceState,
  todayLocalIso,
} from '../services/clinicalAttendanceState.js';
import { listJourneyOperationalEntries } from '../services/journeyEntryService.js';
import {
  getClinicalWorkflowState,
  getNavStepStatus,
  STEP_STATUS,
} from '../components/clinical/clinicalAppointmentConfig.js';
import { CLINICAL_SIGNATURE_STEP, evaluateClinicalSignatureReadiness } from '../contracts/clinicalSignatureReadiness.js';
import { BUDGET_STATUS } from '../services/clinicalService.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER_TENANT = 'tenant-other-as';
const PATIENT = 'patient-c02b5ad9-84e8-4ae4-b4b0-4300205d8f4a';
const OTHER_PATIENT = 'patient-other-as';
const APPT = 'appt-0181d36a-c8a5-44af-b635-4389e52c7662';
const CLINICAL = 'clinical-9df8fac3-12e3-4b59-bf45-616880d1190b';
const BUDGET = 'budget-d8069b7e-11bd-45e5-9a80-892b4d604b84';
const CONTRACT = 'gctr-fda00712-a722-42e9-9de3-49022ae055cd';
const USER = { id: 'user-as', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin' };

function shiftDate(base, days) {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayLocalIso(dt);
}

function legalSnapshot(db) {
  return JSON.stringify({
    budget: db.clinicalAppointments[0]?.budget,
    contract: db.generatedContracts[0],
    signatures: db.contractSignatures,
    manifest: db.generatedContracts[0]?.metadata,
    documents: db.clinicalAppointments[0]?.budget?.documents || db.treatmentDocuments || [],
  });
}

function seed({ extraAppointments = [] } = {}) {
  const today = todayLocalIso();
  const yesterday = shiftDate(today, -1);
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
        date: yesterday,
        startTime: '17:30',
        endTime: '18:00',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        startedAt: `${yesterday}T20:30:00.000Z`,
        tenant_id: TENANT,
      },
      ...extraAppointments,
    ];
    db.clinicalAppointments = [{
      id: CLINICAL,
      appointmentId: APPT,
      patientId: PATIENT,
      plannedProcedures: [{ id: 'proc-1', name: 'Implante', quantity: 1, unitValue: 150 }],
      budget: {
        id: BUDGET,
        budgetNumber: 'ORC-001',
        status: BUDGET_STATUS.CONTRATO_GERADO,
        totalValue: 150,
        procedures: [{ id: 'proc-1', name: 'Implante', quantity: 1, unitValue: 150 }],
        documents: [{ id: 'doc-orc', htmlContent: '<p>ORC-001</p>' }],
      },
    }];
    db.generatedContracts = [{
      id: CONTRACT,
      contractNumber: 'CTR-2026-00001',
      status: 'signed',
      budgetId: BUDGET,
      patientId: PATIENT,
      quoteId: APPT,
      quoteSource: 'clinical_budget',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      renderedHtml: '<p>histórico</p>',
      metadata: {
        signatureCeremony: { version: 'clinical_ms_v1' },
        packageManifestId: 'man-ctr-00001',
        packageManifestHash: 'hash-ctr-00001',
        frozenAt: '2026-08-13T21:00:00.000Z',
      },
    }];
    db.contractSignatures = [{
      id: 'sig-hist',
      contractId: CONTRACT,
      signerRole: 'PATIENT',
      personId: PATIENT,
      signedAt: '2026-08-13T21:05:00.000Z',
    }];
  });
}

describe('PHASE_10.21AS legacy attendance finalization + ruler', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seed();
  });

  it('A) aba ativa não altera completion de etapa já concluída', () => {
    const workflow = getClinicalWorkflowState(APPT, BUDGET);
    expect(getNavStepStatus('planejamento', workflow, 'planejamento')).toBe(STEP_STATUS.COMPLETED);
    expect(getNavStepStatus('planejamento', workflow, 'orcamento')).toBe(STEP_STATUS.COMPLETED);
    expect(getNavStepStatus('orcamento', workflow, 'planejamento')).toBe(STEP_STATUS.COMPLETED);
    expect(getNavStepStatus('orcamento', workflow, 'orcamento')).toBe(STEP_STATUS.COMPLETED);
  });

  it('B) planejamento consumido por orçamento aprovado não volta para Em andamento', () => {
    const workflow = getClinicalWorkflowState(APPT, BUDGET);
    expect(workflow.hasPlanning).toBe(true);
    expect(workflow.budgetApproved).toBe(true);
    expect(getNavStepStatus('planejamento', workflow, 'planejamento')).not.toBe(STEP_STATUS.IN_PROGRESS);
    expect(getNavStepStatus('planejamento', workflow, 'planejamento')).toBe(STEP_STATUS.COMPLETED);
  });

  it('contrato juridicamente SIGNED permanece Assinatura concluída mesmo com cerimônia incompleta', () => {
    const readiness = evaluateClinicalSignatureReadiness({
      appointmentId: APPT,
      budgetId: BUDGET,
      patientId: PATIENT,
      user: USER,
    });
    expect(readiness.step).toBe(CLINICAL_SIGNATURE_STEP.SIGNED);
    const workflow = getClinicalWorkflowState(APPT, BUDGET);
    expect(getNavStepStatus('assinatura', workflow, 'planejamento')).toBe(STEP_STATUS.COMPLETED);
    expect(getNavStepStatus('assinatura', workflow, 'assinatura')).toBe(STEP_STATUS.COMPLETED);
  });

  it('C/D/E/F/G) stale resolve pelo workflow oficial e libera jornada/agenda/sala', () => {
    const today = todayLocalIso();
    const before = resolveClinicalAttendanceState({
      appointment: loadDb().appointments[0],
      asOfDate: today,
      tenantId: TENANT,
    });
    expect(before.isStale).toBe(true);
    expect(before.requiresResolution).toBe(true);

    const result = closeClinicalAppointment(USER, {
      appointmentId: APPT,
      patientId: PATIENT,
      budgetId: BUDGET,
      reason: APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED,
    });

    expect(result.appointment.status).toBe(APPOINTMENT_STATUS.FINALIZADO);
    const db = loadDb();
    expect(db.appointments[0].status).toBe(APPOINTMENT_STATUS.FINALIZADO);
    expect(db.clinicalAppointments[0].finishedAt).toBeTruthy();

    const after = resolveClinicalAttendanceState({
      appointment: db.appointments[0],
      clinicalAppointment: db.clinicalAppointments[0],
      asOfDate: today,
      tenantId: TENANT,
    });
    expect(after.isFinished).toBe(true);
    expect(after.isStale).toBe(false);
    expect(after.isRoomOccupied).toBe(false);
    expect(after.displayLabel).toBe('Finalizado');

    const journey = listJourneyOperationalEntries(today, { tenantId: TENANT });
    const row = journey.find((item) => item.id === APPT);
    expect(!row || (!row.attendance.isInAttendance && !row.attendance.isStale)).toBe(true);

    const agenda = getAgendaStatusPresentation(db.appointments[0], {}, { asOfDate: today, tenantId: TENANT });
    expect(agenda.isStale).toBe(false);
    expect(agenda.label).toBe('Finalizado');
  });

  it('H/I/J/K) finalização não altera orçamento/contrato/assinatura/manifest', () => {
    const before = legalSnapshot(loadDb());
    closeClinicalAppointment(USER, {
      appointmentId: APPT,
      patientId: PATIENT,
      budgetId: BUDGET,
      reason: APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED,
    });
    expect(legalSnapshot(loadDb())).toBe(before);
    expect(loadDb().clinicalAppointments[0].budget.status).toBe(BUDGET_STATUS.CONTRATO_GERADO);
    expect(loadDb().generatedContracts[0].contractNumber).toBe('CTR-2026-00001');
    expect(loadDb().generatedContracts[0].status).toBe('signed');
  });

  it('L) finalizar novamente é idempotente', () => {
    const first = closeClinicalAppointment(USER, {
      appointmentId: APPT,
      patientId: PATIENT,
      budgetId: BUDGET,
      reason: APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED,
    });
    const legal = legalSnapshot(loadDb());
    const second = closeClinicalAppointment(USER, {
      appointmentId: APPT,
      patientId: PATIENT,
      budgetId: BUDGET,
      reason: APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED,
    });
    expect(second.appointment.status).toBe(APPOINTMENT_STATUS.FINALIZADO);
    expect(second.appointment.finishedAt).toBe(first.appointment.finishedAt);
    expect(legalSnapshot(loadDb())).toBe(legal);
  });

  it('M) isolamento de tenant', () => {
    seed({
      extraAppointments: [{
        id: 'appt-other-tenant-as',
        patientId: OTHER_PATIENT,
        professionalId: 'col-1',
        roomId: 'room-1',
        date: todayLocalIso(),
        startTime: '10:00',
        endTime: '10:30',
        status: APPOINTMENT_STATUS.EM_ATENDIMENTO,
        tenant_id: OTHER_TENANT,
      }],
    });
    closeClinicalAppointment(USER, {
      appointmentId: APPT,
      patientId: PATIENT,
      budgetId: BUDGET,
      reason: APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED,
    });
    const other = loadDb().appointments.find((row) => row.id === 'appt-other-tenant-as');
    expect(other.status).toBe(APPOINTMENT_STATUS.EM_ATENDIMENTO);
  });

  it('N) blocker real de reprovação jurídica possui CTA', () => {
    const readiness = resolveClinicalFinishReadiness({
      appointment: loadDb().appointments[0],
      budget: loadDb().clinicalAppointments[0].budget,
      appointmentId: APPT,
    });
    expect(readiness.canFinish).toBe(true);
    expect(readiness.defaultReason).toBe(APPOINTMENT_CLOSE_REASON.BUDGET_APPROVED);
    expect(readiness.disabledReasons).toContain(APPOINTMENT_CLOSE_REASON.TREATMENT_REFUSED);

    try {
      closeClinicalAppointment(USER, {
        appointmentId: APPT,
        patientId: PATIENT,
        budgetId: BUDGET,
        reason: APPOINTMENT_CLOSE_REASON.TREATMENT_REFUSED,
      });
      throw new Error('deveria falhar');
    } catch (error) {
      expect(error.message).toMatch(/contrato já gerado|aprovado/i);
      expect(error.ctaLabel).toBe('Ver contrato');
      expect(error.ctaHref).toBe(`/atendimento-clinico/${APPT}?section=contratos`);
      expect(error.blockers[0].ctaHref).toBe(error.ctaHref);
    }
    expect(loadDb().appointments[0].status).toBe(APPOINTMENT_STATUS.EM_ATENDIMENTO);
    expect(loadDb().clinicalAppointments[0].budget.status).toBe(BUDGET_STATUS.CONTRATO_GERADO);
  });
});
