import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  buildBackfillPlan,
  buildInvitationLookup,
  buildRhLookup,
  classifyTenantUserRow,
  isSyntheticCollaboratorId,
  resolveRealCollaboratorId,
} from '../../server/lib/collaboratorIdBackfill.js';

const TENANT = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';

describe('collaboratorIdBackfill', () => {
  it('detecta ID sintético col-saas-*', () => {
    expect(isSyntheticCollaboratorId('col-saas-abc')).toBe(true);
    expect(isSyntheticCollaboratorId('col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3')).toBe(false);
  });

  it('resolve Juliana: convite real substitui col-saas-*', () => {
    const rhLookup = buildRhLookup([]);
    const invitationLookup = buildInvitationLookup([{
      collaborator_id: 'col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70',
      tenant_id: TENANT,
      email: 'drajuliana@implanprime.com.br',
      status: 'accepted',
    }]);
    const resolution = resolveRealCollaboratorId({
      tenantId: TENANT,
      email: 'drajuliana@implanprime.com.br',
      rhLookup,
      invitationLookup,
      identityLookup: new Map(),
    });
    expect(resolution.resolvedId).toBe('col-f93e5dbf-bcc0-4c6d-8f94-f90f7f46bb70');
    expect(resolution.ambiguous).toBe(false);

    const row = classifyTenantUserRow({
      id: 'tu-juliana',
      tenant_id: TENANT,
      email: 'drajuliana@implanprime.com.br',
      collaborator_id: 'col-saas-c9a3cc7e-d4ab-4934-aad3-56cb0558f1d6',
      user_id: 'c9a3cc7e-d4ab-4934-aad3-56cb0558f1d6',
      role_slug: 'administrativo',
      status: 'active',
    }, resolution, new Map());

    expect(row.action).toBe(ACTIONS.UPDATE_PROPOSED);
  });

  it('marca AMBIGUOUS quando RH export tem dois IDs para o mesmo e-mail', () => {
    const rhLookup = buildRhLookup([
      { id: 'col-a', tenant_id: TENANT, email: 'renata@clinic.com' },
      { id: 'col-b', tenant_id: TENANT, email: 'renata@clinic.com' },
    ]);
    const resolution = resolveRealCollaboratorId({
      tenantId: TENANT,
      email: 'renata@clinic.com',
      rhLookup,
      invitationLookup: new Map(),
      identityLookup: new Map(),
    });
    expect(resolution.ambiguous).toBe(true);
    const row = classifyTenantUserRow({
      id: 'tu-renata',
      tenant_id: TENANT,
      email: 'renata@clinic.com',
      collaborator_id: 'col-a',
      role_slug: 'gerente',
      status: 'active',
    }, resolution, new Map());
    expect(row.action).toBe(ACTIONS.AMBIGUOUS);
  });

  it('marca NOT_FOUND para col-saas sem convite/RH', () => {
    const plan = buildBackfillPlan({
      tenantUsers: [{
        id: 'tu-paulo',
        tenant_id: TENANT,
        email: 'paaulosilvaassis@hotmail.com',
        collaborator_id: 'col-saas-362c17b7-0abd-4d3f-8669-69c8f409b341',
        user_id: '362c17b7-0abd-4d3f-8669-69c8f409b341',
        role_slug: 'master',
        status: 'active',
      }],
      invitations: [],
      identities: [],
      rhCollaborators: [],
    });
    expect(plan.rows[0].action).toBe(ACTIONS.NOT_FOUND);
  });

  it('marca OK quando Melissa já está alinhada', () => {
    const collabId = 'col-c52fd5ce-4bc9-4c7d-a4c0-298525d401a3';
    const plan = buildBackfillPlan({
      tenantUsers: [{
        id: 'tu-melissa',
        tenant_id: TENANT,
        email: 'melissa@implanprime.com.br',
        collaborator_id: collabId,
        user_id: '250a4d8b-c4ff-449b-bc73-402fb663c9e6',
        role_slug: 'gerente',
        status: 'active',
      }],
      invitations: [{
        tenant_id: TENANT,
        email: 'melissa@implanprime.com.br',
        collaborator_id: collabId,
        status: 'accepted',
      }],
      identities: [],
      rhCollaborators: [],
    });
    expect(plan.rows[0].action).toBe(ACTIONS.OK);
  });

  it('prioriza RH export sobre convite divergente', () => {
    const rhId = 'col-rh-authoritative';
    const plan = buildBackfillPlan({
      tenantUsers: [{
        id: 'tu-renata',
        tenant_id: TENANT,
        email: 'renata@clinic.com',
        collaborator_id: 'col-old',
        role_slug: 'administrativo',
        status: 'active',
      }],
      invitations: [{
        tenant_id: TENANT,
        email: 'renata@clinic.com',
        collaborator_id: 'col-from-invite',
        status: 'accepted',
      }],
      identities: [],
      rhCollaborators: [{ id: rhId, tenant_id: TENANT, email: 'renata@clinic.com' }],
    });
    expect(plan.rows[0].collaborator_id_resolved).toBe(rhId);
    expect(plan.rows[0].action).toBe(ACTIONS.UPDATE_PROPOSED);
  });
});
