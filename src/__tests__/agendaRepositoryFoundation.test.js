/**
 * Phase 5.7 — Agenda Repository Foundation (structural tests only).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb } from '../db/index.js';
import { AgendaRepository } from '../repositories/agenda/agendaRepository.ts';
import { createAgendaCache, AGENDA_CACHE_TTL_MS } from '../repositories/agenda/agendaCache.ts';
import {
  getAgendaRepositoryFlags,
  isAgendaReadPrimaryEnabled,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from '../repositories/agenda/agendaRepositoryFlags.ts';
import {
  mapLegacyRowToCore,
  mapServerRowToCore,
  mapCoreToLegacyRow,
} from '../repositories/agenda/agendaMapper.ts';
import { agendaIndexedDbRepository } from '../repositories/agenda/agendaIndexedDbRepository.ts';
import {
  __setAgendaRepositoryFactoryForTest,
  __setAgendaServiceBridgeFlagsForTest,
  shouldUseAgendaRepositoryRead,
  getAgendaRepositoryForRead,
} from '../services/agendaRepositoryBridge.js';
import {
  readListAppointments,
  readGetAppointment,
  readListAppointmentBlocks,
} from '../services/agendaReadAdapter.js';
import { AGENDA_TEST_FLAG_CONTRACT } from './rhTestFlagContract.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const APPT_ID = 'appt-foundation-001';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../repositories/agenda');

const EXPECTED_AGENDA_REPO_FILES = [
  'agendaAdminApiRepository.ts',
  'agendaCache.ts',
  'agendaIndexedDbRepository.ts',
  'agendaMapper.ts',
  'agendaRepository.ts',
  'agendaRepositoryFlags.ts',
  'agendaRepositorySync.ts',
  'agendaTypes.ts',
].sort();

function seedAppointment(overrides = {}) {
  withDb((db) => {
    db.appointments = [{
      id: APPT_ID,
      tenant_id: TENANT,
      patientId: 'pat-001',
      professionalId: 'col-001',
      roomId: 'room-001',
      date: '2026-07-09',
      startTime: '09:00',
      endTime: '09:30',
      durationMinutes: 30,
      slotCapacity: 1,
      status: 'agendado',
      procedureName: 'Consulta',
      channel: 'telefone',
      notes: '',
      ...overrides,
    }];
    db.appointmentBlocks = [{
      id: 'block-001',
      date: '2026-07-09',
      startTime: '12:00',
      endTime: '13:00',
      professionalId: 'col-001',
      reason: 'Almoço',
    }];
    return db;
  });
}

describe('agendaRepositoryFoundation — flags', () => {
  it('contrato vitest mantém flags Agenda OFF', () => {
    expect(AGENDA_TEST_FLAG_CONTRACT.VITE_AGENDA_READ).toBe('false');
    expect(AGENDA_TEST_FLAG_CONTRACT.VITE_AGENDA_READ_PRIMARY).toBe('false');
    expect(AGENDA_TEST_FLAG_CONTRACT.VITE_AGENDA_WRITE).toBe('false');
    expect(AGENDA_TEST_FLAG_CONTRACT.VITE_AGENDA_SHADOW).toBe('false');
    expect(AGENDA_TEST_FLAG_CONTRACT.VITE_AGENDA_COMPARE).toBe('false');
  });

  it('WRITE requer AGENDA_READ', () => {
    expect(() => getAgendaRepositoryFlags({
      overrides: { AGENDA_WRITE: true, AGENDA_READ: false },
    })).toThrow(/AGENDA_WRITE/);
  });

  it('READ_PRIMARY exige AGENDA_READ', () => {
    expect(() => getAgendaRepositoryFlags({
      overrides: { AGENDA_READ_PRIMARY: true, AGENDA_READ: false },
    })).toThrow(/AGENDA_READ_PRIMARY/);
  });

  it('COMPARE exige path de leitura', () => {
    expect(() => getAgendaRepositoryFlags({
      overrides: { AGENDA_COMPARE: true, AGENDA_READ: false, AGENDA_SHADOW: false },
    })).toThrow(/AGENDA_COMPARE/);
  });

  it('build PROD trava READ_PRIMARY', () => {
    const originalProd = import.meta.env.PROD;
    import.meta.env.PROD = true;
    try {
      const flags = getAgendaRepositoryFlags({
        overrides: {
          AGENDA_READ: true,
          AGENDA_READ_PRIMARY: true,
        },
      });
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

  it('defaults — repository read desligado', () => {
    expect(shouldUseAgendaRepositoryRead()).toBe(false);
  });
});

describe('agendaRepositoryFoundation — mapper', () => {
  it('mapLegacyRowToCore preserva campos core', () => {
    const core = mapLegacyRowToCore({
      id: APPT_ID,
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
    expect(core?.legacyId).toBe(APPT_ID);
    expect(core?.tenantId).toBe(TENANT);
    expect(core?.status).toBe('agendado');
  });

  it('mapServerRowToCore aceita snake_case remoto', () => {
    const core = mapServerRowToCore({
      tenant_id: TENANT,
      id: APPT_ID,
      patient_id: 'pat-001',
      professional_id: 'col-001',
      room_id: 'room-001',
      date: '2026-07-09',
      start_time: '10:00',
      end_time: '10:30',
      status: 'confirmado',
      procedure_name: 'Retorno',
    });
    expect(core?.legacyId).toBe(APPT_ID);
    expect(core?.status).toBe('confirmado');
  });

  it('mapCoreToLegacyRow roundtrip básico', () => {
    const core = mapLegacyRowToCore({
      id: APPT_ID,
      tenant_id: TENANT,
      date: '2026-07-09',
      startTime: '09:00',
      endTime: '09:30',
      status: 'agendado',
    });
    expect(core).toBeTruthy();
    const legacy = mapCoreToLegacyRow(core);
    expect(legacy.id).toBe(APPT_ID);
    expect(legacy.tenant_id).toBe(TENANT);
  });
});

describe('agendaRepositoryFoundation — cache', () => {
  it('TTL e namespace exportados', () => {
    expect(AGENDA_CACHE_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('cache set/get por tenant e legacyId', () => {
    const cache = createAgendaCache();
    const core = mapLegacyRowToCore({
      id: APPT_ID,
      tenant_id: TENANT,
      date: '2026-07-09',
      startTime: '09:00',
      endTime: '09:30',
      status: 'agendado',
      procedureName: 'Consulta',
    });
    expect(core).toBeTruthy();
    cache.set(TENANT, core);
    expect(cache.get(TENANT, APPT_ID)?.procedureName).toBe('Consulta');
    cache.invalidateTenant(TENANT);
    expect(cache.get(TENANT, APPT_ID)).toBeNull();
  });
});

describe('agendaRepositoryFoundation — IDB reader + repository contracts', () => {
  beforeEach(async () => {
    await resetDb();
    await initDb();
    seedAppointment();
  });

  it('indexedDb listLegacySync filtra por data', () => {
    const rows = agendaIndexedDbRepository.listLegacySync({ date: '2026-07-09', tenantId: TENANT });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(APPT_ID);
  });

  it('repository listCore com flags default retorna indexeddb', async () => {
    const repo = new AgendaRepository();
    const result = await repo.listCore(TENANT, { date: '2026-07-09' });
    expect(result.source).toBe('indexeddb');
    expect(result.total).toBe(1);
  });

  it('repository getCore com flags default retorna indexeddb', async () => {
    const repo = new AgendaRepository();
    const result = await repo.getCore(TENANT, APPT_ID);
    expect(result.source).toBe('indexeddb');
    expect(result.core?.legacyId).toBe(APPT_ID);
  });

  it('syncCacheFromRemote retorna 0 quando READ_PRIMARY off', async () => {
    const repo = new AgendaRepository();
    expect(await repo.syncCacheFromRemote(TENANT)).toBe(0);
  });

  it('compareIdbVsRemote retorna null quando COMPARE off', async () => {
    const repo = new AgendaRepository();
    expect(await repo.compareIdbVsRemote(TENANT)).toBeNull();
  });
});

describe('agendaRepositoryFoundation — bridge + read adapter wiring', () => {
  afterEach(() => {
    __setAgendaServiceBridgeFlagsForTest(null);
    __setAgendaRepositoryFactoryForTest(null);
  });

  it('read adapter retorna null com flags default', () => {
    expect(readListAppointments({ tenantId: TENANT })).toBeNull();
    expect(readGetAppointment(APPT_ID, TENANT)).toBeNull();
    expect(readListAppointmentBlocks({ date: '2026-07-09' })).toBeNull();
  });

  it('bridge factory injetável em testes', () => {
    const mockRepo = {
      listLegacySync: vi.fn(() => []),
      getLegacySync: vi.fn(() => null),
      listBlocksLegacySync: vi.fn(() => []),
      listCore: vi.fn(),
      getCore: vi.fn(),
      syncCacheFromRemote: vi.fn(),
      compareIdbVsRemote: vi.fn(),
    };
    __setAgendaRepositoryFactoryForTest(() => mockRepo);
    expect(getAgendaRepositoryForRead()).toBe(mockRepo);
  });
});

describe('agendaRepositoryFoundation — inventário de arquivos', () => {
  it('módulo agenda contém apenas arquivos esperados da foundation', () => {
    const files = readdirSync(REPO_ROOT).sort();
    expect(files).toEqual(EXPECTED_AGENDA_REPO_FILES);
  });
});
