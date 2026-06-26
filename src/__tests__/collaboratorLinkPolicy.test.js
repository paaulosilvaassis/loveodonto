import { describe, expect, it } from 'vitest';
import { buildCollaboratorLinkConflictError } from '../../server/collaboratorLinkPolicy.js';

describe('collaboratorLinkPolicy', () => {
  it('expõe erro padronizado de conflito de vínculo', () => {
    const err = buildCollaboratorLinkConflictError();
    expect(err.code).toBe('EMAIL_LINKED_TO_OTHER_COLLABORATOR');
    expect(err.message).toContain('outro colaborador');
  });

  it('assertCanAssignEmailToCollaborator permite relink do mesmo e-mail', async () => {
    const { assertCanAssignEmailToCollaborator } = await import('../../server/collaboratorLinkPolicy.js');
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'tu-same', email: 'renata@clinic.com', collaborator_id: 'old-id' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      assertCanAssignEmailToCollaborator(supabase, {
        tenantId: 'tenant-1',
        tenantUserId: 'tu-same',
        collaboratorId: 'renata-id',
        email: 'renata@clinic.com',
      }),
    ).resolves.toBeUndefined();
  });

  it('assertCanAssignEmailToCollaborator bloqueia e-mail diferente no mesmo collaborator_id', async () => {
    const { assertCanAssignEmailToCollaborator } = await import('../../server/collaboratorLinkPolicy.js');
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'tu-other', email: 'outro@clinic.com', collaborator_id: 'col-1' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      assertCanAssignEmailToCollaborator(supabase, {
        tenantId: 'tenant-1',
        tenantUserId: 'tu-renata',
        collaboratorId: 'col-1',
        email: 'renata@clinic.com',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_LINKED_TO_OTHER_COLLABORATOR' });
  });

  it('resolveCollaboratorIdForTenantEmailAccess mantém vínculo do tenant_users quando local conflita', async () => {
    const { resolveCollaboratorIdForTenantEmailAccess } = await import('../../server/collaboratorLinkPolicy.js');
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'tu-juliana', email: 'juliana@clinic.com', collaborator_id: 'col-juliana' },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    await expect(
      resolveCollaboratorIdForTenantEmailAccess(supabase, {
        tenantId: 'tenant-1',
        tenantUserId: 'tu-renata',
        tenantUserCollaboratorId: 'col-renata-db',
        requestedCollaboratorId: 'col-juliana',
        email: 'renata@clinic.com',
      }),
    ).resolves.toBe('col-renata-db');
  });
});
