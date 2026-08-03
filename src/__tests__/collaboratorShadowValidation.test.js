/**
 * Sprint 1B Ticket 1.7 — Shadow read validation (compare + report + logs DEV).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  compareCollaboratorFields,
  compareCollaborators,
  generateShadowReport,
  logRhShadowDev,
  runWithShadowTimeout,
  RH_SHADOW_DEFAULT_TIMEOUT_MS,
} from '../repositories/collaborator/collaboratorShadowValidation.ts';
import { mapSupabaseRowToCore } from '../repositories/collaborator/collaboratorMapper.ts';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const OTHER_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UUID_A = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const UUID_B = 'b2c3d4e5-f6a7-4890-b123-456789abcdef0';
const LEGACY_A = 'col-shadow-test-001';
const LEGACY_B = 'col-shadow-test-002';

function buildRow(overrides = {}) {
  return {
    id: UUID_A,
    tenant_id: TENANT,
    legacy_id: LEGACY_A,
    status: 'ativo',
    apelido: 'Ana',
    nome_completo: 'Ana Silva',
    nome_social: null,
    sexo: null,
    data_nascimento: null,
    email: 'ana@test.com',
    foto_url: null,
    rh_categoria: 'corpo_clinico',
    cargo: 'dentista',
    rh_funcao_descricao: null,
    tipo_vinculo: 'clt',
    setor: 'clinico',
    especialidades: [],
    registro_profissional: null,
    conselho_nome: null,
    conselho_uf: null,
    agenda_enabled: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    created_by: null,
    updated_by: null,
    deleted_at: null,
    ...overrides,
  };
}

function coreFromRow(overrides = {}) {
  return mapSupabaseRowToCore(buildRow(overrides));
}

describe('collaboratorShadowValidation — compareCollaboratorFields', () => {
  it('registros idênticos não geram field_diff', () => {
    const item = coreFromRow();
    expect(compareCollaboratorFields(item, { ...item })).toEqual([]);
  });

  it('campo diferente gera field_diff', () => {
    const local = coreFromRow();
    const remote = coreFromRow({ email: 'outro@test.com', cargo: 'recepcionista' });
    const diffs = compareCollaboratorFields(local, remote);
    expect(diffs.some((d) => d.field === 'email')).toBe(true);
    expect(diffs.some((d) => d.field === 'cargo')).toBe(true);
  });
});

describe('collaboratorShadowValidation — compareCollaborators', () => {
  it('100% match quando local e remote são iguais', () => {
    const item = coreFromRow();
    const result = compareCollaborators(TENANT, [item], [item]);

    expect(result.match).toHaveLength(1);
    expect(result.missing_local).toHaveLength(0);
    expect(result.missing_remote).toHaveLength(0);
    expect(result.field_diff).toHaveLength(0);
    expect(result.counts.local).toBe(1);
    expect(result.counts.remote).toBe(1);
  });

  it('registro ausente no remote → missing_remote', () => {
    const local = coreFromRow();
    const result = compareCollaborators(TENANT, [local], []);

    expect(result.missing_remote).toHaveLength(1);
    expect(result.missing_remote[0].ref.legacyId).toBe(LEGACY_A);
    expect(result.missing_local).toHaveLength(0);
  });

  it('registro ausente no local → missing_local', () => {
    const remote = coreFromRow();
    const result = compareCollaborators(TENANT, [], [remote]);

    expect(result.missing_local).toHaveLength(1);
    expect(result.missing_local[0].ref.legacyId).toBe(LEGACY_A);
    expect(result.missing_remote).toHaveLength(0);
  });

  it('campo diferente entre pares → field_diff', () => {
    const local = coreFromRow();
    const remote = coreFromRow({ nome_completo: 'Ana Diferente' });
    const result = compareCollaborators(TENANT, [local], [remote]);

    expect(result.field_diff).toHaveLength(1);
    expect(result.field_diff[0].diffs.some((d) => d.field === 'nome')).toBe(true);
    expect(result.match).toHaveLength(0);
  });

  it('UUID inválido é detectado em ambos os lados', () => {
    const local = coreFromRow({ id: 'not-a-uuid' });
    const remote = coreFromRow({ id: 'also-bad' });
    const result = compareCollaborators(TENANT, [local], [remote]);

    expect(result.invalid_uuid.length).toBeGreaterThanOrEqual(2);
  });

  it('legacy inválido é detectado', () => {
    const local = coreFromRow({ legacy_id: 'bad-legacy' });
    const remote = coreFromRow({ legacy_id: 'xpto-123', id: UUID_B });
    const result = compareCollaborators(TENANT, [local], [remote]);

    expect(result.invalid_legacy.length).toBeGreaterThanOrEqual(2);
  });

  it('duplicate legacy_id no mesmo lado', () => {
    const a = coreFromRow();
    const b = coreFromRow({ id: UUID_B, legacy_id: LEGACY_A });
    const result = compareCollaborators(TENANT, [a, b], []);

    expect(result.duplicate.some((d) => d.key === 'legacy_id' && d.side === 'local')).toBe(true);
  });

  it('tenant diferente — registros de outro tenant são ignorados na comparação', () => {
    const local = coreFromRow();
    const foreign = coreFromRow({ tenant_id: OTHER_TENANT, id: UUID_B, legacy_id: LEGACY_B });
    const result = compareCollaborators(TENANT, [local, foreign], [local]);

    expect(result.counts.local).toBe(1);
    expect(result.match).toHaveLength(1);
  });

  it('tenant_id divergente entre par gera field_diff em compareCollaboratorFields', () => {
    const local = coreFromRow();
    const remote = coreFromRow({ tenant_id: OTHER_TENANT });
    const diffs = compareCollaboratorFields(local, remote);
    expect(diffs.some((d) => d.field === 'tenant_id')).toBe(true);
  });
});

describe('collaboratorShadowValidation — generateShadowReport', () => {
  it('relatório 100% match tem matchPercent 100 e diffCount 0', () => {
    const item = coreFromRow();
    const compare = compareCollaborators(TENANT, [item], [item]);
    const report = generateShadowReport(compare, 42);

    expect(report.tenant).toBe(TENANT);
    expect(report.matchPercent).toBe(100);
    expect(report.diffCount).toBe(0);
    expect(report.durationMs).toBe(42);
    expect(report.summary.matchCount).toBe(1);
    expect(report.details).not.toBeNull();
  });

  it('relatório com diffs incrementa diffCount', () => {
    const local = coreFromRow();
    const remote = coreFromRow({ status: 'inativo' });
    const compare = compareCollaborators(TENANT, [local], [remote]);
    const report = generateShadowReport(compare, 10);

    expect(report.diffCount).toBeGreaterThan(0);
    expect(report.matchPercent).toBeLessThan(100);
    expect(report.summary.fieldDiffCount).toBe(1);
  });

  it('relatório de erro Supabase/IDB não lança', () => {
    const report = generateShadowReport({
      tenantId: TENANT,
      error: 'supabase down',
      durationMs: 5,
    });

    expect(report.error).toBe('supabase down');
    expect(report.details).toBeNull();
    expect(report.matchPercent).toBe(0);
  });

  it('relatório de timeout marca timedOut', () => {
    const report = generateShadowReport({
      tenantId: TENANT,
      error: 'RH_SHADOW timeout após 15000ms',
      durationMs: 15000,
      timedOut: true,
    });

    expect(report.timedOut).toBe(true);
    expect(report.error).toContain('timeout');
  });
});

describe('collaboratorShadowValidation — runWithShadowTimeout', () => {
  it('resolve promise dentro do timeout', async () => {
    const value = await runWithShadowTimeout(Promise.resolve('ok'), 100);
    expect(value).toBe('ok');
  });

  it('rejeita com timeout', async () => {
    const never = new Promise(() => {});
    await expect(runWithShadowTimeout(never, 20)).rejects.toThrow(/timeout/i);
  });

  it('propaga erro Supabase', async () => {
    await expect(
      runWithShadowTimeout(Promise.reject(new Error('supabase down')), 100),
    ).rejects.toThrow('supabase down');
  });

  it('propaga erro IDB', async () => {
    await expect(
      runWithShadowTimeout(Promise.reject(new Error('indexeddb read failed')), 100),
    ).rejects.toThrow('indexeddb read failed');
  });
});

describe('collaboratorShadowValidation — logRhShadowDev', () => {
  const originalDev = import.meta.env.DEV;

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    import.meta.env.DEV = originalDev;
    vi.restoreAllMocks();
  });

  it('não loga em produção', () => {
    import.meta.env.DEV = false;
    const item = coreFromRow();
    const compare = compareCollaborators(TENANT, [item], [item]);
    logRhShadowDev(generateShadowReport(compare, 1), 'test');
    expect(console.debug).not.toHaveBeenCalled();
  });

  it('loga [RH_SHADOW] estruturado em DEV', () => {
    import.meta.env.DEV = true;
    const item = coreFromRow();
    const compare = compareCollaborators(TENANT, [item], [item]);
    logRhShadowDev(generateShadowReport(compare, 25), 'listCollaborators');

    expect(console.debug).toHaveBeenCalledWith(
      '[RH_SHADOW]',
      expect.objectContaining({
        tenant: TENANT,
        matchPercent: 100,
        diffCount: 0,
        durationMs: 25,
        context: 'listCollaborators',
      }),
    );
  });

  it('loga erro silenciosamente em DEV sem throw', () => {
    import.meta.env.DEV = true;
    expect(() => {
      logRhShadowDev(
        generateShadowReport({ tenantId: TENANT, error: 'supabase down' }),
        'getCollaborator',
      );
    }).not.toThrow();
    expect(console.debug).toHaveBeenCalledWith(
      '[RH_SHADOW]',
      expect.objectContaining({ error: 'supabase down' }),
    );
  });
});

describe('collaboratorShadowValidation — constantes', () => {
  it('timeout padrão é 15s', () => {
    expect(RH_SHADOW_DEFAULT_TIMEOUT_MS).toBe(15_000);
  });
});
