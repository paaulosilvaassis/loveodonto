import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { getPatientFlowDashboard } from '../services/patientFlowDashboardService.js';
import { createAppointment } from '../services/appointmentService.js';
import { moveToFlowColumn, FLOW_COLUMN } from '../services/patientFlowService.js';

const user = { id: 'user-1', role: 'admin', tenant_id: 'tenant-1' };

describe('Central da Jornada — Fluxo do Paciente', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
      db.patients = [{ id: 'p1', full_name: 'Maria Silva', tenant_id: 'tenant-1' }];
      db.collaborators = [{ id: 'col1', nomeCompleto: 'Dra Juliana', status: 'ativo' }];
      db.rooms = [{ id: 'r1', name: 'Sala 01', active: true }];
    });
  });

  it('retorna dashboard com 11 seções agregadas', () => {
    const today = new Date().toISOString().slice(0, 10);
    const apt = createAppointment(user, {
      patientId: 'p1',
      professionalId: 'col1',
      roomId: 'r1',
      date: today,
      startTime: '09:00',
      endTime: '09:30',
      status: 'confirmado',
      procedureName: 'Avaliação',
      tenant_id: 'tenant-1',
    });

    moveToFlowColumn(user, apt.id, FLOW_COLUMN.RECEPCAO);

    const dash = getPatientFlowDashboard(today, { tenantId: 'tenant-1' });
    expect(dash.summary.agendadosHoje.value).toBeGreaterThanOrEqual(1);
    expect(dash.kanban.columns[FLOW_COLUMN.RECEPCAO].length).toBe(1);
    expect(dash.kanban.meta.length).toBe(8);
    expect(Array.isArray(dash.waiting)).toBe(true);
    expect(Array.isArray(dash.alerts)).toBe(true);
    expect(dash.production).toHaveProperty('receitaPrevista');
    expect(dash.averageWait).toHaveProperty('salaEspera');
  });

  it('move paciente entre colunas via drag-and-drop service', () => {
    const today = new Date().toISOString().slice(0, 10);
    const apt = createAppointment(user, {
      patientId: 'p1',
      professionalId: 'col1',
      roomId: 'r1',
      date: today,
      startTime: '10:00',
      endTime: '10:30',
      status: 'confirmado',
      tenant_id: 'tenant-1',
    });

    moveToFlowColumn(user, apt.id, FLOW_COLUMN.SALA_ESPERA);
    let dash = getPatientFlowDashboard(today, { tenantId: 'tenant-1' });
    expect(dash.kanban.columns[FLOW_COLUMN.SALA_ESPERA].length).toBe(1);

    moveToFlowColumn(user, apt.id, FLOW_COLUMN.CONSULTORIO);
    dash = getPatientFlowDashboard(today, { tenantId: 'tenant-1' });
    expect(dash.kanban.columns[FLOW_COLUMN.CONSULTORIO].length).toBe(1);
    expect(dash.inProgress.length).toBe(1);
  });
});
