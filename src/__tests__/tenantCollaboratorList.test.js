import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDbState } from '../db/schema.js';
import { saveDb } from '../db/index.js';
import { listTenantCollaborators, normalizeTenantCollaboratorRow } from '../services/tenantCollaboratorService.js';

const TENANT_ID = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';
const JULIANA_EMAIL = 'juliana@implanprime.com.br';
const JULIANA_COLLAB_ID = 'col-juliana-rh';

vi.mock('../services/saasAuthService.js', () => ({
  isSaasModeEnabled: () => true,
}));

const listTenantUsersAccessMock = vi.fn();
const reconcileCollaboratorTenantLinksMock = vi.fn();

vi.mock('../services/collaboratorAccessProvisionService.js', () => ({
  listTenantUsersAccess: (...args) => listTenantUsersAccessMock(...args),
  reconcileCollaboratorTenantLinks: (...args) => reconcileCollaboratorTenantLinksMock(...args),
}));

describe('listTenantCollaborators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const state = defaultDbState();
    state.clinicProfile = { ...state.clinicProfile, tenant_id: TENANT_ID };
    state.collaborators = [{
      id: JULIANA_COLLAB_ID,
      tenant_id: TENANT_ID,
      status: 'ativo',
      apelido: 'Juliana',
      nomeCompleto: 'Juliana de Oliveira Freire',
      email: JULIANA_EMAIL,
      rhCategoria: 'Recepção e Atendimento',
      cargo: 'Recepcionista',
      tipoVinculo: 'CLT',
      setor: 'Administrativo',
      especialidades: [],
      fotoUrl: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    }];
    saveDb(state);

    listTenantUsersAccessMock.mockResolvedValue({
      users: [{
        id: 'tu-juliana',
        tenant_id: TENANT_ID,
        collaborator_id: JULIANA_COLLAB_ID,
        user_id: 'auth-juliana',
        full_name: 'Juliana de Oliveira Freire',
        email: JULIANA_EMAIL,
        role: 'dentista',
        role_slug: 'dentista',
        is_active: true,
        has_system_access: true,
        invitation_status: 'accepted',
        updated_at: '2026-06-01T12:00:00.000Z',
        invitation: { status: 'accepted', accepted_at: '2026-05-01T00:00:00.000Z' },
      }],
    });
    reconcileCollaboratorTenantLinksMock.mockResolvedValue({ linked: 0, users: [] });
  });

  it('descarta cache RH antigo e usa API para acesso; mantém RH local quando mais específico', async () => {
    const rows = await listTenantCollaborators(TENANT_ID, { legacy: false });
    const juliana = rows.find((r) => r.email === JULIANA_EMAIL);
    expect(juliana).toBeTruthy();
    expect(juliana.access_status).toBe('accepted');
    expect(juliana.user_id).toBe('auth-juliana');
    expect(juliana.role_slug).toBe('dentista');
  });

  it('normaliza linha com convite aceito mesmo quando cache local diz recepcionista sem convite', () => {
    const normalized = normalizeTenantCollaboratorRow({
      tenantId: TENANT_ID,
      tenantUser: {
        id: 'tu-juliana',
        tenant_id: TENANT_ID,
        collaborator_id: JULIANA_COLLAB_ID,
        user_id: 'auth-juliana',
        full_name: 'Juliana de Oliveira Freire',
        email: JULIANA_EMAIL,
        role: 'dentista',
        has_system_access: true,
        invitation_status: 'accepted',
        updated_at: '2026-06-01T12:00:00.000Z',
        invitation: { status: 'accepted' },
      },
      local: {
        id: JULIANA_COLLAB_ID,
        tenant_id: TENANT_ID,
        nomeCompleto: 'Juliana de Oliveira Freire',
        apelido: 'Juliana',
        email: JULIANA_EMAIL,
        rhCategoria: 'Corpo Clínico',
        cargo: 'Implantodontista',
        status: 'ativo',
        especialidades: ['Implante'],
        fotoUrl: 'https://cdn.example/juliana.jpg',
        updatedAt: '2026-06-15T12:00:00.000Z',
      },
    });

    expect(normalized.role_title).toBe('Implantodontista');
    expect(normalized.category).toBe('Corpo Clínico');
    expect(normalized.access_status).toBe('accepted');
    expect(normalized.photo_url).toContain('juliana.jpg');
  });

  it('lança erro quando API falha — sem fallback para cache local', async () => {
    listTenantUsersAccessMock.mockRejectedValue(new Error('network down'));
    await expect(listTenantCollaborators(TENANT_ID)).rejects.toThrow(/network down|carregar colaboradores/i);
  });

  it('ignora colaboradores locais sem tenant_id', async () => {
    const state = defaultDbState();
    state.collaborators = [{
      id: 'col-legacy-no-tenant',
      status: 'ativo',
      nomeCompleto: 'Legado Sem Tenant',
      email: 'legado@test.com',
      cargo: 'Recepcionista',
      rhCategoria: 'Recepção e Atendimento',
    }];
    saveDb(state);
    listTenantUsersAccessMock.mockResolvedValue({ users: [] });

    const rows = await listTenantCollaborators(TENANT_ID, { legacy: false });
    expect(rows.some((r) => r.email === 'legado@test.com')).toBe(false);
  });
});
