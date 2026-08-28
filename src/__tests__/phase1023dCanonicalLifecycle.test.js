/**
 * PHASE_10.23D — canonical lifecycle domain. Fixtures only. Sem backfill.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import {
  CONTRACT_LIFECYCLE_TRANSITION_INVALID,
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_ACTIONS,
  REISSUE_IDENTITY_INVALID,
  REISSUE_REQUIRES_NEW_CONTRACT_ID,
  SIGNATURE_REQUEST_NOT_SIGNABLE,
  SIGN_LINK_NOT_SIGNABLE,
  assertContractSignable,
  assertContractStatusMutation,
  assertContractTransition,
  assertReissueIdentities,
  assertSignLinkSignable,
  assertSignatureRequestSignable,
  canTransitionContract,
  deriveCeremonyLifecycleState,
  isContractSignable,
  isSignLinkSignable,
  isSignatureRequestSignable,
  normalizeCeremonyState,
  normalizeContractLifecycleStatus,
  normalizeLinkLifecycleStatus,
  normalizeRequestLifecycleStatus,
} from '../contracts/lifecycle/index.js';
import { cancelGeneratedContract } from '../services/contractService.js';
import { processSignatureWebhookEvent } from '../services/contractSignatureFlowService.js';
import { SIGNATURE_WEBHOOK_EVENTS } from '../contracts/contractConstants.js';

const TENANT = 'tenant-d-23d';
const admin = { id: 'user-d-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT, name: 'Admin 23D' };

describe('PHASE_10.23D canonical lifecycle domain', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: TENANT, name: 'Clínica 23D', status: 'active' }];
      db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clínica 23D', tenant_id: TENANT };
      return db;
    });
  });

  it('D01–D07 contract normalization', () => {
    expect(normalizeContractLifecycleStatus('draft')).toBe('draft');
    expect(normalizeContractLifecycleStatus('generated')).toBe('generated');
    expect(normalizeContractLifecycleStatus('canceled')).toBe('cancelled');
    expect(normalizeContractLifecycleStatus('completed')).toBe('signed');
    expect(normalizeContractLifecycleStatus('replaced')).toBe('superseded');
    expect(normalizeContractLifecycleStatus('nope')).toBe('unknown');
    expect(normalizeContractLifecycleStatus(null)).toBe('unknown');
  });

  it('D08–D15 signability', () => {
    expect(isContractSignable({ status: 'generated' })).toBe(true);
    expect(isContractSignable({ status: 'partially_signed' })).toBe(true);
    expect(isContractSignable({ status: 'draft' })).toBe(false);
    expect(isContractSignable({ status: 'cancelled' })).toBe(false);
    expect(isContractSignable({ status: 'signed' })).toBe(false);
    expect(isContractSignable({ status: 'voided' })).toBe(false);
    expect(isContractSignable({ status: 'superseded' })).toBe(false);
    expect(isContractSignable({ status: 'mystery' })).toBe(false);
    expect(() => assertContractSignable({ id: 'x', status: 'signed' })).toThrowError();
    try {
      assertContractSignable({ id: 'x', status: 'unknown-x' });
    } catch (err) {
      expect(err.code).toBe(CONTRACT_NOT_SIGNABLE);
      expect(err.normalizedStatus).toBe('unknown');
    }
  });

  it('D16–D21 allowed transitions', () => {
    expect(canTransitionContract('draft', 'generated', LIFECYCLE_ACTIONS.GENERATE)).toBe(true);
    expect(canTransitionContract('generated', 'partially_signed', LIFECYCLE_ACTIONS.RECORD_SIGNATURE)).toBe(true);
    expect(canTransitionContract('partially_signed', 'signed', LIFECYCLE_ACTIONS.RECORD_SIGNATURE)).toBe(true);
    expect(canTransitionContract('draft', 'cancelled', LIFECYCLE_ACTIONS.CANCEL_UNSIGNED)).toBe(true);
    expect(canTransitionContract('generated', 'cancelled', LIFECYCLE_ACTIONS.CANCEL_UNSIGNED)).toBe(true);
    expect(canTransitionContract('partially_signed', 'cancelled', LIFECYCLE_ACTIONS.ABORT_PARTIAL)).toBe(true);
    expect(() => assertContractTransition('partially_signed', 'cancelled', LIFECYCLE_ACTIONS.ABORT_PARTIAL)).not.toThrow();
  });

  it('D22–D27 forbidden transitions fail closed', () => {
    const blocked = [
      ['signed', 'draft'],
      ['signed', 'generated'],
      ['signed', 'cancelled'],
      ['cancelled', 'generated'],
      ['voided', 'generated'],
      ['superseded', 'generated'],
    ];
    blocked.forEach(([from, to]) => {
      expect(canTransitionContract(from, to)).toBe(false);
      try {
        assertContractTransition(from, to);
        throw new Error(`expected block ${from}->${to}`);
      } catch (err) {
        expect(err.code).toBe(CONTRACT_LIFECYCLE_TRANSITION_INVALID);
        expect(err.from).toBe(from === 'cancelled' ? 'cancelled' : from);
        expect(err.to).toBe(to);
      }
    });
    expect(() => assertContractTransition('signed', 'voided', LIFECYCLE_ACTIONS.VOID_SIGNED)).not.toThrow();
    expect(assertContractTransition('signed', 'voided', LIFECYCLE_ACTIONS.VOID_SIGNED).writerImplemented).toBe(true);
    expect(assertContractTransition('voided', 'superseded', LIFECYCLE_ACTIONS.SUPERSEDE).writerImplemented).toBe(true);
  });

  it('D28–D29 reissue requires a new contractId', () => {
    expect(REISSUE_REQUIRES_NEW_CONTRACT_ID).toBe(true);
    expect(() => assertReissueIdentities({
      oldContractId: 'gctr-same',
      newContractId: 'gctr-same',
    })).toThrowError();
    try {
      assertReissueIdentities({ oldContractId: 'gctr-a', newContractId: 'gctr-a' });
    } catch (err) {
      expect(err.code).toBe(REISSUE_IDENTITY_INVALID);
    }
    expect(assertReissueIdentities({
      oldContractId: 'gctr-old',
      newContractId: 'gctr-new',
      oldManifestId: 'man-1',
      newManifestId: 'man-2',
    })).toBe(true);
  });

  it('D30–D35 request signability + runtime expiration', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isSignatureRequestSignable({ status: 'pending', expiresAt: future })).toBe(true);
    expect(isSignatureRequestSignable({ status: 'sent', expiresAt: future })).toBe(true);
    expect(isSignatureRequestSignable({ status: 'completed', expiresAt: future })).toBe(false);
    expect(isSignatureRequestSignable({ status: 'revoked', expiresAt: future })).toBe(false);
    expect(isSignatureRequestSignable({ status: 'expired' })).toBe(false);
    expect(isSignatureRequestSignable({ status: 'pending', expiresAt: past })).toBe(false);
    expect(() => assertSignatureRequestSignable({ status: 'completed' })).toThrowError();
    try {
      assertSignatureRequestSignable({ status: 'pending', expiresAt: past, contractId: 'gctr-x' });
    } catch (err) {
      expect(err.code).toBe(SIGNATURE_REQUEST_NOT_SIGNABLE);
    }
  });

  it('D36–D40 link signability + runtime expiration', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    expect(isSignLinkSignable({ status: 'pending', expiresAt: future })).toBe(true);
    expect(isSignLinkSignable({ status: 'signed', expiresAt: future })).toBe(false);
    expect(isSignLinkSignable({ status: 'revoked', expiresAt: future })).toBe(false);
    expect(isSignLinkSignable({ status: 'expired' })).toBe(false);
    expect(isSignLinkSignable({ status: 'pending', expiresAt: past })).toBe(false);
    expect(normalizeLinkLifecycleStatus('consumed')).toBe('signed');
    expect(normalizeRequestLifecycleStatus('cancelled')).toBe('revoked');
    try {
      assertSignLinkSignable({ status: 'pending', expiresAt: past, contractId: 'gctr-l' });
    } catch (err) {
      expect(err.code).toBe(SIGN_LINK_NOT_SIGNABLE);
    }
  });

  it('D41–D43 alias safety', () => {
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-completed',
        clinicId: 'clinic-1',
        tenant_id: TENANT,
        status: 'completed',
      }];
      return db;
    });
    expect(() => cancelGeneratedContract(admin, 'gctr-completed')).toThrow();
    expect(loadDb().generatedContracts[0].status).toBe('completed');
    expect(isContractSignable({ status: 'canceled' })).toBe(false);
    expect(isContractSignable({ status: 'replaced' })).toBe(false);
    expect(() => assertContractSignable({ id: 'a', status: 'canceled' })).toThrowError();
    expect(() => assertContractSignable({ id: 'b', status: 'replaced' })).toThrowError();
  });

  it('D44 generic signed -> generated bypass blocked', () => {
    try {
      assertContractStatusMutation({ id: 'gctr-signed', status: 'signed' }, 'generated');
      throw new Error('expected block');
    } catch (err) {
      expect(err.code).toBe(CONTRACT_LIFECYCLE_TRANSITION_INVALID);
      expect(err.from).toBe('signed');
      expect(err.to).toBe('generated');
    }
    withDb((db) => {
      db.generatedContracts = [{
        id: 'gctr-wh',
        clinicId: 'clinic-1',
        tenant_id: TENANT,
        status: 'signed',
      }];
      db.contractSignatureRequests = [{
        id: 'req-wh',
        contractId: 'gctr-wh',
        status: 'sent',
        tenant_id: TENANT,
      }];
      return db;
    });
    processSignatureWebhookEvent({
      event: SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_SENT,
      contractId: 'gctr-wh',
    });
    expect(loadDb().generatedContracts[0].status).toBe('signed');
  });

  it('ceremony derivation is hybrid and does not persist', () => {
    expect(normalizeCeremonyState('awaiting_required_signers')).toBe('awaiting_remote');
    expect(deriveCeremonyLifecycleState({
      contract: { status: 'canceled' },
      signatureCount: 1,
    })).toBe('aborted');
    expect(deriveCeremonyLifecycleState({
      contract: { status: 'generated' },
      signatureCount: 0,
      hasActiveRemoteAccess: true,
    })).toBe('awaiting_remote');
    expect(deriveCeremonyLifecycleState({
      contract: { status: 'generated' },
      signatureCount: 0,
    })).toBe('ready_to_sign');
  });
});
