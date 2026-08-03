import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import { createLead, convertLeadToPatient } from '../services/crmService.js';
import { createAppointmentFromCrm, getAppointmentDetails, updateAppointment } from '../services/appointmentService.js';
import {
  createPatientQuick,
  addPatientPhone,
  searchPatients,
} from '../services/patientService.js';

const user = { id: 'user-1', role: 'admin', tenant_id: 'tenant-1' };
const VALID_CPF = '11144477735';

function seedAgendaFixtures() {
  withDb((db) => {
    db.tenants = [{ id: 'tenant-1', name: 'Clínica Teste', status: 'active' }];
    db.collaborators = [
      { id: 'prof-1', nomeCompleto: 'Dra Ana', apelido: 'Ana', status: 'ativo', tenant_id: 'tenant-1' },
    ];
    db.rooms = [{ id: 'room-1', name: 'Sala 01', active: true, tenant_id: 'tenant-1' }];
  });
}

function linkLeadAsPatient(userRef, leadId, appointmentId, payload) {
  const created = createPatientQuick(userRef, payload);
  const patientId = created.patientId;
  if (payload.phone) {
    const digits = String(payload.phone).replace(/\D/g, '');
    addPatientPhone(userRef, patientId, {
      ddd: digits.slice(0, 2),
      number: digits.slice(2, 11),
      is_primary: true,
      is_whatsapp: true,
    });
  }
  convertLeadToPatient(userRef, leadId, patientId);
  updateAppointment(userRef, appointmentId, { patientId });
  return patientId;
}

describe('CRM → Agenda → Cadastrar paciente', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedAgendaFixtures();
  });

  it('agenda lead do CRM sem patientId e vincula após cadastro', () => {
    const lead = createLead(user, {
      name: 'Paulo Lead CRM',
      phone: '11987654321',
      source: 'whatsapp',
      notes: 'Interesse em implante',
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);

    const appointment = createAppointmentFromCrm(user, {
      leadId: lead.id,
      professionalId: 'prof-1',
      roomId: 'room-1',
      date,
      startTime: '10:00',
      durationMinutes: 30,
      procedureName: 'Avaliação',
    });

    expect(appointment.leadId).toBe(lead.id);
    expect(appointment.patientId).toBeNull();

    let details = getAppointmentDetails(appointment.id);
    expect(details.patient).toBeNull();
    expect(details.appointment.leadDisplayName).toBe('Paulo Lead CRM');

    const patientId = linkLeadAsPatient(user, lead.id, appointment.id, {
      full_name: 'Paulo Lead CRM',
      sex: 'Masculino',
      birth_date: '1990-05-15',
      cpf: VALID_CPF,
      lead_source: 'whatsapp',
      phone: '11987654321',
      tenant_id: 'tenant-1',
    });

    details = getAppointmentDetails(appointment.id);
    expect(details.appointment.patientId).toBe(patientId);
    expect(details.patient?.full_name).toBe('Paulo Lead CRM');

    const updatedLead = loadDb().crmLeads.find((l) => l.id === lead.id);
    expect(updatedLead.patientId).toBe(patientId);
  });

  it('detecta paciente existente pelo telefone do lead', () => {
    const existing = createPatientQuick(user, {
      full_name: 'Paciente Existente',
      sex: 'Feminino',
      birth_date: '1985-03-20',
      cpf: '52998224725',
      tenant_id: 'tenant-1',
    });
    addPatientPhone(user, existing.patientId, {
      ddd: '11',
      number: '987654321',
      is_primary: true,
      is_whatsapp: true,
    });

    const { exactMatch } = searchPatients('phone', '11987654321', 'tenant-1');
    expect(exactMatch?.id).toBe(existing.patientId);

    const lead = createLead(user, {
      name: 'Paulo Lead CRM',
      phone: '11987654321',
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const appointment = createAppointmentFromCrm(user, {
      leadId: lead.id,
      professionalId: 'prof-1',
      roomId: 'room-1',
      date: tomorrow.toISOString().slice(0, 10),
      startTime: '11:00',
      durationMinutes: 30,
    });

    convertLeadToPatient(user, lead.id, existing.patientId);
    updateAppointment(user, appointment.id, { patientId: existing.patientId });

    const details = getAppointmentDetails(appointment.id);
    expect(details.appointment.patientId).toBe(existing.patientId);
    expect(details.patient?.full_name).toBe('Paciente Existente');
  });
});
