/**
 * Sprint 1C Ticket 1.13 — Mirror collaborator_uuid → IDB uuid field.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  buildCollaboratorUuidMirrorPlan,
  mergeUuidMirrorPlanIntoReport,
  CollaboratorUuidMirrorForbiddenError,
  assertUuidMirrorEnvironment,
} from '../repositories/collaborator/collaboratorUuidMirror.ts';
import { CollaboratorRepository } from '../repositories/collaborator/collaboratorRepository.ts';
import { collaboratorIndexedDbRepository } from '../repositories/collaborator/collaboratorIndexedDbRepository.ts';
import {
  compareCollaboratorsForQa,
  generateRhShadowQaReport,
  mapIdbExportRowToCore,
  mapSupabaseRowToCore,
} from '../../server/lib/rhShadowReadQa.js';
import {
  applyUuidMirrorToExportRows,
  buildCollaboratorUuidMirrorPlan as buildPlanJs,
} from '../../server/lib/collaboratorUuidMirror.js';
import { PROD_PROJECT_REF, assertStagingSupabaseUrl } from '../../server/lib/stagingSeedImplanprime.js';
import { remapRhExportForStaging } from '../../server/lib/stagingSeedImplanprime.js';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEGACY_JULIANA = 'col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70';
const UUID_JULIANA = '6eeabd6b-0a8b-4d88-8715-400e092d3212';
const LEGACY_PAULO = 'col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341';
const UUID_PAULO = '9284488d-c0b1-4200-b728-82f757aaf1e0';

const STAGING_REMOTE = [
  { id: UUID_PAULO, legacy_id: LEGACY_PAULO, tenant_id: TENANT },
  { id: UUID_JULIANA, legacy_id: LEGACY_JULIANA, tenant_id: TENANT },
  { id: 'e3f0f230-4dfa-44f3-9f4d-41c6babcef03', legacy_id: 'col-6b85c4cb-345a-4cff-9636-f07ac1aea9f2', tenant_id: TENANT },
  { id: '140c5833-7fe8-429a-ace2-ba79d774d85a', legacy_id: 'col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3', tenant_id: TENANT },
];

function seedLocalCollaborators(rows) {
  withDb((db) => {
    db.collaborators = rows.map((row) => ({ ...row, tenant_id: TENANT }));
    return db;
  });
}

describe('collaboratorUuidMirror — plano puro', () => {
  it('espelha uuid quando legacy_id bate', () => {
    const plan = buildCollaboratorUuidMirrorPlan(
      TENANT,
      [{ id: LEGACY_JULIANA, tenant_id: TENANT, nomeCompleto: 'Juliana' }],
      [{ id: UUID_JULIANA, legacy_id: LEGACY_JULIANA }],
    );
    expect(plan).toEqual([
      expect.objectContaining({ action: 'update', legacyId: LEGACY_JULIANA, uuid: UUID_JULIANA }),
    ]);
  });

  it('ignora quando uuid já está igual', () => {
    const plan = buildCollaboratorUuidMirrorPlan(
      TENANT,
      [{ id: LEGACY_JULIANA, uuid: UUID_JULIANA, tenant_id: TENANT }],
      [{ id: UUID_JULIANA, legacy_id: LEGACY_JULIANA }],
    );
    expect(plan[0].action).toBe('skip');
  });

  it('detecta conflito quando legacy_id duplicado local', () => {
    const plan = buildCollaboratorUuidMirrorPlan(
      TENANT,
      [
        { id: LEGACY_JULIANA, tenant_id: TENANT },
        { id: LEGACY_JULIANA, tenant_id: TENANT },
      ],
      [{ id: UUID_JULIANA, legacy_id: LEGACY_JULIANA }],
    );
    expect(plan[0].action).toBe('conflict');
  });

  it('detecta conflito quando uuid local canônico diverge', () => {
    const plan = buildCollaboratorUuidMirrorPlan(
      TENANT,
      [{ id: LEGACY_JULIANA, uuid: UUID_PAULO, tenant_id: TENANT }],
      [{ id: UUID_JULIANA, legacy_id: LEGACY_JULIANA }],
    );
    expect(plan[0].action).toBe('conflict');
  });

  it('paridade TS/JS buildCollaboratorUuidMirrorPlan', () => {
    const local = [{ id: LEGACY_PAULO, tenant_id: TENANT }];
    const remote = [{ id: UUID_PAULO, legacy_id: LEGACY_PAULO }];
    const ts = buildCollaboratorUuidMirrorPlan(TENANT, local, remote);
    const js = buildPlanJs(TENANT, local, remote);
    expect(js).toEqual(ts);
  });
});

describe('collaboratorUuidMirror — escrita IDB controlada', () => {
  beforeEach(() => {
    resetDb();
    initDb({ tenantId: TENANT });
  });

  it('mirrorCollaboratorUuidOnly não altera id legado', () => {
    seedLocalCollaborators([
      {
        id: LEGACY_JULIANA,
        nomeCompleto: 'Juliana',
        rhCategoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
      },
    ]);

    const outcome = collaboratorIndexedDbRepository.mirrorCollaboratorUuidOnly(
      TENANT,
      LEGACY_JULIANA,
      UUID_JULIANA,
    );
    expect(outcome).toBe('updated');

    const row = loadDb().collaborators.find((c) => c.id === LEGACY_JULIANA);
    expect(row.id).toBe(LEGACY_JULIANA);
    expect(row.uuid).toBe(UUID_JULIANA);
    expect(row.nomeCompleto).toBe('Juliana');
  });

  it('mirrorCollaboratorUuidsToIndexedDb via repository em dev', () => {
    seedLocalCollaborators([
      { id: LEGACY_PAULO, nomeCompleto: 'Paulo', cargo: 'Gestor' },
      { id: LEGACY_JULIANA, nomeCompleto: 'Juliana', rhCategoria: 'Corpo Clínico', cargo: 'Implantodontista' },
    ]);

    const repo = new CollaboratorRepository({ indexedDb: collaboratorIndexedDbRepository });
    const report = repo.mirrorCollaboratorUuidsToIndexedDb(TENANT, STAGING_REMOTE);

    expect(report.updated.length).toBe(2);
    expect(report.supabaseWritesExecuted).toBe(false);
    expect(loadDb().collaborators.find((c) => c.id === LEGACY_JULIANA)?.uuid).toBe(UUID_JULIANA);
  });

  it('bloqueia produção via assertUuidMirrorEnvironment', () => {
    const original = import.meta.env.PROD;
    import.meta.env.PROD = true;
    expect(() => assertUuidMirrorEnvironment()).toThrow(CollaboratorUuidMirrorForbiddenError);
    import.meta.env.PROD = original;
  });
});

describe('collaboratorUuidMirror — shadow QA pós-mirror export', () => {
  const exportRow = {
    id: LEGACY_JULIANA,
    tenant_id: TENANT,
    rhCategoria: 'Corpo Clínico',
    cargo: 'Implantodontista',
    nomeCompleto: 'Juliana',
    email: 'juliana+staging@implanprime.test',
    updatedAt: '2026-06-29T21:06:46.241Z',
  };

  it('applyUuidMirrorToExportRows + shadow elimina transitional uuid', () => {
    const remapped = remapRhExportForStaging([exportRow], TENANT);
    const mirrored = applyUuidMirrorToExportRows(remapped, STAGING_REMOTE);
    expect(mirrored[0].uuid).toBe(UUID_JULIANA);
    expect(mirrored[0].id).toBe(LEGACY_JULIANA);

    const localCores = mirrored.map((row) => mapIdbExportRowToCore(row, TENANT));
    const remoteCores = STAGING_REMOTE.map((row) =>
      mapSupabaseRowToCore({
        ...row,
        status: 'ativo',
        nome_completo: 'Juliana',
        email: 'juliana+staging@implanprime.test',
        rh_categoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
        agenda_enabled: true,
        updated_at: '2026-06-29T23:28:18.082968+00:00',
      }),
    ).filter((_, i) => i === 1);

    const details = compareCollaboratorsForQa(TENANT, localCores, remoteCores);
    const report = generateRhShadowQaReport(details, 1);

    expect(report.blockingDiffCount).toBe(0);
    expect(report.transitionalDiffCount).toBe(0);
    expect(report.canPromoteReadPrimary).toBe(true);
    expect(report.details.invalid_uuid.filter((e) => e.side === 'local')).toHaveLength(0);
  });
});

describe('collaboratorUuidMirror — shadow QA staging completo (4 colaboradores)', () => {
  it('pós-mirror export: transitionalDiffCount=0 e canPromoteReadPrimary=true', () => {
    const exportRows = [
      {
        id: LEGACY_PAULO,
        rhCategoria: 'Diretoria e Gestão',
        cargo: 'Gestor Geral',
        nomeCompleto: 'Paulo Henrique Silva de Assis',
        updatedAt: '2026-06-29T21:06:47.286Z',
      },
      {
        id: LEGACY_JULIANA,
        rhCategoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
        nomeCompleto: 'Juliana',
        updatedAt: '2026-06-29T21:06:46.241Z',
      },
      {
        id: 'col-6b85c4cb-345a-4cff-9636-f07ac1aea9f2',
        rhCategoria: 'Financeiro e Administrativo',
        cargo: 'Auxiliar Administrativo',
        nomeCompleto: 'Renata Pereira',
        updatedAt: '2026-06-29T21:06:46.241Z',
      },
      {
        id: 'col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3',
        rhCategoria: 'Recepção e Atendimento',
        cargo: 'Recepcionista',
        nomeCompleto: 'Melissa Eduarda Guimarães',
        updatedAt: '2026-06-29T19:01:39.910Z',
      },
    ];

    const remapped = remapRhExportForStaging(exportRows, TENANT);
    const mirrored = applyUuidMirrorToExportRows(remapped, STAGING_REMOTE);
    const localCores = mirrored.map((row) => mapIdbExportRowToCore(row, TENANT));

    const remoteByLegacy = {
      [LEGACY_PAULO]: {
        nome_completo: 'Paulo Henrique Silva de Assis',
        email: 'paulo+staging@implanprime.test',
        rh_categoria: 'Diretoria e Gestão',
        cargo: 'Gestor Geral',
        agenda_enabled: false,
      },
      [LEGACY_JULIANA]: {
        nome_completo: 'Juliana',
        email: 'juliana+staging@implanprime.test',
        rh_categoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
        agenda_enabled: true,
      },
      'col-6b85c4cb-345a-4cff-9636-f07ac1aea9f2': {
        nome_completo: 'Renata Pereira',
        email: 'renata+staging@implanprime.test',
        rh_categoria: 'Financeiro e Administrativo',
        cargo: 'Auxiliar Administrativo',
        agenda_enabled: false,
      },
      'col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3': {
        nome_completo: 'Melissa Eduarda Guimarães',
        email: 'melissa+staging@implanprime.test',
        rh_categoria: 'Recepção e Atendimento',
        cargo: 'Recepcionista',
        agenda_enabled: false,
      },
    };

    const remoteCores = STAGING_REMOTE.map((row) => {
      const fields = remoteByLegacy[row.legacy_id] || {};
      return mapSupabaseRowToCore({
        id: row.id,
        legacy_id: row.legacy_id,
        tenant_id: TENANT,
        status: 'ativo',
        ...fields,
        updated_at: '2026-06-29T23:28:18.082968+00:00',
      });
    });

    const details = compareCollaboratorsForQa(TENANT, localCores, remoteCores);
    const report = generateRhShadowQaReport(details, 5);

    expect(report.localCount).toBe(4);
    expect(report.remoteCount).toBe(4);
    expect(report.blockingDiffCount).toBe(0);
    expect(report.transitionalDiffCount).toBe(0);
    expect(report.informationalDiffCount).toBe(4);
    expect(report.canPromoteReadPrimary).toBe(true);
    expect(report.details.invalid_uuid.filter((e) => e.side === 'local')).toHaveLength(0);
  });
});

describe('collaboratorUuidMirror — segurança', () => {
  it('produção bloqueada via assertStagingSupabaseUrl', () => {
    expect(() =>
      assertStagingSupabaseUrl(`https://${PROD_PROJECT_REF}.supabase.co`),
    ).toThrow(/produção|PROD|uoepkwhqztmsjnzirpev/i);
  });

  it('mergeUuidMirrorPlanIntoReport não inclui updates pendentes', () => {
    const plan = [
      { action: 'update', legacyId: LEGACY_PAULO, uuid: UUID_PAULO },
      { action: 'skip', legacyId: LEGACY_JULIANA, uuid: UUID_JULIANA },
    ];
    const report = mergeUuidMirrorPlanIntoReport(TENANT, plan);
    expect(report.updated).toHaveLength(0);
    expect(report.skipped).toHaveLength(1);
    expect(report.supabaseWritesExecuted).toBe(false);
  });
});
