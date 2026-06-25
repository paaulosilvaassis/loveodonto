import { describe, expect, it } from 'vitest';
import { mapTenantUserToIdentityFields } from '../../server/identity/identityHealth.js';

describe('mapTenantUserToIdentityFields', () => {
  it('mapeia tenant_user ativo com auth para identidade saudável', () => {
    const result = mapTenantUserToIdentityFields({
      id: 'tu-1',
      tenant_id: 'tenant-1',
      user_id: 'auth-1',
      email: 'User@Clinic.com',
      full_name: 'Maria',
      role_slug: 'atendimento',
      has_system_access: true,
      is_active: true,
      status: 'active',
      invitation_status: 'accepted',
      collaborator_id: 'col-1',
    });

    expect(result.email).toBe('user@clinic.com');
    expect(result.status).toBe('active');
    expect(result.identity_health).toBe('healthy');
    expect(result.password_status).toBe('created');
  });

  it('marca auth_missing quando tenant_user não tem user_id', () => {
    const result = mapTenantUserToIdentityFields({
      id: 'tu-2',
      tenant_id: 'tenant-1',
      user_id: null,
      email: 'novo@clinic.com',
      has_system_access: true,
      is_active: true,
      status: 'active',
      invitation_status: 'sent',
    });

    expect(result.status).toBe('invitation_pending');
    expect(result.identity_health).toBe('auth_missing');
  });

  it('marca disabled quando acesso desativado', () => {
    const result = mapTenantUserToIdentityFields({
      id: 'tu-3',
      tenant_id: 'tenant-1',
      user_id: 'auth-3',
      email: 'off@clinic.com',
      has_system_access: false,
      is_active: false,
      status: 'inactive',
    });

    expect(result.status).toBe('disabled');
  });

  it('vincula collaborator_id externo quando tenant_user não tem', () => {
    const result = mapTenantUserToIdentityFields(
      {
        id: 'tu-4',
        tenant_id: 'tenant-1',
        user_id: 'auth-4',
        email: 'link@clinic.com',
        has_system_access: true,
        is_active: true,
        status: 'active',
      },
      { collaboratorId: 'col-ext' },
    );

    expect(result.collaborator_id).toBe('col-ext');
    expect(result.identity_health).toBe('collaborator_link_missing');
  });
});
