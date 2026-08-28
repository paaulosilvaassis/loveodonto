/**
 * PHASE_10.23G — ROTATE / RESEND / lazy EXPIRE.
 * Fixtures only. Sem token em asserts de audit. Sem backfill.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_ACTOR_REQUIRED,
  LIFECYCLE_AUDIT_EVENTS,
  LIFECYCLE_REASON_REQUIRED,
  LIFECYCLE_TENANT_MISMATCH,
  ROTATE_NOT_ALLOWED,
  ROTATION_RACE,
  SIGN_LINK_NOT_SIGNABLE,
} from '../contracts/lifecycle/index.js';
import {
  persistExpiredSigningAccess,
  prepareSigningAccessResend,
  resendSigningAccess,
  rotateSigningAccess,
} from '../services/contractSigningAccessCommandService.js';
import {
  ensureContractsModuleSeeded,
  getContractBySignToken,
  signContractViaLink,
} from '../services/contractModuleService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-g-23g';
const TENANT_B = 'tenant-g-23g-b';

const admin = {
  id: 'user-g-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin 23G',
};
const reception = {
  id: 'user-g-rec', role: 'recepcao', tenant_id: TENANT, tenantId: TENANT, name: 'Recepcao 23G',
};
const professional = {
  id: 'user-g-pro', role: 'profissional', tenant_id: TENANT, tenantId: TENANT, name: 'Prof 23G',
};

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

function expectCode(fn, code) {
  try {
    fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

async function expectCodeAsync(fn, code) {
  try {
    await fn();
    throw new Error(`expected ${code}`);
  } catch (err) {
    expect(err.code).toBe(code);
  }
}

function future() {
  return new Date(Date.now() + 86400000).toISOString();
}

function past() {
  return new Date(Date.now() - 86400000).toISOString();
}

function putAccess({
  contractStatus = CONTRACT_STATUS.GENERATED,
  requestStatus = 'sent',
  linkStatus = 'pending',
  expiresAt = future(),
  extraLinks = [],
} = {}) {
  withDb((db) => {
    db.tenants = [
      { id: TENANT, name: 'Clinica 23G', status: 'active' },
      { id: TENANT_B, name: 'Clinica 23GB', status: 'active' },
    ];
    db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clinica 23G', tenant_id: TENANT };
    db.generatedContracts = [{
      id: 'gctr-g-1',
      contractNumber: 'CTR-G-1',
      clinicId: 'clinic-1',
      tenant_id: TENANT,
      patientId: 'pat-g',
      status: contractStatus,
      renderedHtml: '<p>G</p>',
      documentHash: 'hash-g',
      version: 1,
    }];
    db.contractSignatureRequests = [{
      id: 'csreq-g',
      contractId: 'gctr-g-1',
      tenant_id: TENANT,
      status: requestStatus,
      signerRole: 'PATIENT',
      signerPersonId: 'pat-g',
      expiresAt,
      recipients: { patientEmail: 'paciente.g@example.invalid', patientName: 'Paciente G' },
      documentHash: 'hash-g',
      createdAt: '2026-01-01T00:00:00.000Z',
    }];
    db.contractSignLinks = [{
      id: 'clnk-g-1',
      contractId: 'gctr-g-1',
      requestId: 'csreq-g',
      tenant_id: TENANT,
      token: 'csgn-g-old',
      status: linkStatus,
      expiresAt,
      signerRole: 'PATIENT',
      signerPersonId: 'pat-g',
      createdAt: '2026-01-01T00:00:00.000Z',
    }, ...extraLinks];
    db.contractLifecycleAudits = [];
    db.contractSignatures = [];
    db.clinicalBudgets = [];
    db.accountsReceivable = [];
    return db;
  });
}

describe('PHASE_10.23G rotate resend expire', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    ensureContractsModuleSeeded();
    putAccess();
  });

  it('G01–G05 lazy expire persists without changing the contract', () => {
    putAccess({ expiresAt: past() });
    const resolved = getContractBySignToken('csgn-g-old');
    expect(resolved.expired).toBe(true);
    const db = loadDb();
    expect(db.contractSignLinks[0].status).toBe('expired');
    expect(db.generatedContracts[0].status).toBe(CONTRACT_STATUS.GENERATED);
    expect(db.contractLifecycleAudits.some((row) => row.eventType === LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_EXPIRED)).toBe(true);
    const again = persistExpiredSigningAccess({ token: 'csgn-g-old', contractId: 'gctr-g-1' });
    expect(again.alreadyExpired).toBe(true);
    expect(getContractBySignToken('csgn-g-old').expired).toBe(true);
    expect(JSON.stringify(db.contractLifecycleAudits)).not.toContain('csgn-g-old');
  });

  it('G06–G08 expire blocks sign even if status was still pending', async () => {
    putAccess({ expiresAt: past(), linkStatus: 'pending' });
    await expect(signContractViaLink('csgn-g-old', {
      signerName: 'Paciente G',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,g',
    })).rejects.toThrow(/inválido|expirado/i);
    expect(loadDb().generatedContracts[0].status).toBe(CONTRACT_STATUS.GENERATED);
  });

  it('G09–G16 rotate issues a new token on the same request', () => {
    const before = loadDb().contractSignLinks[0].token;
    const rotated = rotateSigningAccess({
      user: admin, contractId: 'gctr-g-1', requestId: 'csreq-g', reason: 'token vazado',
    });
    expect(rotated.request.id).toBe('csreq-g');
    expect(rotated.link.id).not.toBe('clnk-g-1');
    expect(rotated.link.token).not.toBe(before);
    expect(rotated.link.status).toBe('pending');
    expect(loadDb().contractSignLinks.find((row) => row.id === 'clnk-g-1').status).toBe('revoked');
    const signable = loadDb().contractSignLinks.filter((row) => row.requestId === 'csreq-g' && row.status === 'pending');
    expect(signable).toHaveLength(1);
    expect(getContractBySignToken(before)).toBeNull();
    expect(getContractBySignToken(rotated.link.token).contract.id).toBe('gctr-g-1');
    expect(loadDb().contractLifecycleAudits.some((row) => row.eventType === LIFECYCLE_AUDIT_EVENTS.SIGN_LINK_ROTATED)).toBe(true);
    expect(JSON.stringify(loadDb().contractLifecycleAudits)).not.toContain(rotated.link.token);
  });

  it('G17 rotate revokes every pending link of the request', () => {
    putAccess({
      extraLinks: [{
        id: 'clnk-g-2',
        contractId: 'gctr-g-1',
        requestId: 'csreq-g',
        tenant_id: TENANT,
        token: 'csgn-g-other',
        status: 'pending',
        expiresAt: future(),
        createdAt: '2026-01-02T00:00:00.000Z',
      }],
    });
    rotateSigningAccess({
      user: admin, contractId: 'gctr-g-1', requestId: 'csreq-g', reason: 'incidente',
    });
    const leftover = loadDb().contractSignLinks.filter((row) => (
      ['clnk-g-1', 'clnk-g-2'].includes(row.id) && row.status === 'pending'
    ));
    expect(leftover).toHaveLength(0);
    expect(loadDb().contractSignLinks.filter((row) => row.status === 'pending')).toHaveLength(1);
  });

  it('G18–G22 rotate auth, reason, tenant and signed source', () => {
    expectCode(() => rotateSigningAccess({ user: admin, contractId: 'gctr-g-1' }), LIFECYCLE_REASON_REQUIRED);
    expectCode(
      () => rotateSigningAccess({ user: reception, contractId: 'gctr-g-1', reason: 'x' }),
      ROTATE_NOT_ALLOWED,
    );
    expectCode(
      () => rotateSigningAccess({
        user: { role: 'admin', tenant_id: TENANT, tenantId: TENANT },
        contractId: 'gctr-g-1',
        reason: 'x',
      }),
      LIFECYCLE_ACTOR_REQUIRED,
    );
    expect(
      rotateSigningAccess({ user: professional, contractId: 'gctr-g-1', reason: 'cerimonia' }).ok,
    ).toBe(true);
    putAccess();
    expectCode(
      () => rotateSigningAccess({
        user: { ...admin, tenant_id: TENANT_B, tenantId: TENANT_B },
        contractId: 'gctr-g-1',
        reason: 'cross',
      }),
      LIFECYCLE_TENANT_MISMATCH,
    );
    putAccess({ contractStatus: CONTRACT_STATUS.SIGNED });
    expectCode(
      () => rotateSigningAccess({ user: admin, contractId: 'gctr-g-1', reason: 'nope' }),
      CONTRACT_NOT_SIGNABLE,
    );
  });

  it('G23–G28 resend keeps token and expiresAt; expired refuses', async () => {
    const before = loadDb().contractSignLinks[0];
    const resent = await resendSigningAccess({
      user: reception, contractId: 'gctr-g-1', requestId: 'csreq-g', deliverEmail: false,
    });
    expect(resent.link.token).toBe(before.token);
    expect(resent.expiresAt).toBe(before.expiresAt);
    expect(loadDb().contractSignLinks).toHaveLength(1);
    expect(loadDb().contractLifecycleAudits.some((row) => row.eventType === LIFECYCLE_AUDIT_EVENTS.SIGN_INVITE_RESENT)).toBe(true);

    putAccess({
      extraLinks: [{
        id: 'clnk-g-2',
        contractId: 'gctr-g-1',
        requestId: 'csreq-g',
        tenant_id: TENANT,
        token: 'csgn-g-dup',
        status: 'pending',
        expiresAt: future(),
      }],
    });
    expectCode(
      () => prepareSigningAccessResend({ user: admin, contractId: 'gctr-g-1', requestId: 'csreq-g' }),
      ROTATION_RACE,
    );

    putAccess({ expiresAt: past() });
    await expectCodeAsync(
      () => resendSigningAccess({ user: admin, contractId: 'gctr-g-1', deliverEmail: false }),
      SIGN_LINK_NOT_SIGNABLE,
    );
  });

  it('G29 clock-expired rotate marks old expired and creates one new pending', () => {
    putAccess({ expiresAt: past() });
    const rotated = rotateSigningAccess({
      user: admin, contractId: 'gctr-g-1', requestId: 'csreq-g', reason: 'expired_link',
    });
    expect(loadDb().contractSignLinks.find((row) => row.id === 'clnk-g-1').status).toBe('expired');
    expect(rotated.link.status).toBe('pending');
    expect(rotated.link.token).not.toBe('csgn-g-old');
  });

  it('G30–G32 canonical wiring and UI resend path', () => {
    const provider = readSrc('src/services/signatureProviderService.js');
    expect(provider).toContain('rotateSigningAccess');
    expect(provider).not.toContain("links[lIdx] = { ...links[lIdx], status: 'expired' }");
    const signedPage = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(signedPage).not.toContain('Nova versão');
    const section = readSrc('src/components/clinical/ClinicalSignatureSection.jsx');
    expect(section).toContain('resendSigningAccess');
    expect(section).toContain('onResend={handleResendInvite}');
    expect(section).not.toContain('useEffect');
    const actions = readSrc('src/components/clinical/PatientRemoteInviteActions.jsx');
    expect(actions).toContain('onResend || onSend');
  });
});
