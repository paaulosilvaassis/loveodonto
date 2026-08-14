import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectOdontogramEvents } from '../domain/odontogram/index.js';
import { createOdontogramClinicalCommandService } from '../services/odontogramClinicalCommandService.js';
import { createInMemoryOdontogramTransactionPort } from './fixtures/inMemoryOdontogramTransactionPort.js';

const TENANT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0001';
const USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002';
const OTHER_TENANT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099';
const OTHER_USER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0098';
const SERVICE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../services/odontogramClinicalCommandService.js',
);

let idSeq = 0;
function ids() {
  return () => {
    idSeq += 1;
    return `aaaaaaaa-bbbb-4ccc-8ddd-${String(idSeq).padStart(12, '0')}`;
  };
}

function actor(overrides = {}) {
  return {
    kind: 'TrustedOdontogramServerActor',
    userId: USER,
    tenantId: TENANT,
    patientId: 'patient-test-1',
    permissions: [
      'prontuario_odontograma:create',
      'prontuario_odontograma:edit',
      'prontuario_odontograma:view',
    ],
    tenantMatches: true,
    patientMatches: true,
    adminOverride: false,
    ...overrides,
  };
}

function service(port, idGenerator = ids()) {
  return createOdontogramClinicalCommandService({
    transactionPort: port,
    idGenerator,
    clock: () => '2026-03-01T12:00:00.000Z',
  });
}

async function createDraft(port) {
  const api = service(port);
  return api.executeCommand({
    actorContext: actor(),
    command: {
      intent: 'chart_created',
      expectedRowVersion: 0,
      dentitionStage: 'permanent',
      occurredAt: '2026-03-01T12:00:00.000Z',
    },
  });
}

describe('OD-1E command service — arquitetura e contexto confiável', () => {
  it('não importa Supabase, storage do browser, React/UI nem segredo de service_role', async () => {
    const source = readFileSync(SERVICE_FILE, 'utf8');
    expect(source).not.toMatch(/@supabase|createClient|indexedDB|localStorage|from ['"]react|three|service_role_key|SUPABASE_SERVICE_ROLE/i);
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/from ['"].*db\//);
    expect(source).toMatch(/withTransaction/);
    expect(source).not.toMatch(/transactionPort\.(insertEvent|insertChart|updateChart)/);
    const broken = createOdontogramClinicalCommandService({});
    expect((await broken.executeCommand({
      actorContext: actor(),
      command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'permanent' },
    })).error.code).toBe('TRANSACTION_PORT_INVALID');
  });

  it('nega ator ausente, UUID malformado, flags truthy e impersonação de created_by', async () => {
    const api = service(createInMemoryOdontogramTransactionPort());
    expect((await api.executeCommand({ command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'permanent' } })).error.code)
      .toBe('INVALID_ACTOR_CONTEXT');
    expect((await api.executeCommand({
      actorContext: actor({ userId: 'evt-1' }),
      command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'permanent' },
    })).error.code).toBe('INVALID_ACTOR_CONTEXT');
    expect((await api.executeCommand({
      actorContext: actor({ adminOverride: 'true' }),
      command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'permanent' },
    })).error.code).toBe('INVALID_ACTOR_CONTEXT');
    expect((await api.executeCommand({
      actorContext: actor({ tenantMatches: false, adminOverride: true }),
      command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'permanent' },
    })).error.code).toBe('TENANT_MISMATCH');
    expect((await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'chart_created',
        expectedRowVersion: 0,
        dentitionStage: 'permanent',
        adminOverride: true,
      },
    })).error.code).toBe('INVALID_COMMAND');
    expect((await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'chart_created',
        expectedRowVersion: 0,
        dentitionStage: 'permanent',
        createdBy: OTHER_USER,
      },
    })).error.code).toBe('INVALID_COMMAND');
  });
});

