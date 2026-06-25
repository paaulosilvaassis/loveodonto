import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/collaboratorAccessProvisionService.js', () => ({
  linkCollaboratorTenantAccess: vi.fn(),
  listTenantUsersAccess: vi.fn(),
  setCollaboratorSystemAccess: vi.fn(),
  setTenantUserSystemAccess: vi.fn(),
  isCollaboratorAccessLinkNotFoundError: (message) => {
    const lower = String(message || '').toLowerCase();
    return lower.includes('vínculo de acesso não encontrado');
  },
}));

vi.mock('../services/saasAuthService.js', () => ({
  isSaasModeEnabled: () => true,
}));

import {
  setCollaboratorSystemAccess,
  setTenantUserSystemAccess,
} from '../services/collaboratorAccessProvisionService.js';
import * as recoveryService from '../services/collaboratorAccessRecoveryService.js';

describe('setCollaboratorSystemAccessWithRecovery', () => {
  beforeEach(() => {
    vi.mocked(setCollaboratorSystemAccess).mockReset();
    vi.mocked(setTenantUserSystemAccess).mockReset();
    vi.spyOn(recoveryService, 'reconcileCollaboratorAccessState').mockResolvedValue({
      tenantUser: {
        id: 'tu-renata',
        user_id: 'auth-renata',
        email: 'renata@clinica.com',
        has_system_access: false,
      },
      access: null,
      recovered: false,
    });
  });

  it('usa tenant_user.id quando PATCH por colaborador falha por vínculo ausente', async () => {
    vi.mocked(setCollaboratorSystemAccess).mockRejectedValue(
      new Error('Vínculo de acesso não encontrado para este colaborador.'),
    );
    vi.mocked(setTenantUserSystemAccess).mockResolvedValue({
      success: true,
      tenant_user: {
        id: 'tu-renata',
        user_id: 'auth-renata',
        email: 'renata@clinica.com',
        has_system_access: true,
      },
    });

    const result = await recoveryService.setCollaboratorSystemAccessWithRecovery({
      collaboratorId: 'collab-renata',
      collaborator: { id: 'collab-renata', email: 'renata@clinica.com', nomeCompleto: 'Renata' },
      tenantUser: {
        id: 'tu-renata',
        user_id: 'auth-renata',
        email: 'renata@clinica.com',
        has_system_access: false,
      },
      tenantId: 'tenant-1',
      currentUser: null,
      hasSystemAccess: true,
    });

    expect(setTenantUserSystemAccess).toHaveBeenCalledWith('tu-renata', {
      tenant_id: 'tenant-1',
      has_system_access: true,
    });
    expect(result?.recovered_via_tenant_user).toBe(true);
  });
});
