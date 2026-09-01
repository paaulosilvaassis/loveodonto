/**
 * PHASE_10.23K — UX de acesso remoto. Sem mudança de writer/lifecycle.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  ACCESS_REPLACEMENT_NOT_ALLOWED,
  ROTATE_NOT_ALLOWED,
  getContractLifecycleUiPolicy,
} from '../contracts/lifecycle/index.js';
import { rotateSigningAccess } from '../services/contractSigningAccessCommandService.js';
import { replaceRevokedSigningAccess } from '../services/contractSigningAccessReplacementService.js';
import { SIGNING_ACCESS_ACTION_LABELS } from '../components/clinical/PatientRemoteInviteActions.jsx';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-k-23k';

const admin = {
  id: 'user-k-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin 23K',
};
const reception = {
  id: 'user-k-rec', role: 'recepcao', tenant_id: TENANT, tenantId: TENANT, name: 'Recepcao 23K',
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

function policyFor(status, actor, access = {}) {
  return getContractLifecycleUiPolicy({
    contract: { id: 'gctr-k-1', status, tenant_id: TENANT },
    actor,
    request: access.requestStatus ? {
      id: 'csreq-k', status: access.requestStatus, expiresAt: access.expiresAt || '2099-01-01T00:00:00.000Z',
    } : null,
    link: access.linkStatus ? {
      id: 'clnk-k', status: access.linkStatus, expiresAt: access.expiresAt || '2099-01-01T00:00:00.000Z',
    } : null,
  });
}

describe('PHASE_10.23K signing access UX clarification', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('UX01–UX05 sent access labels and hierarchy', () => {
    const sent = policyFor('generated', admin, { requestStatus: 'sent', linkStatus: 'pending' });
    expect(sent.canResendAccess).toBe(true);
    expect(sent.canRotateAccess).toBe(true);
    expect(sent.canRevokeAccess).toBe(true);
    expect(sent.canReplaceRevokedAccess).toBe(false);

    const actions = readSrc('src/components/clinical/PatientRemoteInviteActions.jsx');
    const pendentes = readSrc('src/pages/contratos/ContractsPendentesPage.jsx');
    expect(actions).toContain(SIGNING_ACCESS_ACTION_LABELS.resend);
    expect(actions).toContain(SIGNING_ACCESS_ACTION_LABELS.rotate);
    expect(actions).toContain(SIGNING_ACCESS_ACTION_LABELS.copy);
    expect(actions).toContain(SIGNING_ACCESS_ACTION_LABELS.revoke);
    expect(actions).toContain('clinical-access-more-actions');
    expect(actions).toContain('variant="danger"');
    expect(actions).not.toMatch(/clinical-rotate-signature-cta[\s\S]{0,180}Gerar novo acesso/);
    expect(pendentes).toContain('Substituir link de assinatura');
    expect(pendentes).toContain('Reenviar acesso');
    expect(pendentes).toMatch(/canRotateAccess[\s\S]*Substituir link de assinatura/);
    expect(pendentes).not.toMatch(/canRotateAccess[\s\S]{0,400}Gerar novo acesso/);
  });

  it('UX06–UX09 revoked access hides active ops and shows replacement', () => {
    const revoked = policyFor('generated', admin, { requestStatus: 'revoked', linkStatus: 'revoked' });
    expect(revoked.canResendAccess).toBe(false);
    expect(revoked.canRotateAccess).toBe(false);
    expect(revoked.canRevokeAccess).toBe(false);
    expect(revoked.canReplaceRevokedAccess).toBe(true);

    const actions = readSrc('src/components/clinical/PatientRemoteInviteActions.jsx');
    const revokedBlock = actions.slice(
      actions.indexOf('if (canReplace)'),
      actions.indexOf('const overflow'),
    );
    expect(revokedBlock).toContain('clinical-access-ops-revoked');
    expect(revokedBlock).toContain('clinical-replace-revoked-access-cta');
    expect(revokedBlock).toContain('SIGNING_ACCESS_ACTION_LABELS.replace');
    expect(revokedBlock).not.toContain('SIGNING_ACCESS_ACTION_LABELS.resend');
    expect(revokedBlock).not.toContain('SIGNING_ACCESS_ACTION_LABELS.copy');
    expect(revokedBlock).not.toContain('SIGNING_ACCESS_ACTION_LABELS.rotate');
    expect(revokedBlock).not.toContain('SIGNING_ACCESS_ACTION_LABELS.revoke');
  });

  it('UX10–UX12 writer mapping is exact', () => {
    const clinical = readSrc('src/components/clinical/ClinicalSignatureSection.jsx');
    const pendentes = readSrc('src/pages/contratos/ContractsPendentesPage.jsx');
    const modal = readSrc('src/components/clinical/contract/SigningAccessSecureModal.jsx');
    expect(clinical).toMatch(/mode === 'resend'[\s\S]*resendSigningAccess/);
    expect(clinical).toMatch(/mode === 'rotate'[\s\S]*rotateSigningAccess/);
    expect(clinical).toMatch(/mode === 'replace'[\s\S]*replaceRevokedSigningAccessAndInvite/);
    expect(pendentes).toMatch(/mode === 'resend'[\s\S]*resendSigningAccess/);
    expect(pendentes).toMatch(/mode === 'rotate'[\s\S]*rotateSigningAccess/);
    expect(pendentes).toMatch(/mode === 'replace'[\s\S]*replaceRevokedSigningAccessAndInvite/);
    expect(modal).toContain('Substituir link de assinatura?');
    expect(modal).toContain('O prazo do request original não será ampliado.');
    expect(modal).toContain('Gerar novo acesso de assinatura?');
    expect(modal).toContain('Um novo request, link e token serão criados para este signatário.');
    expect(modal).not.toContain('Reativar acesso');
  });

  it('UX13–UX14 signed party and terminal contracts hide mutation actions', () => {
    const signedParty = policyFor('generated', admin, { requestStatus: 'completed', linkStatus: 'signed' });
    expect(signedParty.canResendAccess).toBe(false);
    expect(signedParty.canRotateAccess).toBe(false);
    expect(signedParty.canRevokeAccess).toBe(false);
    expect(signedParty.canReplaceRevokedAccess).toBe(false);

    for (const status of [CONTRACT_STATUS.SIGNED, 'cancelled', 'voided', 'superseded']) {
      const p = policyFor(status, admin, { requestStatus: 'revoked', linkStatus: 'revoked' });
      expect(p.canResendAccess).toBe(false);
      expect(p.canRotateAccess).toBe(false);
      expect(p.canRevokeAccess).toBe(false);
      expect(p.canReplaceRevokedAccess).toBe(false);
      expect(p.canSendForSignature).toBe(false);
    }

    const actions = readSrc('src/components/clinical/PatientRemoteInviteActions.jsx');
    expect(actions).toContain("slot?.status === 'signed') return null");
  });

  it('UX15–UX16 unauthorized UI and writer RBAC stay authoritative', () => {
    const receptionSent = policyFor('generated', reception, { requestStatus: 'sent', linkStatus: 'pending' });
    expect(receptionSent.canResendAccess).toBe(true);
    expect(receptionSent.canRotateAccess).toBe(false);
    expect(receptionSent.canRevokeAccess).toBe(false);
    expect(receptionSent.canReplaceRevokedAccess).toBe(false);

    const receptionRevoked = policyFor('generated', reception, { requestStatus: 'revoked', linkStatus: 'revoked' });
    expect(receptionRevoked.canReplaceRevokedAccess).toBe(false);

    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-k-1', status: CONTRACT_STATUS.GENERATED, tenant_id: TENANT, patientId: 'pat-k',
      }];
      db.contractSignatureRequests = [{
        id: 'csreq-k', contractId: 'gctr-k-1', tenant_id: TENANT, status: 'sent', signerRole: 'PATIENT',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      db.contractSignLinks = [{
        id: 'clnk-k', contractId: 'gctr-k-1', requestId: 'csreq-k', tenant_id: TENANT,
        token: 'csgn-k-hidden', status: 'pending', expiresAt: '2099-01-01T00:00:00.000Z',
      }];
      return db;
    });
    expectCode(
      () => rotateSigningAccess({
        user: reception, contractId: 'gctr-k-1', requestId: 'csreq-k', reason: 'nope',
      }),
      ROTATE_NOT_ALLOWED,
    );
    withDb((db) => {
      db.contractSignatureRequests[0].status = 'revoked';
      db.contractSignLinks[0].status = 'revoked';
      return db;
    });
    expectCode(
      () => replaceRevokedSigningAccess({
        user: reception, contractId: 'gctr-k-1', reason: 'Novo acesso após revogação.',
      }),
      ACCESS_REPLACEMENT_NOT_ALLOWED,
    );
  });

  it('no-access shows send only; UI does not mutate DB', () => {
    const none = policyFor('generated', admin);
    expect(none.canSendForSignature).toBe(true);
    expect(none.canResendAccess).toBe(false);
    expect(none.canRotateAccess).toBe(false);
    expect(none.canRevokeAccess).toBe(false);
    expect(none.canReplaceRevokedAccess).toBe(false);
    const actions = readSrc('src/components/clinical/PatientRemoteInviteActions.jsx');
    expect(actions).toContain(SIGNING_ACCESS_ACTION_LABELS.send);
    expect(actions).not.toMatch(/withDb\s*\(/);
    expect(readSrc('src/components/clinical/ClinicalSignatureSection.jsx')).not.toMatch(/withDb\s*\(/);
    expect(readSrc('src/pages/contratos/ContractsPendentesPage.jsx')).not.toMatch(/withDb\s*\(/);
  });
});