describe('OD-1E criação e mutação transacional', () => {
  it('cria chart+evento atômicos, sequence 1, previous hash null e recusa segundo chart ativo', async () => {
    const port = createInMemoryOdontogramTransactionPort();
    const created = await createDraft(port);
    expect(created.ok).toBe(true);
    expect(created.value.event.sequence).toBe(1);
    expect(created.value.event.previousEventHash).toBeNull();
    expect(created.value.event.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.value.rowVersion).toBe(1);
    expect(port.state.charts).toHaveLength(1);
    expect(port.state.events).toHaveLength(1);
    expect(created.value.event.actorId).toBe(USER);
    const duplicate = await createDraft(port);
    expect(duplicate.error.code).toBe('ACTIVE_CHART_ALREADY_EXISTS');
    expect((await service(port).executeCommand({
      actorContext: actor({ permissions: ['prontuario_odontograma:view'] }),
      command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'permanent' },
    })).error.code).toBe('AUTHORIZATION_DENIED');
    expect((await service(createInMemoryOdontogramTransactionPort()).executeCommand({
      actorContext: actor(),
      command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'deciduous' },
    })).error.code).toBe('INVALID_COMMAND');
  });

  it('incrementa row_version uma vez, deriva sequence e rejeita stale version, sequence e hash do caller', async () => {
    const port = createInMemoryOdontogramTransactionPort();
    const created = await createDraft(port);
    const api = service(port);
    const recorded = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_recorded',
        chartId: created.value.chartId,
        expectedRowVersion: 1,
        toothFdi: '16',
        conditionCode: 'caries',
        surfaces: ['O'],
      },
    });
    expect(recorded.ok).toBe(true);
    expect(recorded.value.event.sequence).toBe(2);
    expect(recorded.value.rowVersion).toBe(2);
    expect(port.state.charts[0].rowVersion).toBe(2);
    expect(recorded.value.versionsCreated).toBe(0);
    expect((await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_recorded',
        chartId: created.value.chartId,
        expectedRowVersion: 1,
        toothFdi: '26',
        conditionCode: 'caries',
      },
    })).error.code).toBe('OPTIMISTIC_CONCURRENCY_CONFLICT');
    expect((await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_recorded',
        chartId: created.value.chartId,
        expectedRowVersion: 2,
        toothFdi: '26',
        conditionCode: 'caries',
        sequence: 99,
      },
    })).error.code).toBe('INVALID_COMMAND');
    expect((await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_recorded',
        chartId: created.value.chartId,
        expectedRowVersion: 2,
        toothFdi: '26',
        conditionCode: 'caries',
        eventHash: 'a'.repeat(64),
      },
    })).error.code).toBe('INVALID_COMMAND');
  });

  it('projeta o estado do dente pelo OD-1C, preserva histórico na remoção e last_event_id', async () => {
    const port = createInMemoryOdontogramTransactionPort();
    const created = await createDraft(port);
    const api = service(port);
    const recorded = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_recorded',
        chartId: created.value.chartId,
        expectedRowVersion: 1,
        toothFdi: '16',
        conditionCode: 'caries',
        surfaces: ['O'],
      },
    });
    const replayed = projectOdontogramEvents(port.state.events);
    expect(replayed.value.teeth['16'].conditionCode).toBe(recorded.value.projection.teeth['16'].conditionCode);
    expect(port.state.toothStates[0].lastEventId).toBe(recorded.value.event.id);
    expect(JSON.stringify(port.state.toothStates[0].state)).not.toMatch(/color|mesh|amount_paid|receivable/);
    const removed = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_removed',
        chartId: created.value.chartId,
        expectedRowVersion: 2,
        toothFdi: '16',
        referencedEventId: recorded.value.event.id,
        reason: 'Lançamento no dente errado.',
      },
    });
    expect(removed.ok).toBe(true);
    expect(removed.value.projection.teeth['16']).toBeUndefined();
    expect(port.state.events).toHaveLength(3);
    expect(port.state.toothStates[0].deletedAt).toBeTruthy();
    expect(port.state.events.filter((item) => item.eventType === 'condition_recorded')).toHaveLength(1);
  });

  it('rejeita correção cross-chart e duplicada; budget_item sozinho não conclui procedimento', async () => {
    const port = createInMemoryOdontogramTransactionPort();
    const first = await createDraft(port);
    const api = service(port);
    const recorded = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_recorded',
        chartId: first.value.chartId,
        expectedRowVersion: 1,
        toothFdi: '16',
        conditionCode: 'caries',
      },
    });
    const otherPort = createInMemoryOdontogramTransactionPort();
    const other = await service(otherPort).executeCommand({
      actorContext: actor({ patientId: 'patient-test-2' }),
      command: { intent: 'chart_created', expectedRowVersion: 0, dentitionStage: 'permanent' },
    });
    const otherRecorded = await service(otherPort).executeCommand({
      actorContext: actor({ patientId: 'patient-test-2' }),
      command: {
        intent: 'condition_recorded',
        chartId: other.value.chartId,
        expectedRowVersion: 1,
        toothFdi: '16',
        conditionCode: 'caries',
      },
    });
    const cross = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_corrected',
        chartId: first.value.chartId,
        expectedRowVersion: 2,
        toothFdi: '16',
        conditionCode: 'restoration',
        referencedEventId: otherRecorded.value.event.id,
        reason: 'Correção indevida de outro chart.',
      },
    });
    expect(cross.error.code).toBe('CORRECTION_REFERENCE_INVALID');
    const originalId = recorded.value.event.id;
    const corrected = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_corrected',
        chartId: first.value.chartId,
        expectedRowVersion: 2,
        toothFdi: '16',
        conditionCode: 'restoration',
        referencedEventId: originalId,
        reason: 'Ajuste clínico.',
      },
    });
    expect(corrected.ok).toBe(true);
    expect(port.state.events.find((item) => item.id === originalId).conditionCode).toBe('caries');
    const duplicate = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_corrected',
        chartId: first.value.chartId,
        expectedRowVersion: 3,
        toothFdi: '16',
        conditionCode: 'crown_or_prosthesis',
        referencedEventId: originalId,
        reason: 'Segunda correção.',
      },
    });
    expect(duplicate.error.code).toBe('CORRECTION_REFERENCE_INVALID');
    expect((await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'procedure_completed',
        chartId: first.value.chartId,
        expectedRowVersion: 3,
        budgetItemId: 'budget-item-1',
      },
    })).error.code).toBe('INVALID_COMMAND');
    const completed = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'procedure_completed',
        chartId: first.value.chartId,
        expectedRowVersion: 3,
        executedProcedureId: 'exec-test-1',
        budgetItemId: 'budget-item-1',
      },
    });
    expect(completed.ok).toBe(true);
    expect(completed.value.event.executedProcedureId).toBe('exec-test-1');
  });

  it('bloqueia mutação em chart finalizado, reabre com versão e finaliza criando versão imutável', async () => {
    const port = createInMemoryOdontogramTransactionPort();
    const created = await createDraft(port);
    const api = service(port);
    const finalized = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'chart_finalized',
        chartId: created.value.chartId,
        expectedRowVersion: 1,
      },
    });
    expect(finalized.ok).toBe(true);
    expect(finalized.value.versionsCreated).toBe(1);
    expect(port.state.versions).toHaveLength(1);
    expect(port.state.versions[0].versionNumber).toBe(1);
    expect((await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'condition_recorded',
        chartId: created.value.chartId,
        expectedRowVersion: 2,
        toothFdi: '16',
        conditionCode: 'caries',
      },
    })).error.code).toBe('AUTHORIZATION_DENIED');
    const reopened = await api.executeCommand({
      actorContext: actor(),
      command: {
        intent: 'chart_reopened',
        chartId: created.value.chartId,
        expectedRowVersion: 2,
        reason: 'Reabertura para correção clínica.',
      },
    });
    expect(reopened.ok).toBe(true);
    expect(reopened.value.projection.status).toBe('draft');
    expect(port.state.versions).toHaveLength(2);
    expect(port.state.versions[1].snapshotHash).toBe(port.state.versions[0].snapshotHash);
    expect(port.state.versions[1].versionNumber).toBe(2);
    expect((await api.executeCommand({
      actorContext: actor({ tenantId: OTHER_TENANT, adminOverride: true }),
      command: {
        intent: 'condition_recorded',
        chartId: created.value.chartId,
        expectedRowVersion: 3,
        toothFdi: '16',
        conditionCode: 'caries',
      },
    })).error.code).toBe('TENANT_MISMATCH');
  });
});

