/**
 * Phase 5.9 — Agenda Repository Write Cutover.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  cancelAppointment,
  checkInAppointment,
  createAppointment,
  createAppointmentFromCrm,
  updateAppointment,
} from '../services/appointmentService.js';
import { moveToFlowColumn, FLOW_COLUMN } from '../services/patientFlowService.js';
import { AgendaRepository } from '../repositories/agenda/agendaRepository.ts';
import { createAgendaCache } from '../repositories/agenda/agendaCache.ts';
import {
  getAgendaRepositoryFlags,
  isAgendaWriteEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/agenda/agendaRepositoryFlags.ts';
import {
  __setAgendaRepositoryFactoryForTest,
  __setAgendaServiceBridgeFlagsForTest,
  shouldUseAgendaRepositoryWrite,
} from '../services/agendaRepositoryBridge.js';
import {
  __runAgendaDualWriteCreateForTest,
  __runAgendaDualWriteUpdateForTest,
  mapLegacyRowToCreateDto,
} from '../services/agendaWriteAdapter.js';
import { AGENDA_WRITE_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const adminUser = {
  id: 'user-admin',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'agenda:write': true },
};

const WRITE_FLAGS = AGENDA_WRITE_FLAGS_RESOLVED;

function seedAgendaContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.patients = [{ id: 'pat-001', tenant_id: TENANT, full_name: 'Paciente Teste' }];
    db.collaborators = [{ id: 'col-001', tenant_id: TENANT, apelido: 'Dr. A' }];
    db.rooms = [{ id: 'room-001', tenant_id: TENANT, name: 'Sala 1' }];
    db.crmLeads = [{
      id: 'lead-001',
      tenant_id: TENANT,
      name: 'Lead CRM',
      patientId: null,
    }];
    db.appointments = [];
    db.appointmentBlocks = [];
    db.journeyEntries = [];
    return db;
  });
}

function buildRemoteCore(legacyId, overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    patientId: 'pat-001',
    leadId: null,
    professionalId: 'col-001',
    roomId: 'room-001',
    date: '2026-07-15',
    startTime: '10:00',
    endTime: '10:30',
    durationMinutes: 30,
    slotCapacity: 1,
    status: 'agendado',
    procedureName: 'Consulta remota',
    channel: 'telefone',
    notes: 'Remoto',
    checkInAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function createWriteMocks() {
  const cache = createAgendaCache();
  return {
    adminApi: {
      listAppointments: vi.fn().mockResolvedValue([]),
      getAppointment: vi.fn().mockResolvedValue(null),
      createAppointment: vi.fn().mockImplementation(async (_tid, dto) => buildRemoteCore(dto.legacyId)),
      updateAppointment: vi.fn().mockImplementation(async (_tid, ref, dto) => buildRemoteCore(ref, {
        status: dto.status || 'confirmado',
        procedureName: dto.procedureName || 'Consulta remota',
      })),
      cancelAppointment: vi.fn().mockImplementation(async (_tid, ref) => buildRemoteCore(ref, {
        status: 'cancelado',
      })),
    },
    indexedDb: {
      listLegacySync: vi.fn(() => loadDb().appointments.map((row) => ({ ...row }))),
      getLegacySync: vi.fn((id) => {
        const row = loadDb().appointments.find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listBlocksLegacySync: vi.fn(() => []),
    },
    cache,
  };
}

describe('agendaWriteCutover — flags', () => {
  it('WRITE requer AGENDA_READ', () => {
    expect(() => getAgendaRepositoryFlags({
      overrides: { AGENDA_WRITE: true, AGENDA_READ: false },
    })).toThrow(/AGENDA_WRITE/);
  });

  it('build PROD trava WRITE', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getAgendaRepositoryFlags({ overrides: WRITE_FLAGS });
      expect(flags.AGENDA_WRITE).toBe(false);
      expect(isAgendaWriteEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia WRITE', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getAgendaRepositoryFlags({
      overrides: { AGENDA_READ: true, AGENDA_WRITE: true },
    });
    expect(flags.AGENDA_WRITE).toBe(false);
    vi.unstubAllEnvs();
  });

  it('flags default — write desligado', () => {
    expect(shouldUseAgendaRepositoryWrite()).toBe(false);
  });
});

describe('agendaWriteCutover — dual write', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedAgendaContext();
    __setAgendaServiceBridgeFlagsForTest({ overrides: WRITE_FLAGS });
    __setAgendaRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('create remoto via repository + hydrate IDB', async () => {
    const mocks = createWriteMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    const created = createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-15',
      startTime: '10:00',
      endTime: '10:30',
      procedureName: 'Consulta local',
    });

    const result = await __runAgendaDualWriteCreateForTest(adminUser, created);
    expect(result.ok).toBe(true);
    expect(mocks.adminApi.createAppointment).toHaveBeenCalled();
    const hydrated = loadDb().appointments.find((item) => item.id === created.id);
    expect(hydrated?.procedureName).toBe('Consulta remota');
  });

  it('update remoto via repository', async () => {
    const mocks = createWriteMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    const created = createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-15',
      startTime: '11:00',
      endTime: '11:30',
      procedureName: 'Consulta',
    });

    const updated = updateAppointment(adminUser, created.id, {
      status: 'confirmado',
      procedureName: 'Confirmada',
    });

    const result = await __runAgendaDualWriteUpdateForTest(adminUser, updated, {
      status: 'confirmado',
      procedureName: 'Confirmada',
    });
    expect(result.ok).toBe(true);
    expect(mocks.adminApi.updateAppointment).toHaveBeenCalled();
  });

  it('cancel remoto via repository', async () => {
    const mocks = createWriteMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    const created = createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-16',
      startTime: '09:00',
      endTime: '09:30',
      procedureName: 'Consulta',
    });

    const cancelled = cancelAppointment(adminUser, created.id, 'Paciente desmarcou');
    const result = await __runAgendaDualWriteUpdateForTest(adminUser, cancelled);
    expect(result.ok).toBe(true);
    expect(mocks.adminApi.cancelAppointment).toHaveBeenCalled();
  });

  it('createAppointmentFromCrm dispara dual-write create', async () => {
    const mocks = createWriteMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));

    const created = createAppointmentFromCrm(adminUser, {
      tenantId: TENANT,
      leadId: 'lead-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-17',
      startTime: '14:00',
      durationMinutes: 30,
      procedureName: 'Avaliação CRM',
    });

    const result = await __runAgendaDualWriteCreateForTest(adminUser, created);
    expect(result.ok).toBe(true);
    expect(mocks.adminApi.createAppointment).toHaveBeenCalled();
    expect(created.leadId).toBe('lead-001');
  });

  it('rollback remoto preserva IDB local', async () => {
    const mocks = createWriteMocks();
    mocks.adminApi.createAppointment.mockRejectedValue(new Error('Failed to fetch'));
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));

    const created = createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-18',
      startTime: '15:00',
      endTime: '15:30',
      procedureName: 'Local only',
    });

    const result = await __runAgendaDualWriteCreateForTest(adminUser, created);
    expect(result.ok).toBe(false);
    const local = loadDb().appointments.find((item) => item.id === created.id);
    expect(local?.procedureName).toBe('Local only');
  });

  it('duplicate create remoto faz upsert sem perder IDB', async () => {
    const mocks = createWriteMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));

    const appointment = {
      id: 'appt-dup-001',
      tenant_id: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-19',
      startTime: '16:00',
      endTime: '16:30',
      status: 'agendado',
      procedureName: 'Primeira',
    };
    withDb((db) => {
      db.appointments.push(appointment);
      return db;
    });

    await __runAgendaDualWriteCreateForTest(adminUser, appointment);
    await __runAgendaDualWriteCreateForTest(adminUser, appointment);
    expect(mocks.adminApi.createAppointment).toHaveBeenCalledTimes(2);
    expect(loadDb().appointments.filter((item) => item.id === appointment.id)).toHaveLength(1);
  });

  it('WRITE=false não chama repository remoto', async () => {
    __setAgendaServiceBridgeFlagsForTest(null);
    const mocks = createWriteMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: WRITE_FLAGS },
    }));

    const created = createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-20',
      startTime: '08:00',
      endTime: '08:30',
      procedureName: 'Sem write',
    });

    const result = await __runAgendaDualWriteCreateForTest(adminUser, created);
    expect(result.skipped).toBe(true);
    expect(mocks.adminApi.createAppointment).not.toHaveBeenCalled();
  });
});

describe('agendaWriteCutover — workflow intacto', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedAgendaContext();
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('checkInAppointment permanece legado sem write adapter', () => {
    const created = createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-21',
      startTime: '09:00',
      endTime: '09:30',
      procedureName: 'Check-in test',
    });

    const checked = checkInAppointment(adminUser, created.id);
    expect(checked.checkInAt).toBeTruthy();
    expect(checked.status).toBe('chegou');
  });

  it('moveToFlowColumn permanece legado', () => {
    const created = createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-22',
      startTime: '10:00',
      endTime: '10:30',
      procedureName: 'Kanban test',
      status: 'chegou',
    });

    withDb((db) => {
      const idx = db.appointments.findIndex((item) => item.id === created.id);
      db.appointments[idx] = { ...db.appointments[idx], checkInAt: new Date().toISOString() };
      return db;
    });

    const moved = moveToFlowColumn(adminUser, created.id, FLOW_COLUMN.SALA_ESPERA);
    expect(moved.status).toBe('em_espera');
  });
});

describe('agendaWriteCutover — mapper e contrato', () => {
  it('mapLegacyRowToCreateDto preserva legacyId', () => {
    const dto = mapLegacyRowToCreateDto({
      id: 'appt-xyz',
      tenant_id: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-09',
      startTime: '09:00',
      endTime: '09:30',
      status: 'agendado',
      procedureName: 'Consulta',
    });
    expect(dto.legacyId).toBe('appt-xyz');
    expect(dto.patientId).toBe('pat-001');
  });

  it('appointmentService importa write adapter sem alterar workflow exports', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const content = fs.readFileSync(
      path.resolve(__dirname, '../services/appointmentService.js'),
      'utf8',
    );
    expect(content).toContain('agendaWriteAdapter.js');
    expect(content).toContain('export const checkInAppointment');
    expect(content).toContain('export const callPatient');
    expect(content).toContain('export const finishAppointment');
    expect(content).toContain('scheduleAgendaDualWriteCreate');
    expect(content).toContain('scheduleAgendaDualWriteUpdate');
  });
});
