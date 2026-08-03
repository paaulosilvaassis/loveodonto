/**
 * Phase 5.10 — Agenda write soak & staging validation (simulated).
 * Valida contratos READ+READ_PRIMARY+WRITE+SHADOW+COMPARE sem Supabase remoto.
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
  createBlock,
  listAppointments,
  updateAppointment,
} from '../services/appointmentService.js';
import { moveToFlowColumn, FLOW_COLUMN } from '../services/patientFlowService.js';
import { AgendaRepository } from '../repositories/agenda/agendaRepository.ts';
import { createAgendaCache } from '../repositories/agenda/agendaCache.ts';
import {
  getAgendaRepositoryFlags,
  isAgendaReadPrimaryEnabled,
  isAgendaWriteEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/agenda/agendaRepositoryFlags.ts';
import {
  __setAgendaRepositoryFactoryForTest,
  __setAgendaServiceBridgeFlagsForTest,
  shouldUseAgendaRepositoryRead,
  shouldUseAgendaRepositoryWrite,
} from '../services/agendaRepositoryBridge.js';
import {
  __runAgendaDualWriteCreateForTest,
  __runAgendaDualWriteUpdateForTest,
} from '../services/agendaWriteAdapter.js';
import { readHydrateAgendaCache } from '../services/agendaReadAdapter.js';
import { AGENDA_STAGING_SOAK_FLAGS_RESOLVED } from './rhTestFlagContract.js';

vi.mock('../services/crmService.js', () => ({
  addLeadEvent: vi.fn(),
  moveLeadToStage: vi.fn(),
}));

import { addLeadEvent, moveLeadToStage } from '../services/crmService.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const adminUser = {
  id: 'user-admin',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'agenda:write': true },
};

const SOAK_FLAGS = AGENDA_STAGING_SOAK_FLAGS_RESOLVED;

function futureDate(offsetDays = 7) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function seedAgendaContext() {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.patients = [{ id: 'pat-001', tenant_id: TENANT, full_name: 'Paciente Soak' }];
    db.collaborators = [{ id: 'col-001', tenant_id: TENANT, apelido: 'Dr. Soak' }];
    db.rooms = [{ id: 'room-001', tenant_id: TENANT, name: 'Sala 1' }];
    db.crmLeads = [{ id: 'lead-001', tenant_id: TENANT, name: 'Lead Soak', patientId: null }];
    db.crmStages = [{ id: 'stage-1', key: 'avaliacao_agendada', name: 'Avaliação Agendada' }];
    db.appointments = [];
    db.appointmentBlocks = [];
    db.journeyEntries = [];
    db.leadEvents = [];
    return db;
  });
}

function buildRemoteCore(legacyId, overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    patientId: 'pat-001',
    leadId: overrides.leadId ?? null,
    professionalId: 'col-001',
    roomId: 'room-001',
    date: overrides.date || futureDate(),
    startTime: overrides.startTime || '10:00',
    endTime: overrides.endTime || '10:30',
    durationMinutes: 30,
    slotCapacity: 1,
    status: overrides.status || 'agendado',
    procedureName: overrides.procedureName || 'Consulta soak remota',
    channel: overrides.channel || 'telefone',
    notes: overrides.notes || '',
    checkInAt: null,
    finishedAt: null,
  };
}

function createSoakMocks() {
  const cache = createAgendaCache();
  const remoteRows = [];
  return {
    adminApi: {
      listAppointments: vi.fn().mockImplementation(async () => [...remoteRows]),
      getAppointment: vi.fn().mockImplementation(async (_tid, ref) => {
        return remoteRows.find((row) => row.legacyId === ref) ?? null;
      }),
      createAppointment: vi.fn().mockImplementation(async (_tid, dto) => {
        const core = buildRemoteCore(dto.legacyId, {
          procedureName: 'Consulta soak remota',
          date: dto.date,
          startTime: dto.startTime,
          endTime: dto.endTime,
          leadId: dto.leadId,
          channel: dto.channel,
        });
        const idx = remoteRows.findIndex((row) => row.legacyId === core.legacyId);
        if (idx >= 0) remoteRows[idx] = core;
        else remoteRows.push(core);
        return core;
      }),
      updateAppointment: vi.fn().mockImplementation(async (_tid, ref, dto) => {
        const existing = remoteRows.find((row) => row.legacyId === ref);
        const core = buildRemoteCore(ref, {
          ...existing,
          status: dto.status || existing?.status || 'confirmado',
          procedureName: dto.procedureName || existing?.procedureName,
        });
        const idx = remoteRows.findIndex((row) => row.legacyId === ref);
        if (idx >= 0) remoteRows[idx] = core;
        return core;
      }),
      cancelAppointment: vi.fn().mockImplementation(async (_tid, ref) => {
        const core = buildRemoteCore(ref, { status: 'cancelado' });
        const idx = remoteRows.findIndex((row) => row.legacyId === ref);
        if (idx >= 0) remoteRows[idx] = core;
        return core;
      }),
    },
    indexedDb: {
      listLegacySync: vi.fn((filters = {}) => {
        let rows = (loadDb().appointments || []).map((row) => ({ ...row }));
        if (filters.date) rows = rows.filter((row) => row.date === filters.date);
        if (filters.tenantId) {
          rows = rows.filter((row) => !row.tenant_id || row.tenant_id === filters.tenantId);
        }
        return rows;
      }),
      getLegacySync: vi.fn((id) => {
        const row = (loadDb().appointments || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listBlocksLegacySync: vi.fn(() => (loadDb().appointmentBlocks || []).map((b) => ({ ...b }))),
    },
    cache,
    remoteRows,
  };
}

function appointmentPayload(overrides = {}) {
  const date = futureDate();
  return {
    tenantId: TENANT,
    patientId: 'pat-001',
    professionalId: 'col-001',
    roomId: 'room-001',
    date,
    startTime: '10:00',
    endTime: '10:30',
    procedureName: 'Consulta soak',
    ...overrides,
  };
}

describe('agendaWriteSoak — contrato flags staging (M8)', () => {
  it('combinação soak READ+READ_PRIMARY+WRITE+SHADOW+COMPARE é válida', () => {
    const flags = getAgendaRepositoryFlags({ overrides: SOAK_FLAGS });
    expect(flags.AGENDA_READ).toBe(true);
    expect(flags.AGENDA_READ_PRIMARY).toBe(true);
    expect(flags.AGENDA_WRITE).toBe(true);
    expect(flags.AGENDA_SHADOW).toBe(true);
    expect(flags.AGENDA_COMPARE).toBe(true);
  });

  it('build PROD trava WRITE, READ_PRIMARY e SHADOW', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getAgendaRepositoryFlags({ overrides: SOAK_FLAGS });
      expect(flags.AGENDA_WRITE).toBe(false);
      expect(flags.AGENDA_READ_PRIMARY).toBe(false);
      expect(flags.AGENDA_SHADOW).toBe(false);
      expect(isAgendaWriteEnabled()).toBe(false);
      expect(isAgendaReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY e WRITE', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getAgendaRepositoryFlags({ overrides: SOAK_FLAGS });
    expect(flags.AGENDA_READ_PRIMARY).toBe(false);
    expect(flags.AGENDA_WRITE).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe('agendaWriteSoak — dual-write + hydrate + read-after-write', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedAgendaContext();
    __setAgendaServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    __setAgendaRepositoryFactoryForTest(null);
    vi.mocked(addLeadEvent).mockReset();
    vi.mocked(moveLeadToStage).mockReset();
  });

  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('M1 — create IDB + remoto + hydrate + read-after-write', async () => {
    const mocks = createSoakMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    const created = createAppointment(adminUser, appointmentPayload());
    expect(loadDb().appointments.some((item) => item.id === created.id)).toBe(true);

    const writeResult = await __runAgendaDualWriteCreateForTest(adminUser, created);
    expect(writeResult.ok).toBe(true);
    expect(mocks.adminApi.createAppointment).toHaveBeenCalled();

    const hydrated = loadDb().appointments.find((item) => item.id === created.id);
    expect(hydrated?.procedureName).toBe('Consulta soak remota');

    const listResult = await repo.listCore(TENANT);
    expect(listResult.source).toBe('admin-api');
    expect(listResult.items.some((item) => item.legacyId === created.id)).toBe(true);
  });

  it('M2 — update local + remoto + hydrate + cache', async () => {
    const mocks = createSoakMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    const created = createAppointment(adminUser, appointmentPayload({ startTime: '11:00', endTime: '11:30' }));
    await __runAgendaDualWriteCreateForTest(adminUser, created);

    const updated = updateAppointment(adminUser, created.id, {
      status: 'confirmado',
      procedureName: 'Confirmada soak',
    });
    const writeResult = await __runAgendaDualWriteUpdateForTest(adminUser, updated);
    expect(writeResult.ok).toBe(true);
    expect(mocks.adminApi.updateAppointment).toHaveBeenCalled();

    const cached = mocks.cache.get(TENANT, created.id);
    expect(cached?.status).toBe('confirmado');
    expect(updated.procedureName).toBe('Confirmada soak');
  });

  it('M3 — cancel local + remoto + hydrate', async () => {
    const mocks = createSoakMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    }));

    const created = createAppointment(adminUser, appointmentPayload());
    await __runAgendaDualWriteCreateForTest(adminUser, created);

    const cancelled = cancelAppointment(adminUser, created.id, 'Paciente desmarcou');
    expect(cancelled.status).toBe('cancelado');

    const writeResult = await __runAgendaDualWriteUpdateForTest(adminUser, cancelled);
    expect(writeResult.ok).toBe(true);
    expect(mocks.adminApi.cancelAppointment).toHaveBeenCalled();
  });

  it('M4 — createAppointmentFromCrm preserva side-effects CRM + write remoto', async () => {
    const mocks = createSoakMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    }));

    const created = createAppointmentFromCrm(adminUser, {
      tenantId: TENANT,
      leadId: 'lead-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: futureDate(10),
      startTime: '14:00',
      durationMinutes: 30,
      procedureName: 'Avaliação CRM soak',
    });

    expect(addLeadEvent).toHaveBeenCalled();
    expect(created.leadId).toBe('lead-001');
    expect(created.channel).toBe('crm_pipeline');

    const writeResult = await __runAgendaDualWriteCreateForTest(adminUser, created);
    expect(writeResult.ok).toBe(true);
    expect(mocks.adminApi.createAppointment).toHaveBeenCalled();
  });

  it('M7 — READ_PRIMARY hydrate após reload simulado', async () => {
    const mocks = createSoakMocks();
    mocks.remoteRows.push(buildRemoteCore('appt-reload-001', { procedureName: 'Pós-reload remoto' }));

    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    expect(shouldUseAgendaRepositoryRead()).toBe(true);

    withDb((db) => {
      db.appointments = [];
      return db;
    });

    const { hydrated } = await readHydrateAgendaCache(TENANT);
    expect(hydrated).toBe(1);
    expect(loadDb().appointments.some((item) => item.id === 'appt-reload-001')).toBe(true);

    const fromRepo = listAppointments({ tenantId: TENANT });
    expect(fromRepo.some((item) => item.id === 'appt-reload-001')).toBe(true);
  });
});

describe('agendaWriteSoak — rollback e resiliência (M5/M6)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedAgendaContext();
  });

  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('M5 — offline: IDB ok, write remoto falha, rollback preservado', async () => {
    __setAgendaServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    __setAgendaRepositoryFactoryForTest(() => ({
      createCore: vi.fn().mockRejectedValue(new Error('Failed to fetch')),
    }));

    const created = createAppointment(adminUser, appointmentPayload());
    const result = await __runAgendaDualWriteCreateForTest(adminUser, created);

    expect(result.ok).toBe(false);
    expect(loadDb().appointments.find((item) => item.id === created.id)?.procedureName).toBe('Consulta soak');
  });

  it('WRITE=false — dual-write skipped, IDB authority', async () => {
    const createCore = vi.fn();
    __setAgendaRepositoryFactoryForTest(() => ({ createCore }));
    __setAgendaServiceBridgeFlagsForTest(null);

    expect(shouldUseAgendaRepositoryWrite()).toBe(false);
    const created = createAppointment(adminUser, appointmentPayload());
    const result = await __runAgendaDualWriteCreateForTest(adminUser, created);

    expect(result.skipped).toBe(true);
    expect(createCore).not.toHaveBeenCalled();
    expect(loadDb().appointments.some((item) => item.id === created.id)).toBe(true);
  });

  it('READ_PRIMARY=false com flags default — listAppointments legado', () => {
    __setAgendaServiceBridgeFlagsForTest(null);
    createAppointment(adminUser, appointmentPayload());
    const list = listAppointments();
    expect(list.length).toBe(1);
    expect(shouldUseAgendaRepositoryRead()).toBe(false);
  });

  it('M6 — COMPARE divergente não quebra listAppointments', async () => {
    __setAgendaServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });
    const compareIdbVsRemote = vi.fn().mockResolvedValue({
      tenantId: TENANT,
      comparedAt: new Date().toISOString(),
      matchCount: 0,
      mismatchCount: 2,
      diffs: [
        { ref: 'appt-a', match: false, diffs: [{ field: 'status', indexedDb: 'agendado', remote: 'confirmado' }] },
      ],
    });
    __setAgendaRepositoryFactoryForTest(() => ({
      listLegacySync: vi.fn(() => loadDb().appointments.map((row) => ({ ...row }))),
      compareIdbVsRemote,
    }));

    createAppointment(adminUser, appointmentPayload());
    expect(() => listAppointments({ tenantId: TENANT })).not.toThrow();
    await compareIdbVsRemote(TENANT);
    expect(compareIdbVsRemote).toHaveBeenCalled();
  });

  it('duplicate create remoto — IDB mantém único registro', async () => {
    const mocks = createSoakMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: SOAK_FLAGS },
    }));
    __setAgendaServiceBridgeFlagsForTest({ overrides: SOAK_FLAGS });

    const appointment = {
      id: 'appt-dup-soak',
      tenant_id: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: futureDate(),
      startTime: '16:00',
      endTime: '16:30',
      status: 'agendado',
      procedureName: 'Dup soak',
    };
    withDb((db) => {
      db.appointments.push(appointment);
      return db;
    });

    await __runAgendaDualWriteCreateForTest(adminUser, appointment);
    await __runAgendaDualWriteCreateForTest(adminUser, appointment);
    expect(loadDb().appointments.filter((item) => item.id === appointment.id)).toHaveLength(1);
  });
});

describe('agendaWriteSoak — workflow preservado', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedAgendaContext();
    __setAgendaServiceBridgeFlagsForTest(null);
  });

  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    vi.restoreAllMocks();
  });

  it('checkInAppointment permanece local', () => {
    const created = createAppointment(adminUser, appointmentPayload());
    const checked = checkInAppointment(adminUser, created.id);
    expect(checked.checkInAt).toBeTruthy();
    expect(checked.status).toBe('chegou');
  });

  it('moveToFlowColumn (Kanban) permanece local', () => {
    const created = createAppointment(adminUser, appointmentPayload({ status: 'chegou' }));
    withDb((db) => {
      const idx = db.appointments.findIndex((item) => item.id === created.id);
      db.appointments[idx] = {
        ...db.appointments[idx],
        checkInAt: new Date().toISOString(),
      };
      return db;
    });
    const moved = moveToFlowColumn(adminUser, created.id, FLOW_COLUMN.SALA_ESPERA);
    expect(moved.status).toBe('em_espera');
  });

  it('createBlock permanece local IDB', () => {
    const block = createBlock(adminUser, {
      date: futureDate(),
      startTime: '12:00',
      endTime: '13:00',
      professionalId: 'col-001',
      reason: 'Almoço soak',
    });
    expect(loadDb().appointmentBlocks.some((item) => item.id === block.id)).toBe(true);
  });

  it('appointmentService não wire write em workflow methods', () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const content = fs.readFileSync(
      path.resolve(__dirname, '../services/appointmentService.js'),
      'utf8',
    );
    const checkInSection = content.slice(content.indexOf('export const checkInAppointment'));
    const finishSection = content.slice(content.indexOf('export const finishAppointment'));
    expect(checkInSection).not.toContain('scheduleAgendaDualWrite');
    expect(finishSection).not.toContain('scheduleAgendaDualWrite');
    expect(content).not.toContain('scheduleAgendaDualWriteCancel');
  });
});
