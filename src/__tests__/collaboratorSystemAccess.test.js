import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initDb, resetDb } from '../db/index.js';
import { createCollaboratorWithSystemAccess } from '../services/collaboratorService.js';

vi.mock('../services/collaboratorAccessProvisionService.js', () => ({
  provisionCollaboratorSystemAccess: vi.fn(),
  linkCollaboratorTenantAccess: vi.fn(),
  listTenantUsersAccess: vi.fn(),
}));

import {
  provisionCollaboratorSystemAccess,
  linkCollaboratorTenantAccess,
} from '../services/collaboratorAccessProvisionService.js';

const admin = {
  id: 'user-admin',
  role: 'admin',
  tenantId: 'tenant-test-1',
};

const basePayload = {
  apelido: 'Maria',
  nomeCompleto: 'Maria Silva',
  rhCategoria: 'Recepção e Atendimento',
  cargo: 'Recepcionista',
  tipoVinculo: 'CLT',
  setor: 'Recepção',
  status: 'ativo',
};

describe('createCollaboratorWithSystemAccess', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    vi.mocked(provisionCollaboratorSystemAccess).mockReset();
    vi.mocked(linkCollaboratorTenantAccess).mockReset();
  });

  it('exige e-mail quando require_system_access=true', async () => {
    await expect(
      createCollaboratorWithSystemAccess(admin, basePayload, { require_system_access: true }),
    ).rejects.toThrow(/e-mail válido/i);
    expect(provisionCollaboratorSystemAccess).not.toHaveBeenCalled();
  });

  it('sem e-mail e sem exigência de acesso não chama provisionamento', async () => {
    const result = await createCollaboratorWithSystemAccess(admin, basePayload, {
      require_system_access: false,
      allow_system_access: false,
    });
    expect(result.noAccess).toBe(true);
    expect(provisionCollaboratorSystemAccess).not.toHaveBeenCalled();
  });

  it('com e-mail válido provisiona acesso automaticamente', async () => {
    vi.mocked(provisionCollaboratorSystemAccess).mockResolvedValue({
      success: true,
      tenant_user: { id: 'tu-1', invitation_status: 'pending' },
    });

    const result = await createCollaboratorWithSystemAccess(admin, {
      ...basePayload,
      email: 'maria@clinica.com',
    });

    expect(result.noAccess).toBe(false);
    expect(result.systemAccess).toMatchObject({ success: true });
    expect(provisionCollaboratorSystemAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: 'tenant-test-1',
        collaborator_id: result.collaborator.id,
        create_system_access: true,
        email: 'maria@clinica.com',
        profile_role: 'atendimento',
        send_invite: true,
      }),
    );
  });

  it('propaga falha de provisionamento em accessError', async () => {
    vi.mocked(provisionCollaboratorSystemAccess).mockRejectedValue(
      new Error('API indisponível'),
    );

    const result = await createCollaboratorWithSystemAccess(admin, {
      ...basePayload,
      email: 'maria@clinica.com',
    });

    expect(result.collaborator.id).toMatch(/^col-/);
    expect(result.systemAccess).toBeNull();
    expect(result.accessError?.message).toBe('API indisponível');
  });

  it('vincula acesso existente quando e-mail já possui tenant_user', async () => {
    vi.mocked(provisionCollaboratorSystemAccess).mockRejectedValue(
      new Error('Este e-mail já possui acesso nesta clínica.'),
    );
    vi.mocked(linkCollaboratorTenantAccess).mockResolvedValue({
      success: true,
      linked: true,
      tenant_user: { id: 'tu-1', collaborator_id: 'col-x' },
    });

    const result = await createCollaboratorWithSystemAccess(admin, {
      ...basePayload,
      email: 'maria@clinica.com',
    });

    expect(result.systemAccess).toMatchObject({ success: true });
    expect(result.linkedExisting).toBe(true);
    expect(linkCollaboratorTenantAccess).toHaveBeenCalled();
  });
});
