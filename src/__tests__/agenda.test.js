import { describe, expect, it, beforeEach } from 'vitest';
import { loadDb, initDb, resetDb } from '../db/index.js';
import { createAppointment, createBlock, hasConflict } from '../services/appointmentService.js';
import { resolveWorkSchedule } from '../utils/agendaUtils.js';

const admin = { id: 'user-admin', role: 'admin' };

describe('Agenda - conflitos', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('bloqueia conflito de horário para o mesmo profissional', () => {
    createAppointment(admin, {
      patientId: 'patient-1',
      professionalId: 'prof-1',
      roomId: 'room-1',
      date: '2026-01-18',
      startTime: '10:00',
      endTime: '11:00',
    });

    const conflict = hasConflict({
      date: '2026-01-18',
      startTime: '10:30',
      endTime: '11:30',
      professionalId: 'prof-1',
      roomId: 'room-2',
    });

    expect(conflict).toBe(true);
  });

  it('detecta conflito com bloqueio de sala', () => {
    createBlock(admin, {
      date: '2026-01-18',
      startTime: '14:00',
      endTime: '15:00',
      roomId: 'room-1',
      professionalId: '',
      reason: 'Manutenção',
    });

    const conflict = hasConflict({
      date: '2026-01-18',
      startTime: '14:30',
      endTime: '15:30',
      professionalId: 'prof-2',
      roomId: 'room-1',
    });

    expect(conflict).toBe(true);
  });
});

describe('Agenda - jornada do dentista', () => {
  it('Dentista A 08:00–18:00 => grade limitada nesse range', () => {
    const schedule = resolveWorkSchedule({
      workHours: [
        { diaSemana: 1, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: true },
        { diaSemana: 2, inicio: '08:00', fim: '12:00', intervaloInicio: '13:00', intervaloFim: '18:00', ativo: true },
      ],
    });

    expect(schedule.workStart).toBe('08:00');
    expect(schedule.workEnd).toBe('18:00');
    expect(schedule.slotMinutes).toBe(30);
    expect(schedule.hasConfig).toBe(true);
    expect(schedule.isValid).toBe(true);
  });

  it('Dentista B 09:00–13:00 => grade reduzida automaticamente', () => {
    const schedule = resolveWorkSchedule({
      workHours: [{ diaSemana: 3, inicio: '09:00', fim: '13:00', ativo: true }],
    });

    expect(schedule.workStart).toBe('09:00');
    expect(schedule.workEnd).toBe('13:00');
    expect(schedule.hasConfig).toBe(true);
    expect(schedule.isValid).toBe(true);
  });

  it('Sem configuração => fallback 08:00–18:00 com aviso', () => {
    const schedule = resolveWorkSchedule({ workHours: [] });

    expect(schedule.workStart).toBe('08:00');
    expect(schedule.workEnd).toBe('18:00');
    expect(schedule.hasConfig).toBe(false);
    expect(schedule.isValid).toBe(true);
  });
});
