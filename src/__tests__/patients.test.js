import { describe, expect, it, beforeEach } from 'vitest';
import { loadDb, initDb, resetDb } from '../db/index.js';
import { createPatientQuick, getPatient, updatePatientProfile } from '../services/patientService.js';

const admin = { id: 'user-admin', role: 'admin' };

describe('Pacientes', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('carrega dados do cadastro rápido no cadastro completo', () => {
    const created = createPatientQuick(admin, {
      full_name: 'Maria Aparecida',
      sex: 'F',
      social_name: 'Maria',
      birth_date: '1988-12-14',
      cpf: '16203944645',
    });

    const patient = getPatient(created.patientId);
    expect(patient.profile.full_name).toBe('Maria Aparecida');
    expect(patient.profile.sex).toBe('F');
    expect(patient.profile.social_name).toBe('Maria');
    expect(patient.profile.birth_date).toBe('1988-12-14');
    expect(patient.profile.cpf).toBe('16203944645');
  });

  it('atualiza cadastro novo sem erro', () => {
    const created = createPatientQuick(admin, {
      full_name: 'João Silva',
      sex: 'M',
      birth_date: '1992-02-01',
      cpf: '52998224725',
    });

    const updated = updatePatientProfile(admin, created.patientId, { nickname: 'Joãozinho' });
    expect(updated.nickname).toBe('Joãozinho');
  });
});
