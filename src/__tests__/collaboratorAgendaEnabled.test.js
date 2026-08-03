/**
 * Sprint 1C Ticket 1.12 — Regra oficial agenda_enabled (IDB ↔ Supabase shadow).
 */
import { describe, expect, it } from 'vitest';

import { isAgendaProfessional } from '../constants/collaboratorRhCatalog.js';
import {
  mapIndexedDbRowToCore,
  mapSupabaseRowToCore,
  resolveCollaboratorAgendaEnabled,
} from '../repositories/collaborator/collaboratorMapper.ts';
import {
  compareCollaborators,
  generateShadowReport,
} from '../repositories/collaborator/collaboratorShadowValidation.ts';
import {
  mapIdbExportRowToCore,
  mapSupabaseRowToCore as mapSupabaseRowToCoreQa,
  compareCollaboratorsForQa,
  generateRhShadowQaReport,
} from '../../server/lib/rhShadowReadQa.js';
import { PROD_PROJECT_REF, assertStagingSupabaseUrl } from '../../server/lib/stagingSeedImplanprime.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEGACY_JULIANA = 'col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70';
const JULIANA_EXPORT = {
  id: LEGACY_JULIANA,
  tenant_id: TENANT,
  status: 'ativo',
  rhCategoria: 'Corpo Clínico',
  cargo: 'Implantodontista',
  setor: 'Clínico',
  especialidades: ['Implantodontia'],
  nomeCompleto: 'Juliana',
  email: 'juliana+staging@implanprime.test',
};

describe('resolveCollaboratorAgendaEnabled — regra oficial', () => {
  it('Corpo Clínico / Implantodontista → true', () => {
    expect(
      resolveCollaboratorAgendaEnabled({
        rhCategoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
      }),
    ).toBe(true);
    expect(isAgendaProfessional({ rhCategoria: 'Corpo Clínico', cargo: 'Implantodontista' })).toBe(true);
  });

  it('administrativo / recepção / financeiro → false', () => {
    expect(
      resolveCollaboratorAgendaEnabled({
        rhCategoria: 'Financeiro e Administrativo',
        cargo: 'Auxiliar Administrativo',
      }),
    ).toBe(false);
    expect(
      resolveCollaboratorAgendaEnabled({
        rhCategoria: 'Recepção e Atendimento',
        cargo: 'Recepcionista',
      }),
    ).toBe(false);
  });

  it('valor explícito booleano tem precedência sobre derivação', () => {
    expect(
      resolveCollaboratorAgendaEnabled({
        rhCategoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
        agendaEnabled: false,
      }),
    ).toBe(false);
  });
});

