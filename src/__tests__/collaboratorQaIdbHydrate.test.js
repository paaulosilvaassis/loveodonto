import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDbState } from '../db/schema.js';
import { loadDb, saveDb } from '../db/index.js';
import {
  applyCollaboratorIdbHydratePlan,
  buildCollaboratorIdbHydratePlan,
} from '../repositories/collaborator/collaboratorQaIdbHydrate.ts';

const TENANT = '7aba7127-409c-4ea4-8dbc-807efc5e189c';
const LEGACY_JULIANA = 'col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70';
const LEGACY_JULIANA_STALE = 'col-saas-c9a3cc7e-d4ab-4934-aad3-56cb0558f1d6';
const UUID_JULIANA = '6eeabd6b-0a8b-4d88-8715-400e092d3212';
const LEGACY_MELISSA = 'col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3';
const UUID_MELISSA = '140c5833-7fe8-429a-ace2-ba79d774d85a';

function coreFromRemote(overrides = {}) {
  return {
    uuid: UUID_JULIANA,
    legacyId: LEGACY_JULIANA,
    tenantId: TENANT,
    status: 'ativo',
    apelido: 'Dra. Juliana',
    nomeCompleto: 'Juliana',
    nomeSocial: '',
    sexo: '',
    dataNascimento: '',
    email: 'juliana+staging@implanprime.test',
    fotoUrl: '',
    rhCategoria: 'Corpo Clínico',
    cargo: 'Implantodontista',
    rhFuncaoDescricao: '',
    tipoVinculo: 'CLT',
    setor: 'Clínico',
    especialidades: ['Implantodontia'],
    registroProfissional: '27267',
    conselhoNome: 'CRO',
    conselhoUf: 'MG',
    agendaEnabled: true,
    createdAt: '2026-06-24T18:34:45.694Z',
    updatedAt: '2026-06-29T23:28:18.082968+00:00',
    deletedAt: null,
    ...overrides,
  };
}

describe('collaboratorQaIdbHydrate', () => {
  beforeEach(() => {
    const state = defaultDbState();
    state.clinicProfile = { ...state.clinicProfile, tenant_id: TENANT };
    state.collaborators = [
      {
        id: LEGACY_JULIANA_STALE,
        tenant_id: TENANT,
        status: 'ativo',
        apelido: 'Juliana',
        nomeCompleto: 'Juliana',
        email: 'juliana+staging@implanprime.test',
        rhCategoria: 'Administrativo',
        cargo: 'Admin',
        tipoVinculo: 'CLT',
        setor: 'Admin',
        especialidades: [],
        createdAt: '2026-06-24T18:34:45.694Z',
        updatedAt: '2026-06-24T18:34:45.694Z',
      },
      {
        id: 'col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341',
        tenant_id: TENANT,
        status: 'ativo',
        apelido: 'Paulo',
        nomeCompleto: 'Paulo Henrique',
        email: 'paulo+staging@implanprime.test',
        rhCategoria: 'Diretoria e Gestão',
        cargo: 'Gestor',
        tipoVinculo: 'CLT',
        setor: 'Gestão',
        especialidades: [],
        uuid: '9284488d-c0b1-4200-b728-82f757aaf1e0',
        createdAt: '2026-06-24T15:43:48.895Z',
        updatedAt: '2026-06-29T23:28:17.967937+00:00',
      },
      {
        id: 'col-c92cf731-eddc-4b0d-9e40-8c77a7a2ee06',
        tenant_id: TENANT,
        status: 'ativo',
        apelido: 'Renatinha',
        nomeCompleto: 'Renata Pereira',
        email: 'renata+staging@implanprime.test',
        rhCategoria: 'Financeiro',
        cargo: 'Auxiliar',
        tipoVinculo: 'CLT',
        setor: 'Administrativo',
        especialidades: [],
        createdAt: '2026-06-25T17:32:00.693Z',
        updatedAt: '2026-06-25T17:32:00.693Z',
      },
    ];
    saveDb(state);
  });

  it('insere colaborador ausente e corrige legacy id divergente', () => {
    const remote = [
      coreFromRemote(),
      coreFromRemote({
        uuid: UUID_MELISSA,
        legacyId: LEGACY_MELISSA,
        email: 'melissa+staging@implanprime.test',
        apelido: 'Melissa',
        nomeCompleto: 'Melissa Eduarda Guimarães',
        rhCategoria: 'Recepção e Atendimento',
        cargo: 'Recepcionista',
        agendaEnabled: false,
        especialidades: [],
        registroProfissional: '',
        conselhoNome: '',
        conselhoUf: '',
      }),
    ];

    const plan = buildCollaboratorIdbHydratePlan(TENANT, loadDb().collaborators, remote);
    expect(plan.localCountBefore).toBe(3);
    expect(plan.remoteCount).toBe(2);
    expect(plan.items.some((i) => i.action === 'insert' && i.legacyId === LEGACY_MELISSA)).toBe(true);
    expect(plan.items.some((i) => i.action === 'update' && i.legacyId === LEGACY_JULIANA)).toBe(true);

    const report = applyCollaboratorIdbHydratePlan(plan);
    expect(report.inserted).toHaveLength(1);
    expect(report.updated.length).toBeGreaterThanOrEqual(1);
    expect(report.conflicts).toHaveLength(0);
    expect(report.errors).toHaveLength(0);
    expect(report.localCountAfter).toBe(4);
    expect(report.supabaseWritesExecuted).toBe(false);

    const db = loadDb();
    const juliana = db.collaborators.find((c) => c.email === 'juliana+staging@implanprime.test');
    expect(juliana?.id).toBe(LEGACY_JULIANA);
    expect(juliana?.uuid).toBe(UUID_JULIANA);
    expect(db.collaborators.some((c) => c.id === LEGACY_JULIANA_STALE)).toBe(false);
    expect(db.collaborators.some((c) => c.id === LEGACY_MELISSA)).toBe(true);
  });
});
