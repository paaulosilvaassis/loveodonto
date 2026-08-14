import { describe, expect, it } from 'vitest';
import {
  buildChartVersion,
  canonicalizeJson,
  hashCanonicalSnapshot,
  projectOdontogramEvents,
} from '../domain/odontogram/index.js';

function clinicalStream() {
  return [
    {
      id: 'evt-1',
      sequence: 1,
      tenantId: 'tenant-test-1',
      chartId: 'chart-test-1',
      patientId: 'patient-test-1',
      actorId: 'dentist-test-1',
      eventType: 'chart_created',
      occurredAt: '2026-03-01T12:00:00.000Z',
      payload: { dentitionStage: 'permanent' },
    },
    {
      id: 'evt-2',
      sequence: 2,
      tenantId: 'tenant-test-1',
      chartId: 'chart-test-1',
      patientId: 'patient-test-1',
      actorId: 'dentist-test-1',
      eventType: 'condition_recorded',
      occurredAt: '2026-03-01T12:05:00.000Z',
      toothFdi: '16',
      conditionCode: 'caries',
      surfaces: ['O'],
    },
  ];
}

describe('OD-1C versionamento de snapshot', () => {
  it('exige versionNumber e sourceRowVersion inteiros positivos', async () => {
    const projected = projectOdontogramEvents(clinicalStream());
    expect(projected.ok).toBe(true);
    const invalids = [0, -1, 1.5, null, '1'];
    for (const versionNumber of invalids) {
      const result = await buildChartVersion({
        projection: projected.value,
        versionNumber,
        sourceRowVersion: 1,
        createdAt: '2026-03-01T13:00:00.000Z',
        createdBy: 'dentist-test-1',
      });
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe('INVALID_VERSION');
    }
    const rowInvalid = await buildChartVersion({
      projection: projected.value,
      versionNumber: 1,
      sourceRowVersion: 0,
      createdAt: '2026-03-01T13:00:00.000Z',
      createdBy: 'dentist-test-1',
    });
    expect(rowInvalid.error.code).toBe('INVALID_VERSION');
  });

  it('produz SHA-256 minúsculo de 64 chars, estável e independente de versionNumber', async () => {
    const projected = projectOdontogramEvents(clinicalStream());
    const first = await buildChartVersion({
      projection: projected.value,
      versionNumber: 1,
      sourceRowVersion: 4,
      createdAt: '2026-03-01T13:00:00.000Z',
      createdBy: 'dentist-test-1',
    });
    const second = await buildChartVersion({
      projection: projected.value,
      versionNumber: 2,
      sourceRowVersion: 5,
      createdAt: '2026-03-01T14:00:00.000Z',
      createdBy: 'dentist-test-1',
    });
    expect(first.ok).toBe(true);
    expect(first.value.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.value.snapshotHash).toBe(await hashCanonicalSnapshot(first.value.snapshot));
    expect(first.value.snapshotHash).toBe(second.value.snapshotHash);
    expect(first.value.versionNumber).not.toBe(second.value.versionNumber);
    expect(first.value.id).toBeNull();
  });

  it('não inclui o hash no snapshot e permanece imutável após mutação da projeção', async () => {
    const projected = projectOdontogramEvents(clinicalStream());
    const built = await buildChartVersion({
      projection: projected.value,
      versionNumber: 1,
      sourceRowVersion: 1,
      createdAt: '2026-03-01T13:00:00.000Z',
      createdBy: 'dentist-test-1',
      metadata: { note: 'snapshot fictício' },
    });
    expect(built.ok).toBe(true);
    expect(built.value.snapshot).not.toHaveProperty('snapshotHash');
    expect(built.value.snapshot).not.toHaveProperty('snapshot_hash');
    expect(built.value.snapshot.schemaVersion).toBe('1.0.0');
    expect(built.value.snapshot.chartId).toBe('chart-test-1');
    const originalCanonical = canonicalizeJson(built.value.snapshot);
    projected.value.teeth['16'].conditionCode = 'missing';
    projected.value.teeth['16'].surfaces.push('D');
    expect(built.value.snapshot.teeth['16'].conditionCode).toBe('caries');
    expect(canonicalizeJson(built.value.snapshot)).toBe(originalCanonical);
    expect(built.value.snapshotHash).toBe(await hashCanonicalSnapshot(built.value.snapshot));
  });

  it('gera snapshot canônico determinístico suficiente para render clínico', async () => {
    const projected = projectOdontogramEvents(clinicalStream());
    const left = await buildChartVersion({
      projection: projected.value,
      versionNumber: 1,
      sourceRowVersion: 1,
      createdAt: '2026-03-01T13:00:00.000Z',
      createdBy: 'dentist-test-1',
    });
    const right = await buildChartVersion({
      projection: projected.value,
      versionNumber: 1,
      sourceRowVersion: 1,
      createdAt: '2026-03-01T13:00:00.000Z',
      createdBy: 'dentist-test-1',
    });
    expect(canonicalizeJson(left.value.snapshot)).toBe(canonicalizeJson(right.value.snapshot));
    expect(left.value.snapshot.teeth['16']).toEqual({
      fdi: '16',
      conditionCode: 'caries',
      surfaces: ['O'],
      sourceEventId: 'evt-2',
    });
    expect(left.value.snapshot).not.toHaveProperty('amount');
    expect(left.value.snapshot).not.toHaveProperty('color');
  });
});