describe('resolveCollaboratorAgendaEnabled — paridade IDB vs Supabase mapper', () => {
  it('mapIndexedDbRowToCore e mapSupabaseRowToCore alinham agenda para Juliana staging', () => {
    const idbCore = mapIndexedDbRowToCore({
      id: LEGACY_JULIANA,
      tenant_id: TENANT,
      rhCategoria: 'Corpo Clínico',
      cargo: 'Implantodontista',
      setor: 'Clínico',
      nomeCompleto: 'Juliana',
      status: 'ativo',
    });
    const sbCore = mapSupabaseRowToCore({
      id: '6eeabd6b-0a8b-4d88-8715-400e092d3212',
      tenant_id: TENANT,
      legacy_id: LEGACY_JULIANA,
      status: 'ativo',
      apelido: 'Dra. Juliana',
      nome_completo: 'Juliana',
      rh_categoria: 'Corpo Clínico',
      cargo: 'Implantodontista',
      setor: 'Clínico',
      tipo_vinculo: 'CLT',
      especialidades: ['Implantodontia'],
      agenda_enabled: true,
      email: 'juliana+staging@implanprime.test',
      created_at: '2026-06-29T23:28:18.082968+00:00',
      updated_at: '2026-06-29T23:28:18.082968+00:00',
    });

    expect(idbCore.agendaEnabled).toBe(true);
    expect(sbCore.agendaEnabled).toBe(true);
    expect(idbCore.agendaEnabled).toBe(sbCore.agendaEnabled);
  });

  it('shadow não marca agenda_enabled quando mappers estão alinhados (Juliana)', () => {
    const idbCore = mapIndexedDbRowToCore({
      id: LEGACY_JULIANA,
      tenant_id: TENANT,
      rhCategoria: 'Corpo Clínico',
      cargo: 'Implantodontista',
      nomeCompleto: 'Juliana',
      email: 'juliana+staging@implanprime.test',
      status: 'ativo',
      updatedAt: '2026-06-29T21:06:46.241Z',
    });
    const sbCore = mapSupabaseRowToCore({
      id: '6eeabd6b-0a8b-4d88-8715-400e092d3212',
      tenant_id: TENANT,
      legacy_id: LEGACY_JULIANA,
      status: 'ativo',
      apelido: 'Dra. Juliana',
      nome_completo: 'Juliana',
      email: 'juliana+staging@implanprime.test',
      rh_categoria: 'Corpo Clínico',
      cargo: 'Implantodontista',
      tipo_vinculo: 'CLT',
      setor: 'Clínico',
      especialidades: ['Implantodontia'],
      agenda_enabled: true,
      created_at: '2026-06-29T23:28:18.082968+00:00',
      updated_at: '2026-06-29T23:28:18.082968+00:00',
    });

    const compare = compareCollaborators(TENANT, [idbCore], [sbCore]);
    const report = generateShadowReport(compare, 1);

    const agendaDiff = compare.field_diff.flatMap((e) => e.diffs).find((d) => d.field === 'agenda_enabled');
    expect(agendaDiff).toBeUndefined();
    expect(report.promotionBlockers.some((b) => /agenda_enabled/i.test(b))).toBe(false);
  });
});

describe('resolveCollaboratorAgendaEnabled — Shadow QA export Juliana', () => {
  it('mapIdbExportRowToCore deriva agenda_enabled true para export staging Juliana', () => {
    const local = mapIdbExportRowToCore(JULIANA_EXPORT, TENANT);
    expect(local.agendaEnabled).toBe(true);
  });

  it('compare QA Juliana vs Supabase staging não gera blocker agenda_enabled', () => {
    const local = mapIdbExportRowToCore(JULIANA_EXPORT, TENANT);
    const remote = mapSupabaseRowToCoreQa({
      id: '6eeabd6b-0a8b-4d88-8715-400e092d3212',
      legacy_id: LEGACY_JULIANA,
      tenant_id: TENANT,
      status: 'ativo',
      nome_completo: 'Juliana',
      email: 'juliana+staging@implanprime.test',
      rh_categoria: 'Corpo Clínico',
      cargo: 'Implantodontista',
      agenda_enabled: true,
      updated_at: '2026-06-29T23:28:18.082968+00:00',
    });

    const details = compareCollaboratorsForQa(TENANT, [local], [remote]);
    const report = generateRhShadowQaReport(details, 1);

    expect(report.blockingDiffCount).toBe(0);
    expect(report.canPromoteReadPrimary).toBe(true);
    expect(report.promotionBlockers).toEqual([]);
  });
});

describe('resolveCollaboratorAgendaEnabled — segurança operacional', () => {
  it('classificação é função pura — zero escrita', () => {
    const row = { rhCategoria: 'Corpo Clínico', cargo: 'Implantodontista' };
    const before = JSON.stringify(row);
    resolveCollaboratorAgendaEnabled(row);
    expect(JSON.stringify(row)).toBe(before);
  });

  it('produção bloqueada via assertStagingSupabaseUrl', () => {
    expect(() =>
      assertStagingSupabaseUrl(`https://${PROD_PROJECT_REF}.supabase.co`),
    ).toThrow(/produção|PROD|uoepkwhqztmsjnzirpev/i);
  });
});
