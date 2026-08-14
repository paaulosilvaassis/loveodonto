/**
 * PHASE_10.21BC — auditoria pós-primeiro-login da identidade da Juliana.
 * Resolução/guard only. Zero signature evidence. Sem mutar CTR-2026-00001/00002.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import {
  SIGNER_IDENTITY_ERROR,
  SignerIdentityError,
  canAuthenticatedUserSignSlot,
  decideAuthenticatedProfessionalSignature,
  resolveAuthenticatedSignerIdentity,
  assertAuthenticatedSignerForStroke,
} from '../contracts/authenticatedSignerIdentity.js';
import { inspectProfessionalAuthBinding } from '../contracts/inspectProfessionalAuthBinding.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';
import { CLINICAL_SIGNER_ROLE } from '../contracts/clinicalRequiredSigners.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TENANT = 'b721c2c9-d924-41ee-8911-dc00c8208326';
const JULIANA = 'col-5e1c66f5-342a-4ac8-936c-0eb603df73e8';
const JULIANA_AUTH = '7d6bf5ac-aaaa-4ac8-936c-00000000df30';
const JULIANA_SAAS = `col-saas-${JULIANA_AUTH}`;
const JULIANA_EMAIL = 'juliana.bc@implanprime.test';
const PAULO_AUTH = '066dcd98-aecf-4886-8947-a439849e37f7';
const PAULO_COL = `col-saas-${PAULO_AUTH}`;

const requiredSigner = {
  role: CLINICAL_SIGNER_ROLE.PROFESSIONAL,
  personId: JULIANA,
  name: 'Juliana de Oliveira Freire',
};
const professionalSlot = { role: CLINICAL_SIGNER_ROLE.PROFESSIONAL, personId: JULIANA, status: 'pending' };

const julianaUser = {
  id: JULIANA_AUTH,
  role: 'profissional',
  tenantId: TENANT,
  tenant_id: TENANT,
  email: JULIANA_EMAIL,
  collaboratorId: JULIANA,
  collaborator_id: JULIANA,
  authMode: 'saas',
  name: 'Juliana de Oliveira Freire',
};
const pauloUser = {
  id: PAULO_AUTH,
  role: 'master',
  tenantId: TENANT,
  tenant_id: TENANT,
  isMaster: true,
  email: 'paulo.bc@implanprime.test',
  collaboratorId: PAULO_COL,
};

function seedClinic(extra = () => {}) {
  withDb((db) => {
    db.tenants = [{ id: TENANT, name: 'Implanprime' }];
    db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
    db.collaborators = [
      {
        id: JULIANA,
        nomeCompleto: 'Juliana de Oliveira Freire',
        email: JULIANA_EMAIL,
        tenant_id: TENANT,
      },
      { id: PAULO_COL, nomeCompleto: 'Paulo Henrique Silva de Assis', tenant_id: TENANT, email: pauloUser.email },
    ];
    db.collaboratorAccess = [
      { collaboratorId: PAULO_COL, userId: PAULO_AUTH, role: 'master' },
    ];
    db.memberships = [
      { tenant_id: TENANT, user_id: PAULO_AUTH, role: 'master', has_system_access: true, status: 'active' },
    ];
    db.users = [];
    db.users_profile = [];
    db.userAuth = [];
    db.userInvites = [];
    db.contractSignatures = [];
    db.generatedContracts = [
      { id: 'gctr-bc-00001', contractNumber: 'CTR-2026-00001', status: 'generated', tenant_id: TENANT },
      { id: 'gctr-bc-00002', contractNumber: 'CTR-2026-00002', status: 'signed', tenant_id: TENANT },
    ];
    extra(db);
    return db;
  });
}

function assertUntouchedLegalCycle() {
  const db = loadDb();
  expect(db.contractSignatures).toHaveLength(0);
  expect(db.generatedContracts.find((c) => c.contractNumber === 'CTR-2026-00001')?.status).toBe('generated');
  expect(db.generatedContracts.find((c) => c.contractNumber === 'CTR-2026-00002')?.status).toBe('signed');
}

describe('PHASE_10.21BC Juliana first-login identity audit', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('A first login preserva o collaborator id canônico do RH', () => {
    seedClinic();
    ensureSaasUserInLocalDb(julianaUser);
    const db = loadDb();
    expect(db.collaborators.find((c) => c.id === JULIANA)).toBeTruthy();
    expect(db.collaborators.some((c) => c.id === JULIANA_SAAS)).toBe(false);
    expect(db.collaboratorAccess.find((a) => a.userId === JULIANA_AUTH)?.collaboratorId).toBe(JULIANA);
    assertUntouchedLegalCycle();
  });

  it('B não cria col-saas duplicado quando tenant_user já possui collaborator_id', () => {
    seedClinic((db) => {
      db.collaborators = db.collaborators.filter((c) => c.id !== JULIANA);
    });
    ensureSaasUserInLocalDb({ ...julianaUser, collaborator_id: JULIANA });
    const db = loadDb();
    expect(db.collaborators.find((c) => c.id === JULIANA)).toBeTruthy();
    expect(db.collaborators.some((c) => c.id === JULIANA_SAAS)).toBe(false);
    expect(db.collaboratorAccess.find((a) => a.userId === JULIANA_AUTH)?.collaboratorId).toBe(JULIANA);
    ensureSaasUserInLocalDb({ ...julianaUser, name: 'Juliana de Oliveira Freire' });
    expect(loadDb().collaboratorAccess.find((a) => a.userId === JULIANA_AUTH)?.collaboratorId).toBe(JULIANA);
    assertUntouchedLegalCycle();
  });

  it('C resolver pós-login inclui o personId canônico', () => {
    seedClinic();
    ensureSaasUserInLocalDb(julianaUser);
    const identity = resolveAuthenticatedSignerIdentity(julianaUser);
    expect(identity.ok).toBe(true);
    expect(identity.authenticatedUserId).toBe(JULIANA_AUTH);
    expect(identity.linkedPersonIds).toEqual([JULIANA]);
    const decided = decideAuthenticatedProfessionalSignature(julianaUser, requiredSigner);
    expect(decided.identityMatch).toBe(true);
    expect(decided.decision).toBe('ALLOW');
    assertUntouchedLegalCycle();
  });

  it('D Juliana autenticada e vinculada → Juliana ALLOW', () => {
    seedClinic();
    ensureSaasUserInLocalDb(julianaUser);
    expect(canAuthenticatedUserSignSlot(julianaUser, professionalSlot).canSignElectronically).toBe(true);
    expect(assertAuthenticatedSignerForStroke(julianaUser, {
      signerRole: 'PROFESSIONAL',
      signerPersonId: JULIANA,
      tenantId: TENANT,
    }).ok).toBe(true);
    assertUntouchedLegalCycle();
  });

  it('E Paulo autenticado → Juliana DENY (admin/master não bypassa)', () => {
    seedClinic();
    const decided = decideAuthenticatedProfessionalSignature(pauloUser, requiredSigner);
    expect(decided.identityMatch).toBe(false);
    expect(decided.decision).toBe('DENY');
    expect(canAuthenticatedUserSignSlot(pauloUser, professionalSlot).canSignElectronically).toBe(false);
    expect(() => assertAuthenticatedSignerForStroke(pauloUser, {
      signerRole: 'PROFESSIONAL',
      signerPersonId: JULIANA,
      tenantId: TENANT,
    })).toThrow(SignerIdentityError);
    const spoofed = { ...pauloUser, collaboratorId: JULIANA, collaborator_id: JULIANA };
    expect(decideAuthenticatedProfessionalSignature(spoofed, requiredSigner).decision).toBe('DENY');
    assertUntouchedLegalCycle();
  });

  it('F duplicate identity ambiguity = FAIL CLOSED', () => {
    seedClinic((db) => {
      db.collaborators.push({
        id: JULIANA_SAAS,
        nomeCompleto: 'Juliana de Oliveira Freire',
        email: JULIANA_EMAIL,
        tenant_id: TENANT,
      });
      db.collaboratorAccess.push(
        { collaboratorId: JULIANA, userId: JULIANA_AUTH, role: 'profissional' },
        { collaboratorId: JULIANA_SAAS, userId: JULIANA_AUTH, role: 'profissional' },
      );
      db.memberships.push({
        tenant_id: TENANT, user_id: JULIANA_AUTH, role: 'profissional', has_system_access: true, status: 'active',
      });
      db.users.push({ id: JULIANA_AUTH, email: JULIANA_EMAIL, name: 'Juliana de Oliveira Freire' });
    });
    const identity = resolveAuthenticatedSignerIdentity(julianaUser);
    expect(identity.ok).toBe(false);
    expect(identity.code).toBe(SIGNER_IDENTITY_ERROR.AMBIGUOUS);
    expect(identity.linkedPersonIds).toEqual(expect.arrayContaining([JULIANA, JULIANA_SAAS]));
    const decided = decideAuthenticatedProfessionalSignature(julianaUser, requiredSigner);
    expect(decided.identityMatch).toBe(false);
    expect(decided.decision).toBe('BLOCKED');
    expect(inspectProfessionalAuthBinding({
      requiredPersonId: JULIANA, user: julianaUser, tenantId: TENANT,
    }).identityAmbiguity).toBe('YES');
    expect(() => assertAuthenticatedSignerForStroke(julianaUser, {
      signerRole: 'PROFESSIONAL',
      signerPersonId: JULIANA,
      tenantId: TENANT,
    })).toThrow(SignerIdentityError);
    ensureSaasUserInLocalDb(julianaUser);
    expect(loadDb().collaborators.filter((c) => c.id === JULIANA || c.id === JULIANA_SAAS)).toHaveLength(2);
    assertUntouchedLegalCycle();
  });

  it('G convite aceito sozinho não basta sem vínculo persistido', () => {
    seedClinic((db) => {
      db.userInvites.push({
        id: 'uinv-bc-juliana',
        collaboratorId: JULIANA,
        email: JULIANA_EMAIL,
        usedAt: '2026-08-14T20:00:32.173Z',
        acceptedAt: '2026-08-14T20:00:32.173Z',
      });
      db.memberships.push({
        tenant_id: TENANT, user_id: JULIANA_AUTH, role: 'profissional', has_system_access: true, status: 'active',
      });
    });
    const inspect = inspectProfessionalAuthBinding({
      requiredPersonId: JULIANA, user: julianaUser, tenantId: TENANT,
    });
    expect(inspect.invitationState).toBe('accepted');
    expect(inspect.collaboratorAccessLink).toBe('FAIL');
    expect(inspect.canSignElectronically).toBe(false);
    expect(decideAuthenticatedProfessionalSignature(julianaUser, requiredSigner).decision).toBe('DENY');
    assertUntouchedLegalCycle();
  });

  it('H nenhum teste grava signature evidence e o bootstrap carrega collaboratorId', () => {
    seedClinic();
    const authSrc = readFileSync(path.join(ROOT, 'src/services/saasAuthService.js'), 'utf8');
    const sessionSrc = readFileSync(path.join(ROOT, 'src/auth/saasSessionResolver.js'), 'utf8');
    expect(authSrc).toMatch(/collaboratorId:\s*json\?\.currentUser\?\.collaboratorId/);
    expect(sessionSrc).toMatch(/collaboratorId:\s*bootstrap\.collaboratorId/);
    expect(sessionSrc).toMatch(/collaboratorId:\s*u\.collaboratorId/);
    expect(decideAuthenticatedProfessionalSignature(julianaUser, requiredSigner).decision).toBe('DENY');
    assertUntouchedLegalCycle();
  });
});
