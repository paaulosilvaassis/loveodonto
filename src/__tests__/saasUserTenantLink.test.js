import { describe, expect, it, beforeEach } from 'vitest';
import { defaultDbState } from '../db/schema.js';
import { saveDb } from '../db/index.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';
import { reconcileSaasTeamRoster, roleToMinimalRhProfile } from '../services/tenantTeamRosterSync.js';
import { loadDb } from '../db/index.js';

const TENANT_ID = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';
const AUTH_USER_ID = 'auth-user-melissa';
const RH_COLLAB_ID = 'col-melissa-rh';

describe('saasUserSeedService', () => {
  beforeEach(() => {
    const state = defaultDbState();
    state.clinicProfile = { ...state.clinicProfile, tenant_id: TENANT_ID };
    state.collaborators = [{
      id: RH_COLLAB_ID,
      tenant_id: TENANT_ID,
      status: 'ativo',
      apelido: 'Melissa',
      nomeCompleto: 'Melissa Eduarda Guimarães',
      email: 'melissa@implanprime.com.br',
      rhCategoria: 'Diretoria e Gestão',
      cargo: 'Gerente de Clínica',
      tipoVinculo: 'CLT',
      setor: 'Administrativo',
      especialidades: [],
      registroProfissional: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }];
    saveDb(state);
  });

  it('reutiliza colaborador RH existente em vez de criar col-saas-*', () => {
    ensureSaasUserInLocalDb({
      id: AUTH_USER_ID,
      name: 'Melissa Eduarda Guimarães',
      email: 'melissa@implanprime.com.br',
      role: 'gerente',
      tenantId: TENANT_ID,
      authMode: 'saas',
      permissionOverrides: { 'perm-1': true },
    });

    const db = loadDb();
    const melissaUser = db.users.find((u) => u.id === AUTH_USER_ID);
    expect(db.collaborators.some((c) => c.id === RH_COLLAB_ID)).toBe(true);
    expect(db.collaborators.some((c) => c.id === `col-saas-${AUTH_USER_ID}`)).toBe(false);
    expect(db.collaboratorAccess.find((a) => a.userId === AUTH_USER_ID)?.collaboratorId).toBe(RH_COLLAB_ID);
    expect(melissaUser?.permissionOverrides).toEqual({ 'perm-1': true });
  });
});

describe('tenantTeamRosterSync', () => {
  beforeEach(() => {
    saveDb(defaultDbState());
  });

  it('cria dentista mínimo para agenda a partir do roster', () => {
    reconcileSaasTeamRoster([{
      collaborator_id: 'col-juliana',
      user_id: 'auth-juliana',
      email: 'juliana@implanprime.com.br',
      full_name: 'Juliana de Oliveira Freire',
      role: 'dentista',
      is_active: true,
      status: 'active',
    }], TENANT_ID);

    const db = loadDb();
    const juliana = db.collaborators.find((c) => c.email === 'juliana@implanprime.com.br');
    expect(juliana?.cargo).toBe('Dentista');
    expect(juliana?.tenant_id).toBe(TENANT_ID);
  });

  it('mapeia gerente para perfil RH administrativo', () => {
    const rh = roleToMinimalRhProfile('gerente');
    expect(rh.cargo).toBe('Gerente de Clínica');
  });
});
