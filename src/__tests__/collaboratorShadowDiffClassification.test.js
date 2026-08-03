/**
 * Sprint 1C Ticket 1.11 — Classificação shadow (blocking / transitional / informational).
 */
import { describe, expect, it } from 'vitest';

import {
  classifyShadowCompareResult,
  classifyShadowFieldDiff,
  isLocalUuidTransitional,
} from '../repositories/collaborator/collaboratorShadowDiffClassification.ts';
import {
  compareCollaborators,
  generateShadowReport,
} from '../repositories/collaborator/collaboratorShadowValidation.ts';
import { mapSupabaseRowToCore } from '../repositories/collaborator/collaboratorMapper.ts';
import {
  classifyShadowCompareResult as classifyShadowCompareResultJs,
  classifyShadowFieldDiff as classifyShadowFieldDiffJs,
} from '../../server/lib/rhShadowDiffClassification.js';
import { PROD_PROJECT_REF, assertStagingSupabaseUrl } from '../../server/lib/stagingSeedImplanprime.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const UUID_A = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const UUID_B = 'b2c3d4e5-f6a7-4890-b123-456789abcdef';
const LEGACY_A = 'col-shadow-classify-001';
const LEGACY_JULIANA = 'col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70';

function buildRow(overrides = {}) {
  return {
    id: UUID_A,
    tenant_id: TENANT,
    legacy_id: LEGACY_A,
    status: 'ativo',
    apelido: 'Ana',
    nome_completo: 'Ana Silva',
    email: 'ana@test.com',
    rh_categoria: 'corpo_clinico',
    cargo: 'dentista',
    agenda_enabled: false,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function coreFromRow(overrides = {}) {
  return mapSupabaseRowToCore(buildRow(overrides));
}

function localWithLegacyUuidFallback(overrides = {}) {
  const legacyId = overrides.legacyId ?? overrides.legacy_id ?? LEGACY_A;
  return {
    uuid: legacyId,
    legacyId,
    tenantId: TENANT,
    status: 'ativo',
    apelido: '',
    nomeCompleto: 'Ana Silva',
    email: 'ana@test.com',
    rhCategoria: 'corpo_clinico',
    cargo: 'dentista',
    agendaEnabled: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
    legacyId,
    uuid: overrides.uuid ?? legacyId,
  };
}

describe('collaboratorShadowDiffClassification — regras por campo', () => {
  it('uuid local ausente ou legacy fallback = transitional', () => {
    expect(isLocalUuidTransitional('', LEGACY_A)).toBe(true);
    expect(isLocalUuidTransitional(LEGACY_A, LEGACY_A)).toBe(true);

    const classified = classifyShadowFieldDiff(
      { field: 'uuid', localValue: LEGACY_A, remoteValue: UUID_A },
      { localUuid: LEGACY_A, localLegacyId: LEGACY_A },
    );
    expect(classified.tier).toBe('transitional_diff');
  });

  it('updated_at remoto mais recente = informational', () => {
    const classified = classifyShadowFieldDiff(
      {
        field: 'updated_at',
        localValue: '2026-06-29T21:06:47.286Z',
        remoteValue: '2026-06-29T23:28:17.967937+00:00',
      },
      { localUuid: LEGACY_A, localLegacyId: LEGACY_A },
    );
    expect(classified.tier).toBe('informational_diff');
  });

  it('updated_at local mais recente = informational (RC-03.1 — nunca blocking)', () => {
    const classified = classifyShadowFieldDiff(
      {
        field: 'updated_at',
        localValue: '2026-06-30T12:00:00.000Z',
        remoteValue: '2026-06-29T23:28:17.967937+00:00',
      },
      { localUuid: UUID_A, localLegacyId: LEGACY_A },
    );
    expect(classified.tier).toBe('informational_diff');
    expect(classified.reason).toMatch(/RC-01\.4/);
  });

  it('somente updated_at divergente = MATCH com matchPercent 100% e canPromoteReadPrimary', () => {
    const uuidC = 'c3d4e5f6-a7b8-4901-a234-567890abcdef';
    const uuidD = 'd4e5f6a7-b8c9-4012-8123-678901abcdef';
    const locals = [
      coreFromRow({ legacy_id: 'col-shadow-ts-001', updated_at: '2026-07-01T10:00:00.000Z' }),
      coreFromRow({ legacy_id: 'col-shadow-ts-002', id: UUID_B, updated_at: '2026-07-01T10:00:00.000Z' }),
      coreFromRow({ legacy_id: 'col-shadow-ts-003', id: uuidC, updated_at: '2026-07-01T10:00:00.000Z' }),
      coreFromRow({ legacy_id: 'col-shadow-ts-004', id: uuidD, updated_at: '2026-07-01T10:00:00.000Z' }),
    ];
    const remotes = [
      coreFromRow({ legacy_id: 'col-shadow-ts-001', updated_at: '2026-06-29T21:00:00.000Z' }),
      coreFromRow({ legacy_id: 'col-shadow-ts-002', id: UUID_B, updated_at: '2026-06-29T21:00:00.000Z' }),
      coreFromRow({ legacy_id: 'col-shadow-ts-003', id: uuidC, updated_at: '2026-06-29T21:00:00.000Z' }),
      coreFromRow({ legacy_id: 'col-shadow-ts-004', id: uuidD, updated_at: '2026-06-29T21:00:00.000Z' }),
    ];

    const compare = compareCollaborators(TENANT, locals, remotes);
    const report = generateShadowReport(compare, 1);

    expect(compare.match).toHaveLength(4);
    expect(report.summary.localCount).toBe(4);
    expect(report.summary.remoteCount).toBe(4);
    expect(report.matchPercent).toBe(100);
    expect(report.blockingDiffCount).toBe(0);
    expect(report.transitionalDiffCount).toBe(0);
    expect(report.canPromoteReadPrimary).toBe(true);
  });

  it('agenda_enabled divergente = blocking', () => {
    const classified = classifyShadowFieldDiff(
      { field: 'agenda_enabled', localValue: false, remoteValue: true },
      { localUuid: LEGACY_A, localLegacyId: LEGACY_A },
    );
    expect(classified.tier).toBe('blocking_diff');
    expect(classified.reason).toMatch(/agenda/i);
  });

  it('email divergente = blocking', () => {
    const classified = classifyShadowFieldDiff(
      { field: 'email', localValue: 'a@x.com', remoteValue: 'b@x.com' },
      { localUuid: UUID_A, localLegacyId: LEGACY_A },
    );
    expect(classified.tier).toBe('blocking_diff');
  });

  it('tenant_id divergente = blocking', () => {
    const classified = classifyShadowFieldDiff(
      { field: 'tenant_id', localValue: TENANT, remoteValue: 'other-tenant' },
      { localUuid: UUID_A, localLegacyId: LEGACY_A },
    );
    expect(classified.tier).toBe('blocking_diff');
  });

  it('legacy_id divergente = blocking', () => {
    const classified = classifyShadowFieldDiff(
      { field: 'legacy_id', localValue: LEGACY_A, remoteValue: 'col-other' },
      { localUuid: UUID_A, localLegacyId: LEGACY_A },
    );
    expect(classified.tier).toBe('blocking_diff');
  });
});

describe('collaboratorShadowDiffClassification — promoção read primary', () => {
  it('canPromoteReadPrimary false quando houver blocking', () => {
    const local = coreFromRow({ agenda_enabled: false });
    const remote = coreFromRow({ agenda_enabled: true });
    const compare = compareCollaborators(TENANT, [local], [remote]);
    const report = generateShadowReport(compare, 1);

    expect(report.blockingDiffCount).toBeGreaterThan(0);
    expect(report.canPromoteReadPrimary).toBe(false);
    expect(report.promotionBlockers.length).toBeGreaterThan(0);
  });

  it('canPromoteReadPrimary true quando só transitional/informational', () => {
    const local = localWithLegacyUuidFallback();
    const remote = coreFromRow({
      updated_at: '2026-06-29T23:28:17.967937+00:00',
    });
    local.updatedAt = '2026-06-29T21:06:47.286Z';

    const compare = compareCollaborators(TENANT, [local], [remote]);
    const report = generateShadowReport(compare, 1);

    expect(report.blockingDiffCount).toBe(0);
    expect(report.transitionalDiffCount).toBeGreaterThan(0);
    expect(report.informationalDiffCount).toBeGreaterThan(0);
    expect(report.canPromoteReadPrimary).toBe(true);
    expect(report.promotionBlockers).toEqual([]);
  });

  it('cenário staging Juliana: agenda_enabled blocking impede promoção', () => {
    const local = localWithLegacyUuidFallback({
      legacyId: LEGACY_JULIANA,
      nomeCompleto: 'Juliana',
      cargo: 'Implantodontista',
      rhCategoria: 'Corpo Clínico',
      email: 'juliana+staging@implanprime.test',
      agendaEnabled: false,
      updatedAt: '2026-06-29T21:06:46.241Z',
    });
    const remote = coreFromRow({
      id: UUID_B,
      legacy_id: LEGACY_JULIANA,
      nome_completo: 'Juliana',
      cargo: 'Implantodontista',
      rh_categoria: 'Corpo Clínico',
      email: 'juliana+staging@implanprime.test',
      agenda_enabled: true,
      updated_at: '2026-06-29T23:28:18.082968+00:00',
    });

    const compare = compareCollaborators(TENANT, [local], [remote]);
    const report = generateShadowReport(compare, 5);

    expect(report.canPromoteReadPrimary).toBe(false);
    expect(report.blockingDiffCount).toBe(1);
    expect(report.promotionBlockers.some((b) => /agenda_enabled/i.test(b))).toBe(true);
  });
});

describe('collaboratorShadowDiffClassification — paridade TS/JS', () => {
  it('classifyShadowFieldDiff JS alinha com TS', () => {
    const diff = { field: 'email', localValue: 'a@x.com', remoteValue: 'b@x.com' };
    const ctx = { localUuid: UUID_A, localLegacyId: LEGACY_A };
    const ts = classifyShadowFieldDiff(diff, ctx);
    const js = classifyShadowFieldDiffJs(diff, ctx);
    expect(js.tier).toBe(ts.tier);
    expect(js.reason).toBe(ts.reason);
  });

  it('classifyShadowCompareResult JS alinha com TS', () => {
    const local = localWithLegacyUuidFallback();
    const remote = coreFromRow({ updated_at: '2026-06-29T23:28:17.967937+00:00' });
    local.updatedAt = '2026-06-29T21:06:47.286Z';
    const compare = compareCollaborators(TENANT, [local], [remote]);

    const ts = classifyShadowCompareResult(compare);
    const js = classifyShadowCompareResultJs(compare);

    expect(js.blockingDiffCount).toBe(ts.blockingDiffCount);
    expect(js.transitionalDiffCount).toBe(ts.transitionalDiffCount);
    expect(js.informationalDiffCount).toBe(ts.informationalDiffCount);
    expect(js.canPromoteReadPrimary).toBe(ts.canPromoteReadPrimary);
  });
});

describe('collaboratorShadowDiffClassification — segurança operacional', () => {
  it('zero escrita — classificação é função pura', () => {
    const local = coreFromRow();
    const compare = compareCollaborators(TENANT, [local], [local]);
    const before = JSON.stringify(compare);
    classifyShadowCompareResult(compare);
    expect(JSON.stringify(compare)).toBe(before);
  });

  it('produção bloqueada via assertStagingSupabaseUrl', () => {
    expect(() =>
      assertStagingSupabaseUrl(`https://${PROD_PROJECT_REF}.supabase.co`),
    ).toThrow(/produção|PROD|uoepkwhqztmsjnzirpev/i);
  });
});
