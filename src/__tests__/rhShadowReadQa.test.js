import { describe, expect, it } from 'vitest';
import {
  STAGING_SHADOW_QA_TENANT,
  STAGING_SHADOW_QA_FLAGS,
  mapIdbExportRowToCore,
  mapSupabaseRowToCore,
  compareCollaboratorsForQa,
  generateRhShadowQaReport,
  formatRhShadowQaConsole,
} from '../../server/lib/rhShadowReadQa.js';
import {
  compareCollaborators,
  generateShadowReport,
} from '../repositories/collaborator/collaboratorShadowValidation.ts';
import { getCollaboratorRepositoryFlags } from '../repositories/collaborator/collaboratorRepositoryFlags.ts';

const SAMPLE_LOCAL = {
  id: 'col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341',
  uuid: 'a1111111-1111-4111-8111-111111111111',
  tenant_id: STAGING_SHADOW_QA_TENANT,
  status: 'ativo',
  nomeCompleto: 'Paulo Staging Assis',
  email: 'paulo+staging@implanprime.test',
  rhCategoria: 'Diretoria e Gestão',
  cargo: 'Gestor Geral',
  updatedAt: '2026-06-29T21:06:47.286Z',
};

const SAMPLE_REMOTE = {
  id: 'a1111111-1111-4111-8111-111111111111',
  legacy_id: 'col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341',
  tenant_id: STAGING_SHADOW_QA_TENANT,
  status: 'ativo',
  nome_completo: 'Paulo Staging Assis',
  email: 'paulo+staging@implanprime.test',
  rh_categoria: 'Diretoria e Gestão',
  cargo: 'Gestor Geral',
  agenda_enabled: false,
  updated_at: '2026-06-29T21:06:47.286Z',
};

describe('rhShadowReadQa — flags Ticket 1.10', () => {
  it('STAGING_SHADOW_QA_FLAGS reflete configuração segura', () => {
    expect(STAGING_SHADOW_QA_FLAGS.RH_SUPABASE_READ).toBe(true);
    expect(STAGING_SHADOW_QA_FLAGS.RH_SHADOW_READ).toBe(true);
    expect(STAGING_SHADOW_QA_FLAGS.RH_COMPARE_IDB_SUPABASE).toBe(true);
    expect(STAGING_SHADOW_QA_FLAGS.RH_SUPABASE_READ_PRIMARY).toBe(false);
    expect(STAGING_SHADOW_QA_FLAGS.RH_SUPABASE_WRITE).toBe(false);
  });

  it('getCollaboratorRepositoryFlags com overrides Ticket 1.10 não usa primary Supabase', () => {
    const flags = getCollaboratorRepositoryFlags({
      overrides: STAGING_SHADOW_QA_FLAGS,
    });
    expect(flags.RH_SUPABASE_READ).toBe(true);
    expect(flags.RH_SHADOW_READ).toBe(true);
    expect(flags.RH_COMPARE_IDB_SUPABASE).toBe(true);
    expect(flags.RH_SUPABASE_READ_PRIMARY).toBe(false);
    expect(flags.RH_SUPABASE_WRITE).toBe(false);
  });
});

