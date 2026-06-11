import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { getOperationalDashboard } from '../services/gestaoAtendimentoService.js';
import { createAppointment } from '../services/appointmentService.js';

const user = { id: 'user-1', role: 'admin', tenant_id: 'tenant-1' };

describe('Central Operacional — Gestão de Atendimento', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
      db.patients = [{ id: 'p1', full_name: 'Maria Silva', tenant_id: 'tenant-1' }];
      db.collaborators = [{ id: 'col1', nomeCompleto: 'Dra Juliana', apelido: 'Juliana', status: 'ativo', especialidades: ['Ortodontia'] }];
      db.rooms = [{ id: 'r1', name: 'Sala 01', active: true }];
    });
  });

  it('retorna dashboard operacional com seções agregadas', () => {
    const today = new Date().toISOString().slice(0, 10);
    createAppointment(user, {
      patientId: 'p1',
      professionalId: 'col1',
      roomId: 'r1',
      date: today,
      startTime: '09:00',
      endTime: '09:30',
      status: 'confirmado',
      procedureName: 'Avaliação',
    });

    const dash = getOperationalDashboard(today);
    expect(dash.executive.pacientesAgendados.value).toBeGreaterThanOrEqual(1);
    expect(dash.timeline.length).toBeGreaterThanOrEqual(1);
    expect(dash.journey.length).toBe(5);
    expect(dash.production).toHaveProperty('receitaPrevista');
    expect(dash.financial).toHaveProperty('receitaRecebida');
    expect(Array.isArray(dash.alerts)).toBe(true);
  });
});
