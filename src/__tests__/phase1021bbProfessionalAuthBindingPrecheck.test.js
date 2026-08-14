/**
 * PHASE_10.21BB — precheck READ-ONLY da identidade autenticável da profissional.
 * Sem signature evidence. Sem mutar CTR-2026-00002 / ORC-002.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import {
  SIGNER_IDENTITY_ERROR,
  SignerIdentityError,
  canAuthenticatedUserSignSlot,
  resolveAuthenticatedSignerIdentity,
  assertAuthenticatedSignerForStroke,
} from '../contracts/authenticatedSignerIdentity.js';
import { inspectProfessionalAuthBinding } from '../contracts/inspectProfessionalAuthBinding.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const OTHER_TENANT = 'tenant-bb-other';
const JULIANA = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const OTHER_DENTIST = 'col-bb-other-dentist';
const PAULO_COL = 'col-saas-066dcd98-aecf-4886-8947-a439849e37f7';
const JULIANA_AUTH = 'user-bb-juliana-auth';
const JULIANA_EMAIL = 'juliana.bb@implanprime.test';

const pauloAdmin = { id: 'user-bb-paulo', role: 'admin', tenantId: TENANT, tenant_id: TENANT, isMaster: false };
const pauloMaster = { id: 'user-bb-paulo-master', role: 'master', tenantId: TENANT, tenant_id: TENANT, isMaster: true };
const julianaUser = { id: JULIANA_AUTH, role: 'dentista', tenantId: TENANT, tenant_id: TENANT, email: JULIANA_EMAIL };
const otherDentistUser = { id: 'user-bb-other-dentist', role: 'dentista', tenantId: TENANT, tenant_id: TENANT };
const otherTenantUser = { id: 'user-bb-other-tenant', role: 'admin', tenantId: OTHER_TENANT, tenant_id: OTHER_TENANT };

const professionalSlot = { role: CLINICAL_SIGNER_ROLE.PROFESSIONAL, personId: JULIANA, status: 'pending' };

function seedBase({
  linkJulianaAccess = false,
  pendingInvite = false,
  julianaUserIdOnCollaborator = null,
} = {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }, { id: OTHER_TENANT, name: 'Outro' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.collaborators = [
      {
        id: JULIANA,
        nomeCompleto: 'Juliana de Oliveira Freire',
        conselhoNumero: '27267',
        conselhoUf: 'MG',
        email: JULIANA_EMAIL,
        tenant_id: TENANT,
        userId: julianaUserIdOnCollaborator,
      },
      { id: OTHER_DENTIST, nomeCompleto: 'Outro Dentista', conselhoNumero: '99999', tenant_id: TENANT },
      { id: PAULO_COL, nomeCompleto: 'Paulo Henrique Silva de Assis', tenant_id: TENANT },
    ];
    db.collaboratorAccess = [
      { collaboratorId: PAULO_COL, userId: pauloAdmin.id, role: 'admin' },
      { collaboratorId: PAULO_COL, userId: pauloMaster.id, role: 'master' },
      { collaboratorId: OTHER_DENTIST, userId: otherDentistUser.id, role: 'dentista' },
    ];
    if (linkJulianaAccess) {
      db.collaboratorAccess.push({ collaboratorId: JULIANA, userId: JULIANA_AUTH, role: 'dentista' });
    }
    db.memberships = [
      { tenant_id: TENANT, user_id: pauloAdmin.id, role: 'admin', has_system_access: true, status: 'active' },
      { tenant_id: TENANT, user_id: pauloMaster.id, role: 'master', has_system_access: true, status: 'active' },
      { tenant_id: TENANT, user_id: JULIANA_AUTH, role: 'dentista', has_system_access: true, status: 'active' },
      { tenant_id: TENANT, user_id: otherDentistUser.id, role: 'dentista', has_system_access: true, status: 'active' },
      { tenant_id: OTHER_TENANT, user_id: otherTenantUser.id, role: 'admin', has_system_access: true, status: 'active' },
    ];
    db.userInvites = pendingInvite ? [{
      id: 'uinv-bb-juliana',
      collaboratorId: JULIANA,
      email: JULIANA_EMAIL,
      usedAt: null,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    }] : [];
    db.contractSignatures = [];
    db.generatedContracts = [{
      id: 'gctr-bb-untouched',
      contractNumber: 'CTR-2026-00002',
      status: 'signed',
      tenant_id: TENANT,
    }];
  });
}

function deny(user) {
  expect(resolveAuthenticatedSignerIdentity(user).linkedPersonIds.includes(JULIANA)).toBe(false);
  expect(canAuthenticatedUserSignSlot(user, professionalSlot).canSignElectronically).toBe(false);
  expect(() => assertAuthenticatedSignerForStroke(user, {
    signerRole: 'PROFESSIONAL',
    signerPersonId: JULIANA,
    tenantId: user.tenantId,
  })).toThrow(SignerIdentityError);
}

describe('PHASE_10.21BB professional authenticated identity precheck', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A Paulo → Juliana = DENY', () => {
    seedBase();
    deny(pauloAdmin);
    expect(inspectProfessionalAuthBinding({ requiredPersonId: JULIANA, user: pauloAdmin, tenantId: TENANT }).signerSlotMatch).toBe('FAIL');
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('B master → Juliana = DENY', () => {
    seedBase();
    deny(pauloMaster);
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('C Juliana real → Juliana = ALLOW', () => {
    seedBase({ linkJulianaAccess: true });
    const identity = resolveAuthenticatedSignerIdentity(julianaUser);
    expect(identity.ok).toBe(true);
    expect(identity.linkedPersonIds).toContain(JULIANA);
    expect(canAuthenticatedUserSignSlot(julianaUser, professionalSlot).canSignElectronically).toBe(true);
    expect(assertAuthenticatedSignerForStroke(julianaUser, {
      signerRole: 'PROFESSIONAL',
      signerPersonId: JULIANA,
      tenantId: TENANT,
    }).ok).toBe(true);
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('D outro profissional → Juliana = DENY', () => {
    seedBase({ linkJulianaAccess: true });
    deny(otherDentistUser);
  });

  it('E outro tenant → DENY', () => {
    seedBase({ linkJulianaAccess: true });
    const identity = resolveAuthenticatedSignerIdentity(otherTenantUser);
    expect(identity.linkedPersonIds.includes(JULIANA)).toBe(false);
    deny(otherTenantUser);
  });

  it('F collaboratorId adulterado → DENY', () => {
    seedBase();
    const spoofed = { ...pauloAdmin, collaboratorId: JULIANA, collaborator_id: JULIANA };
    deny(spoofed);
    expect(resolveAuthenticatedSignerIdentity(spoofed).ok).toBe(false);
  });

  it('G userId legítimo + vínculo Juliana → ALLOW', () => {
    seedBase({ linkJulianaAccess: true });
    const inspect = inspectProfessionalAuthBinding({
      requiredPersonId: JULIANA,
      user: julianaUser,
      tenantId: TENANT,
    });
    expect(inspect.clinicalRegistration).toBe('PRESENT');
    expect(inspect.userProvisioned).toBe('YES');
    expect(inspect.collaboratorAccessLink).toBe('PASS');
    expect(inspect.signerSlotMatch).toBe('PASS');
    expect(inspect.canSignElectronically).toBe(true);
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('H colaborador sem userId → BLOCKED', () => {
    seedBase({ linkJulianaAccess: false, julianaUserIdOnCollaborator: null });
    const inspect = inspectProfessionalAuthBinding({
      requiredPersonId: JULIANA,
      user: julianaUser,
      tenantId: TENANT,
    });
    expect(inspect.clinicalRegistration).toBe('PRESENT');
    expect(inspect.userProvisioned).toBe('NO');
    expect(inspect.collaboratorAccessLink).toBe('FAIL');
    expect(inspect.canSignElectronically).toBe(false);
    expect(inspect.identityCode).toBe(SIGNER_IDENTITY_ERROR.NO_PERSON);
  });

  it('I convite pendente não equivale a identidade autenticada', () => {
    seedBase({ pendingInvite: true, linkJulianaAccess: false });
    const inspect = inspectProfessionalAuthBinding({
      requiredPersonId: JULIANA,
      user: julianaUser,
      tenantId: TENANT,
    });
    expect(inspect.invitationState).toBe('pending');
    expect(inspect.pendingInviteIsNotAuthenticatedIdentity).toBe(true);
    expect(inspect.canSignElectronically).toBe(false);
    expect(canAuthenticatedUserSignSlot(julianaUser, professionalSlot).canSignElectronically).toBe(false);
    expect(loadDb().contractSignatures).toHaveLength(0);
  });

  it('J nenhum teste cria signature evidence e seed SaaS não renomeia o RH', () => {
    seedBase({ pendingInvite: true });
    ensureSaasUserInLocalDb({
      id: JULIANA_AUTH,
      name: 'Juliana de Oliveira Freire',
      email: JULIANA_EMAIL,
      role: 'dentista',
      tenantId: TENANT,
      authMode: 'saas',
    });
    const db = loadDb();
    expect(db.collaborators.find((c) => c.id === JULIANA)).toBeTruthy();
    expect(db.collaborators.some((c) => c.id === `col-saas-${JULIANA_AUTH}`)).toBe(false);
    expect(db.collaboratorAccess.find((a) => a.userId === JULIANA_AUTH)?.collaboratorId).toBe(JULIANA);
    expect(db.generatedContracts.find((c) => c.contractNumber === 'CTR-2026-00002')?.status).toBe('signed');
    expect(db.contractSignatures).toHaveLength(0);
  });
});