describe('rhShadowReadQa — relatório [RH_SHADOW]', () => {
  it('generateRhShadowQaReport expõe campos exigidos', () => {
    const local = mapIdbExportRowToCore(SAMPLE_LOCAL, STAGING_SHADOW_QA_TENANT);
    const remote = mapSupabaseRowToCore(SAMPLE_REMOTE);
    const details = compareCollaboratorsForQa(STAGING_SHADOW_QA_TENANT, [local], [remote]);
    const report = generateRhShadowQaReport(details, 42);

    expect(report.tag).toBe('[RH_SHADOW]');
    expect(report.localCount).toBe(1);
    expect(report.remoteCount).toBe(1);
    expect(report.matchPercent).toBe(100);
    expect(report.diffCount).toBe(0);
    expect(report.writesExecuted).toBe(false);
    expect(report.productionTouched).toBe(false);
    expect(report.canPromoteReadPrimary).toBe(true);
    expect(report.blockingDiffCount).toBe(0);
    expect(report.summary).toMatchObject({
      missingLocalCount: 0,
      missingRemoteCount: 0,
      fieldDiffCount: 0,
    });
    expect(report.details.missing_local).toEqual([]);
    expect(report.details.missing_remote).toEqual([]);
    expect(report.details.field_diff).toEqual([]);
  });

  it('formatRhShadowQaConsole inclui métricas principais', () => {
    const local = mapIdbExportRowToCore(SAMPLE_LOCAL, STAGING_SHADOW_QA_TENANT);
    const remote = mapSupabaseRowToCore(SAMPLE_REMOTE);
    const details = compareCollaboratorsForQa(STAGING_SHADOW_QA_TENANT, [local], [remote]);
    const report = generateRhShadowQaReport(details, 10);
    const text = formatRhShadowQaConsole(report);

    expect(text).toContain('[RH_SHADOW]');
    expect(text).toContain('localCount: 1');
    expect(text).toContain('remoteCount: 1');
    expect(text).toContain('matchPercent: 100');
    expect(text).toContain('canPromoteReadPrimary: true');
    expect(text).toContain('blockingDiffCount: 0');
  });

  it('detecta field_diff quando e-mail diverge', () => {
    const local = mapIdbExportRowToCore(SAMPLE_LOCAL, STAGING_SHADOW_QA_TENANT);
    const remote = mapSupabaseRowToCore({
      ...SAMPLE_REMOTE,
      email: 'outro+staging@implanprime.test',
    });
    const details = compareCollaboratorsForQa(STAGING_SHADOW_QA_TENANT, [local], [remote]);
    const report = generateRhShadowQaReport(details, 5);

    expect(report.diffCount).toBeGreaterThan(0);
    expect(report.blockingDiffCount).toBeGreaterThan(0);
    expect(report.canPromoteReadPrimary).toBe(false);
    expect(report.details.field_diff).toHaveLength(1);
    expect(report.details.field_diff[0].diffs.some((d) => d.field === 'email')).toBe(true);
  });
});

describe('rhShadowReadQa — paridade com collaboratorShadowValidation', () => {
  it('compareCollaboratorsForQa alinha com compareCollaborators TS', () => {
    const local = mapIdbExportRowToCore(SAMPLE_LOCAL, STAGING_SHADOW_QA_TENANT);
    const remote = mapSupabaseRowToCore(SAMPLE_REMOTE);

    const qaDetails = compareCollaboratorsForQa(STAGING_SHADOW_QA_TENANT, [local], [remote]);
    const tsDetails = compareCollaborators(STAGING_SHADOW_QA_TENANT, [local], [remote]);

    expect(qaDetails.match).toHaveLength(tsDetails.match.length);
    expect(qaDetails.field_diff).toHaveLength(tsDetails.field_diff.length);
    expect(qaDetails.counts).toEqual(tsDetails.counts);

    const qaReport = generateRhShadowQaReport(qaDetails, 0);
    const tsReport = generateShadowReport(tsDetails, 0);
    expect(qaReport.matchPercent).toBe(tsReport.matchPercent);
    expect(qaReport.diffCount).toBe(tsReport.diffCount);
    expect(qaReport.blockingDiffCount).toBe(tsReport.blockingDiffCount);
    expect(qaReport.canPromoteReadPrimary).toBe(tsReport.canPromoteReadPrimary);
  });
});

describe('rhShadowReadQa — live staging (opcional)', () => {
  it.skipIf(!process.env.STAGING_SUPABASE_URL || !process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY)(
    'consulta read-only staging collaborators count',
    async () => {
      const { createClient } = await import('@supabase/supabase-js');
      const { assertStagingSupabaseUrl } = await import('../../server/lib/stagingSeedImplanprime.js');

      const url = process.env.STAGING_SUPABASE_URL;
      const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
      assertStagingSupabaseUrl(url);

      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await supabase
        .from('collaborators')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', STAGING_SHADOW_QA_TENANT);

      expect(error).toBeNull();
      expect(data).toBeDefined();
    },
  );
});