describe('OD-1E rollback fail-closed', () => {
  async function seeded() {
    const port = createInMemoryOdontogramTransactionPort();
    const created = await createDraft(port);
    return { port, created };
  }

  it('restaura o estado byte-a-byte após falha de evento, projeção, chart e versão', async () => {
    const cases = ['insertEvent', 'updateToothStateProjection', 'updateChartProjectionMetadata', 'insertChartVersion'];
    for (const failOn of cases) {
      const { port, created } = await seeded();
      const before = JSON.stringify(port.snapshot());
      const failing = createInMemoryOdontogramTransactionPort({
        state: port.state,
        failOn,
      });
      const api = service(failing);
      const intent = failOn === 'insertChartVersion' ? 'chart_finalized' : 'condition_recorded';
      const result = await api.executeCommand({
        actorContext: actor(),
        command: {
          intent,
          chartId: created.value.chartId,
          expectedRowVersion: 1,
          ...(intent === 'condition_recorded' ? { toothFdi: '16', conditionCode: 'caries' } : {}),
        },
      });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('TRANSACTION_FAILED');
      expect(JSON.stringify(failing.snapshot())).toBe(before);
    }
    const empty = createInMemoryOdontogramTransactionPort({ failOn: 'insertChart' });
    const beforeEmpty = JSON.stringify(empty.snapshot());
    const createdFail = await createDraft(empty);
    expect(createdFail.error.code).toBe('TRANSACTION_FAILED');
    expect(JSON.stringify(empty.snapshot())).toBe(beforeEmpty);
    expect(empty.state.charts).toEqual([]);
    expect(empty.state.events).toEqual([]);
  });
});
