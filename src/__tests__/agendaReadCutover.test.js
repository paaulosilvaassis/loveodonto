/**
 * Phase 5.8 — Agenda Repository Read Cutover.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, loadDb, resetDb, withDb } from '../db/index.js';
import {
  createAppointment,
  getAppointmentDetails,
  listAppointments,
  listBlocks,
} from '../services/appointmentService.js';
import { fetchAppointmentsByDate } from '../services/patientFlowService.js';
import { AgendaRepository } from '../repositories/agenda/agendaRepository.ts';
import { createAgendaCache } from '../repositories/agenda/agendaCache.ts';
import { agendaIndexedDbRepository } from '../repositories/agenda/agendaIndexedDbRepository.ts';
import {
  getAgendaRepositoryFlags,
  isAgendaReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/agenda/agendaRepositoryFlags.ts';
import {
  __setAgendaRepositoryFactoryForTest,
  __setAgendaServiceBridgeFlagsForTest,
  shouldUseAgendaRepositoryRead,
} from '../services/agendaRepositoryBridge.js';
import {
  readFetchAppointmentsByDate,
  readGetAppointment,
  readHydrateAgendaCache,
  readListAppointments,
  __compareAgendaIdbVsRemoteForTest,
} from '../services/agendaReadAdapter.js';
import { AGENDA_READ_PRIMARY_FLAGS_RESOLVED } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const APPT_LOCAL = 'appt-local-001';
const APPT_REMOTE = 'appt-remote-002';

const READ_PRIMARY_FLAGS = AGENDA_READ_PRIMARY_FLAGS_RESOLVED;

const adminUser = {
  id: 'user-admin',
  role: 'admin',
  tenantId: TENANT,
  permissions: { 'agenda:write': true },
};

function buildRemoteCore(overrides = {}) {
  return {
    tenantId: TENANT,
    legacyId: APPT_REMOTE,
    uuid: '22222222-3333-4444-5555-666666666666',
    patientId: 'pat-remote',
    leadId: null,
    professionalId: 'col-001',
    roomId: 'room-001',
    date: '2026-07-10',
    startTime: '11:00',
    endTime: '11:30',
    durationMinutes: 30,
    slotCapacity: 1,
    status: 'confirmado',
    procedureName: 'Avaliação remota',
    channel: 'whatsapp',
    notes: '',
    checkInAt: null,
    finishedAt: null,
    ...overrides,
  };
}

function seedLocalAppointments(extra = []) {
  withDb((db) => {
    db.clinicProfile = { tenant_id: TENANT };
    db.appointments = [
      {
        id: APPT_LOCAL,
        tenant_id: TENANT,
        patientId: 'pat-local',
        professionalId: 'col-001',
        roomId: 'room-001',
        date: '2026-07-09',
        startTime: '09:00',
        endTime: '09:30',
        status: 'agendado',
        procedureName: 'Consulta local',
      },
      {
        id: 'appt-other-prof',
        tenant_id: TENANT,
        patientId: 'pat-002',
        professionalId: 'col-002',
        roomId: 'room-002',
        date: '2026-07-09',
        startTime: '10:00',
        endTime: '10:30',
        status: 'cancelado',
        procedureName: 'Outro profissional',
      },
      ...extra,
    ];
    db.appointmentBlocks = [{
      id: 'block-001',
      date: '2026-07-09',
      startTime: '12:00',
      endTime: '13:00',
      professionalId: 'col-001',
      reason: 'Almoço',
    }];
    db.patients = [{ id: 'pat-local', tenant_id: TENANT, full_name: 'Paciente Local' }];
    db.collaborators = [{ id: 'col-001', tenant_id: TENANT, apelido: 'Dr. A' }];
    db.rooms = [{ id: 'room-001', tenant_id: TENANT, name: 'Sala 1' }];
    return db;
  });
}

function createReadPrimaryMocks(remoteItems = [buildRemoteCore()]) {
  const cache = createAgendaCache();
  return {
    adminApi: {
      listAppointments: vi.fn().mockResolvedValue(remoteItems),
      getAppointment: vi.fn().mockImplementation(async (_tid, ref) => {
        const found = remoteItems.find((item) => item.legacyId === ref || item.uuid === ref);
        return found ?? null;
      }),
    },
    indexedDb: {
      listLegacySync: vi.fn((filters = {}) => {
        const db = loadDb();
        let rows = (db.appointments || []).map((row) => ({ ...row }));
        if (filters.date) rows = rows.filter((row) => row.date === filters.date);
        if (filters.professionalId) {
          rows = rows.filter((row) => row.professionalId === filters.professionalId);
        }
        if (filters.roomId) rows = rows.filter((row) => row.roomId === filters.roomId);
        if (filters.status) {
          const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
          rows = rows.filter((row) => statuses.includes(String(row.status || '')));
        }
        if (filters.tenantId) {
          rows = rows.filter((row) => !row.tenant_id || row.tenant_id === filters.tenantId);
        }
        return rows;
      }),
      getLegacySync: vi.fn((id) => {
        const row = (loadDb().appointments || []).find((item) => item.id === id);
        return row ? { ...row } : null;
      }),
      listBlocksLegacySync: vi.fn((filters = {}) => {
        const blocks = loadDb().appointmentBlocks || [];
        if (!filters?.date) return blocks.map((block) => ({ ...block }));
        return blocks.filter((block) => block.date === filters.date).map((block) => ({ ...block }));
      }),
    },
    cache,
    remoteItems,
  };
}

describe('agendaReadCutover — flags', () => {
  it('READ_PRIMARY requer AGENDA_READ', () => {
    expect(() => getAgendaRepositoryFlags({
      overrides: { AGENDA_READ_PRIMARY: true, AGENDA_READ: false },
    })).toThrow(/AGENDA_READ_PRIMARY/);
  });

  it('build PROD trava READ_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getAgendaRepositoryFlags({ overrides: READ_PRIMARY_FLAGS });
      expect(flags.AGENDA_READ_PRIMARY).toBe(false);
      expect(isAgendaReadPrimaryEnabled()).toBe(false);
    } finally {
      import.meta.env.PROD = originalProd;
    }
  });

  it('host Supabase produção bloqueia READ_PRIMARY', () => {
    vi.stubEnv('VITE_SUPABASE_APP_URL', `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`);
    const flags = getAgendaRepositoryFlags({
      overrides: { AGENDA_READ: true, AGENDA_READ_PRIMARY: true },
    });
    expect(flags.AGENDA_READ_PRIMARY).toBe(false);
    vi.unstubAllEnvs();
  });

  it('flags default — repository read desligado', () => {
    expect(shouldUseAgendaRepositoryRead()).toBe(false);
  });
});

describe('agendaReadCutover — read primary + hydrate', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedLocalAppointments();
    __setAgendaServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
    __setAgendaRepositoryFactoryForTest(null);
  });

  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('listAppointments via repository quando READ_PRIMARY', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    await readHydrateAgendaCache(TENANT);
    const list = listAppointments({ tenantId: TENANT });
    expect(list.some((item) => item.id === APPT_REMOTE)).toBe(true);
    expect(mocks.adminApi.listAppointments).toHaveBeenCalled();
  });

  it('getAppointmentDetails via repository com joins locais', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    await readHydrateAgendaCache(TENANT);
    const details = getAppointmentDetails(APPT_LOCAL);
    expect(details?.appointment?.id).toBe(APPT_LOCAL);
    expect(details?.patient?.full_name).toBe('Paciente Local');
    expect(details?.professional?.apelido).toBe('Dr. A');
  });

  it('filtro por data', async () => {
    const mocks = createReadPrimaryMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));

    const byDate = readListAppointments({ date: '2026-07-09', tenantId: TENANT });
    expect(byDate?.every((item) => item.date === '2026-07-09')).toBe(true);
  });

  it('filtro por profissional', () => {
    const mocks = createReadPrimaryMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));

    const filtered = readListAppointments({ professionalId: 'col-001', tenantId: TENANT });
    expect(filtered?.every((item) => item.professionalId === 'col-001')).toBe(true);
  });

  it('filtro por sala', () => {
    const mocks = createReadPrimaryMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));

    const filtered = readListAppointments({ roomId: 'room-002', tenantId: TENANT });
    expect(filtered?.every((item) => item.roomId === 'room-002')).toBe(true);
  });

  it('filtro por status', () => {
    const mocks = createReadPrimaryMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));

    const filtered = readListAppointments({ status: 'cancelado', tenantId: TENANT });
    expect(filtered?.every((item) => item.status === 'cancelado')).toBe(true);
  });

  it('hydrate IDB após leitura remota', async () => {
    const mocks = createReadPrimaryMocks();
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: agendaIndexedDbRepository,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    await repo.listCore(TENANT);
    const row = loadDb().appointments.find((item) => item.id === APPT_REMOTE);
    expect(row?.procedureName).toBe('Avaliação remota');
    expect(row?.status).toBe('confirmado');
  });

  it('fetchAppointmentsByDate via read adapter', () => {
    const mocks = createReadPrimaryMocks();
    __setAgendaRepositoryFactoryForTest(() => new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    }));

    const rows = readFetchAppointmentsByDate('2026-07-09', TENANT);
    expect(rows?.length).toBeGreaterThan(0);
    const enriched = fetchAppointmentsByDate('2026-07-09', { tenantId: TENANT });
    expect(enriched[0]).toHaveProperty('flowColumn');
  });

  it('offline fallback IDB quando remoto falha', async () => {
    const mocks = createReadPrimaryMocks();
    mocks.adminApi.listAppointments.mockRejectedValue(new Error('Failed to fetch'));
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: { overrides: READ_PRIMARY_FLAGS },
    });

    const result = await repo.listCore(TENANT);
    expect(result.source).toBe('indexeddb-offline');
    expect(result.items.some((item) => item.legacyId === APPT_LOCAL)).toBe(true);
  });
});

describe('agendaReadCutover — fallback e escrita intacta', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    seedLocalAppointments();
  });

  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
    vi.restoreAllMocks();
  });

  it('READ_PRIMARY desligado usa legado IDB', () => {
    __setAgendaServiceBridgeFlagsForTest(null);
    expect(readListAppointments()).toBeNull();
    expect(readGetAppointment(APPT_LOCAL)).toBeNull();
    const list = listAppointments();
    expect(list.some((item) => item.id === APPT_LOCAL)).toBe(true);
  });

  it('SHADOW não altera retorno de listAppointments', async () => {
    const mocks = createReadPrimaryMocks([
      buildRemoteCore({ procedureName: 'Shadow divergente' }),
    ]);
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...READ_PRIMARY_FLAGS,
          AGENDA_SHADOW: true,
        },
      },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    await readHydrateAgendaCache(TENANT);
    const list = listAppointments({ tenantId: TENANT });
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it('COMPARE divergente não bloqueia getAppointmentDetails', async () => {
    const mocks = createReadPrimaryMocks([
      buildRemoteCore({ status: 'atrasado' }),
    ]);
    const repo = new AgendaRepository({
      adminApi: mocks.adminApi,
      indexedDb: mocks.indexedDb,
      cache: mocks.cache,
      flagsInput: {
        overrides: {
          ...READ_PRIMARY_FLAGS,
          AGENDA_COMPARE: true,
        },
      },
    });
    __setAgendaRepositoryFactoryForTest(() => repo);

    await readHydrateAgendaCache(TENANT);
    const report = await __compareAgendaIdbVsRemoteForTest(TENANT);
    expect(report?.mismatchCount).toBeGreaterThanOrEqual(0);
    const details = getAppointmentDetails(APPT_LOCAL);
    expect(details?.appointment?.id).toBe(APPT_LOCAL);
  });

  it('escrita createAppointment permanece IDB-first', () => {
    __setAgendaServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
    const before = loadDb().appointments.length;
    createAppointment(adminUser, {
      tenantId: TENANT,
      patientId: 'pat-new',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-11',
      startTime: '14:00',
      endTime: '14:30',
      procedureName: 'Novo agendamento',
    });
    const after = loadDb().appointments.length;
    expect(after).toBe(before + 1);
  });

  it('listBlocks continua lendo IDB com filtro opcional', () => {
    __setAgendaServiceBridgeFlagsForTest({ overrides: READ_PRIMARY_FLAGS });
    const blocks = listBlocks({ date: '2026-07-09' });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('block-001');
  });
});

describe('agendaReadCutover — contrato estrutural', () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = path.resolve(__dirname, '../..');

  it('appointmentService importa read adapter sem alterar exports de escrita', () => {
    const content = fs.readFileSync(
      path.join(REPO_ROOT, 'src/services/appointmentService.js'),
      'utf8',
    );
    expect(content).toContain('agendaReadAdapter.js');
    expect(content).toContain('agendaWriteAdapter.js');
    expect(content).toContain('export const createAppointment');
    expect(content).toContain('export const cancelAppointment');
  });

  it('patientFlowService importa read adapter sem alterar workflow', () => {
    const content = fs.readFileSync(
      path.join(REPO_ROOT, 'src/services/patientFlowService.js'),
      'utf8',
    );
    expect(content).toContain('readFetchAppointmentsByDate');
    expect(content).toContain('export const moveToFlowColumn');
  });
});
