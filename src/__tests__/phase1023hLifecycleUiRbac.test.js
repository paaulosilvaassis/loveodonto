/**
 * PHASE_10.23H — UI policy, RBAC discovery e operator safety.
 * Writers canônicos não são reimplementados. Sem PII/token em asserts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import {
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_REASON_REQUIRED,
  REISSUE_NOT_ALLOWED,
  ROTATE_NOT_ALLOWED,
  VOID_NOT_ALLOWED,
  contractLifecycleUiLabel,
  deriveCeremonyProgress,
  describePublicSigningAccessFailure,
  describeSigningAccessUi,
  getContractLifecycleUiPolicy,
  isAccessExpired,
  mapLifecycleUiError,
} from '../contracts/lifecycle/index.js';
import { PUBLIC_SIGNING_FAILURE_COPY } from '../contracts/lifecycle/publicSigningUi.js';
import { voidSignedContract, reissueContract } from '../services/contractVoidReissueCommandService.js';
import { rotateSigningAccess, resendSigningAccess } from '../services/contractSigningAccessCommandService.js';
import { ensureContractsModuleSeeded } from '../services/contractModuleService.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TENANT = 'tenant-h-23h';

const master = { id: 'user-h-master', role: 'admin', isMaster: true, tenant_id: TENANT, tenantId: TENANT };
const admin = { id: 'user-h-admin', role: 'admin', tenant_id: TENANT, tenantId: TENANT };
const gerente = { id: 'user-h-ger', role: 'gerente', tenant_id: TENANT, tenantId: TENANT };
const reception = { id: 'user-h-rec', role: 'recepcao', tenant_id: TENANT, tenantId: TENANT };
const professional = { id: 'user-h-pro', role: 'profissional', tenant_id: TENANT, tenantId: TENANT };
const publicActor = { id: null, role: 'patient' };

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

function contract(status, extra = {}) {
  return {
    id: extra.id || 'gctr-h-1',
    status,
    tenant_id: TENANT,
    clinicId: 'clinic-1',
    contractNumber: extra.contractNumber || 'CTR-H-1',
    ...extra,
  };
}

function access({ requestStatus = 'sent', linkStatus = 'pending', expiresAt = '2099-01-01T00:00:00.000Z' } = {}) {
  return {
    request: { id: 'csreq-h', contractId: 'gctr-h-1', status: requestStatus, expiresAt },
    link: { id: 'clnk-h', requestId: 'csreq-h', contractId: 'gctr-h-1', status: linkStatus, expiresAt, token: 'csgn-hidden' },
  };
}

function policyFor(status, actor, accessArgs) {
  const snap = accessArgs === undefined ? {} : access(accessArgs);
  return getContractLifecycleUiPolicy({
    contract: contract(status),
    actor,
    request: snap.request || null,
    link: snap.link || null,
    trustedNow: Date.parse('2026-08-31T12:00:00.000Z'),
  });
}

describe('PHASE_10.23H lifecycle UI / RBAC', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    ensureContractsModuleSeeded();
  });

  it('H01–H12 role matrix mirrors writers (hidden != security)', () => {
    const signedMaster = policyFor('signed', master);
    const signedAdmin = policyFor('signed', admin);
    const signedGerente = policyFor('signed', gerente);
    const signedReception = policyFor('signed', reception);
    const signedPro = policyFor('signed', professional);
    expect(signedMaster.canVoidSigned).toBe(true);
    expect(signedAdmin.canVoidSigned).toBe(true);
    expect(signedGerente.canVoidSigned).toBe(false);
    expect(signedReception.canVoidSigned).toBe(false);
    expect(signedPro.canVoidSigned).toBe(false);
    expect(signedMaster.canReissue).toBe(true);
    expect(signedAdmin.canReissue).toBe(true);
    expect(signedReception.canReissue).toBe(false);
    expect(signedPro.canReissue).toBe(false);

    const generatedReception = policyFor('generated', reception, { requestStatus: 'sent', linkStatus: 'pending' });
    expect(generatedReception.canResendAccess).toBe(true);
    expect(generatedReception.canRotateAccess).toBe(false);

    withDb((db) => {
      db.generatedContracts = [contract('signed', { tenant_id: TENANT })];
      db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
      return db;
    });
    expectCode(() => voidSignedContract({ user: reception, contractId: 'gctr-h-1', reason: 'nope' }), VOID_NOT_ALLOWED);
    expectCode(() => reissueContract({ user: professional, contractId: 'gctr-h-1', reason: 'nope' }), REISSUE_NOT_ALLOWED);
  });

  it('H13–H31 state/action matrix', () => {
    const draft = policyFor('draft', admin);
    expect(draft.canSignOnScreen).toBe(false);
    expect(draft.canResendAccess).toBe(false);
    expect(draft.canRotateAccess).toBe(false);
    expect(draft.canVoidSigned).toBe(false);
    expect(draft.canReissue).toBe(false);
    expect(draft.canGenerate).toBe(true);
    expect(draft.canCancelUnsigned).toBe(true);

    const generated = policyFor('generated', admin);
    expect(generated.canSendForSignature).toBe(true);
    expect(generated.canSignOnScreen).toBe(true);
    expect(generated.canCancelUnsigned).toBe(true);
    expect(generated.canVoidSigned).toBe(false);
    expect(generated.canReissue).toBe(false);

    const partial = policyFor('partially_signed', admin, { requestStatus: 'sent', linkStatus: 'pending' });
    expect(partial.canAbortPartial).toBe(true);
    expect(partial.canCancelUnsigned).toBe(false);
    expect(partial.canResendAccess).toBe(true);
    expect(partial.canRevokeAccess).toBe(true);

    const signed = policyFor('signed', admin, { requestStatus: 'completed', linkStatus: 'signed' });
    expect(signed.canCancelUnsigned).toBe(false);
    expect(signed.canAbortPartial).toBe(false);
    expect(signed.canResendAccess).toBe(false);
    expect(signed.canRotateAccess).toBe(false);
    expect(signed.canSignOnScreen).toBe(false);
    expect(signed.hideUnsafeNewVersion).toBe(true);
    expect(signed.canVoidSigned).toBe(true);
    expect(signed.canViewFinalArtifact).toBe(true);

    for (const status of ['cancelled', 'voided', 'superseded']) {
      const p = policyFor(status, admin, { requestStatus: 'sent', linkStatus: 'pending' });
      expect(p.canSignOnScreen).toBe(false);
      expect(p.canResendAccess).toBe(false);
      expect(p.canRotateAccess).toBe(false);
      expect(p.canSendForSignature).toBe(false);
    }
    expect(policyFor('cancelled', admin).canReissue).toBe(true);
    expect(policyFor('voided', admin).canReissue).toBe(true);
    expect(policyFor('superseded', admin).canReissue).toBe(false);
  });

  it('H32–H40 access UX: clock expiry, resend vs rotate, no raw token UI', () => {
    const expiredAt = '2020-01-01T00:00:00.000Z';
    const expired = describeSigningAccessUi({
      request: { status: 'sent', expiresAt: expiredAt },
      link: { status: 'pending', expiresAt: expiredAt },
      trustedNow: Date.parse('2026-08-31T12:00:00.000Z'),
    });
    expect(expired.kind).toBe('expired');
    expect(expired.label).toBe('Expirado');
    expect(isAccessExpired(expiredAt, Date.parse('2026-08-31T12:00:00.000Z'))).toBe(true);

    const expiredPolicy = policyFor('generated', admin, {
      requestStatus: 'sent',
      linkStatus: 'pending',
      expiresAt: expiredAt,
    });
    expect(expiredPolicy.canResendAccess).toBe(false);
    expect(expiredPolicy.canRotateAccess).toBe(true);

    const revokedPolicy = policyFor('generated', admin, { requestStatus: 'revoked', linkStatus: 'revoked' });
    expect(revokedPolicy.canResendAccess).toBe(false);
    expect(revokedPolicy.canRotateAccess).toBe(false);
    expect(revokedPolicy.canSendForSignature).toBe(false);
    expect(revokedPolicy.canReplaceRevokedAccess).toBe(true);
    expect(policyFor('generated', reception, { requestStatus: 'revoked', linkStatus: 'revoked' }).canReplaceRevokedAccess).toBe(false);

    const uiFiles = [
      'src/pages/contratos/ContractsAssinadosPage.jsx',
      'src/pages/contratos/ContractsPendentesPage.jsx',
      'src/components/clinical/ClinicalSignatureSection.jsx',
      'src/components/contracts/ContractDetailModal.jsx',
      'src/pages/contratos/ContractSignPublicPage.jsx',
    ].map(readSrc).join('\n');
    expect(uiFiles).not.toContain('Link gerado');
    expect(uiFiles).not.toContain('{link.token}');
    expect(readSrc('src/pages/contratos/ContractsPendentesPage.jsx')).not.toContain('Link gerado');
    expect(readSrc('src/pages/contratos/ContractsPendentesPage.jsx')).toContain('resendSigningAccess');
    expect(readSrc('src/pages/contratos/ContractsPendentesPage.jsx')).toContain('rotateSigningAccess');
    expect(readSrc('src/components/clinical/contract/SigningAccessSecureModal.jsx'))
      .toContain('O mesmo acesso válido será reenviado. O prazo de validade não será alterado.');
    expect(readSrc('src/components/clinical/contract/SigningAccessSecureModal.jsx'))
      .toContain('O link atual deixará de funcionar e um novo link será criado. O prazo do request original não será ampliado.');
  });

  it('H41–H47 lineage and high-impact copy', () => {
    const reissue = readSrc('src/components/clinical/contract/ReissueContractSecureModal.jsx');
    expect(reissue).toContain('Novas assinaturas serão necessárias');
    expect(reissue).toContain('O PDF antigo permanece histórico');
    expect(reissue).toContain('O financeiro não muda automaticamente');
    expect(reissue).toContain('REEMITIR CONTRATO');
    expect(reissue).toContain('INVALIDAR CONTRATO');
    expect(reissue).toContain('Invalidar contrato assinado');
    const signedPage = readSrc('src/pages/contratos/ContractsAssinadosPage.jsx');
    expect(signedPage).toContain('Substituído pelo contrato');
    expect(signedPage).toContain('Reemissão do contrato');
    expect(signedPage).toContain('reissueContract');
    expect(signedPage).toContain('Novo contrato criado');
    expect(signedPage).not.toContain('Nova versão');
    expect(signedPage).not.toContain('createContractNewVersion');
  });

  it('H48–H53 public failure states have no stroke UI', () => {
    withDb((db) => {
      db.generatedContracts = [
        contract('generated', { id: 'gctr-h-pub' }),
        contract('cancelled', { id: 'gctr-h-can' }),
        contract('voided', { id: 'gctr-h-void' }),
        contract('superseded', { id: 'gctr-h-sup' }),
        contract('signed', { id: 'gctr-h-sig' }),
      ];
      db.contractSignLinks = [
        { token: 'tok-exp', contractId: 'gctr-h-pub', status: 'pending', expiresAt: '2020-01-01T00:00:00.000Z' },
        { token: 'tok-rev', contractId: 'gctr-h-pub', status: 'revoked', expiresAt: '2099-01-01T00:00:00.000Z' },
        { token: 'tok-can', contractId: 'gctr-h-can', status: 'pending', expiresAt: '2099-01-01T00:00:00.000Z' },
        { token: 'tok-void', contractId: 'gctr-h-void', status: 'pending', expiresAt: '2099-01-01T00:00:00.000Z' },
        { token: 'tok-sup', contractId: 'gctr-h-sup', status: 'pending', expiresAt: '2099-01-01T00:00:00.000Z' },
        { token: 'tok-done', contractId: 'gctr-h-sig', status: 'signed', expiresAt: '2099-01-01T00:00:00.000Z' },
      ];
      return db;
    });
    expect(describePublicSigningAccessFailure('tok-exp').kind).toBe('expired');
    expect(describePublicSigningAccessFailure('tok-rev').kind).toBe('revoked');
    expect(describePublicSigningAccessFailure('tok-can').kind).toBe('unavailable');
    expect(describePublicSigningAccessFailure('tok-void').kind).toBe('unavailable');
    expect(describePublicSigningAccessFailure('tok-sup').kind).toBe('unavailable');
    expect(describePublicSigningAccessFailure('tok-done').kind).toBe('replay');
    const pub = readSrc('src/pages/contratos/ContractSignPublicPage.jsx');
    const copySrc = readSrc('src/contracts/lifecycle/publicSigningUi.js');
    expect(copySrc).toContain(PUBLIC_SIGNING_FAILURE_COPY.expired.body);
    expect(copySrc).toContain(PUBLIC_SIGNING_FAILURE_COPY.revoked.body);
    expect(copySrc).toContain(PUBLIC_SIGNING_FAILURE_COPY.unavailable.body);
    expect(pub).toContain('PUBLIC_SIGNING_FAILURE_COPY.expired');
    expect(pub).toContain('PUBLIC_SIGNING_FAILURE_COPY.revoked');
    expect(pub).toContain('PUBLIC_SIGNING_FAILURE_COPY.unavailable');
    expect(pub).toContain('public-sign-expired');
    expect(pub).toContain('public-sign-revoked');
    expect(pub).toContain('public-sign-unavailable');
    expect(pub).toContain('public-sign-replay');
    const strokeIdx = pub.indexOf('<SignatureCanvas');
    const expiredIdx = pub.indexOf('public-sign-expired');
    expect(expiredIdx).toBeGreaterThan(-1);
    expect(strokeIdx).toBeGreaterThan(expiredIdx);
  });

  it('H54–H60 errors, abort copy, double-submit guards', () => {
    expect(mapLifecycleUiError({ code: LIFECYCLE_REASON_REQUIRED })).toMatch(/motivo jurídico/i);
    expect(mapLifecycleUiError({ code: VOID_NOT_ALLOWED })).toMatch(/admin ou master/i);
    expect(mapLifecycleUiError({ code: CONTRACT_NOT_SIGNABLE })).toMatch(/não está disponível para assinatura/i);
    expect(mapLifecycleUiError({ message: 'boom tenant_id=abc gctr-secret' })).not.toMatch(/gctr-|tenant_id/);
    const abort = readSrc('src/components/clinical/contract/CancelContractSecureModal.jsx');
    expect(abort).toContain('As assinaturas já realizadas permanecerão registradas como evidência.');
    expect(abort).toContain('O contrato será cancelado e os acessos pendentes serão revogados.');
    const surfaces = [
      'src/pages/contratos/ContractsAssinadosPage.jsx',
      'src/pages/contratos/ContractsPendentesPage.jsx',
      'src/components/clinical/contract/ReissueContractSecureModal.jsx',
      'src/components/clinical/contract/CancelContractSecureModal.jsx',
      'src/components/clinical/contract/SigningAccessSecureModal.jsx',
      'src/components/clinical/ClinicalSignatureSection.jsx',
    ].map(readSrc).join('\n');
    expect(surfaces).toContain('disabled={busy}');
    expect(surfaces).toContain('if (!legalModal.contractId || !user || busy) return');
    expect(surfaces).toContain('if (busyId) return');
  });

  it('canonical labels, dynamic ceremony progress, policy authority', () => {
    expect(contractLifecycleUiLabel('draft')).toBe('Rascunho');
    expect(contractLifecycleUiLabel('generated')).toBe('Gerado');
    expect(contractLifecycleUiLabel('partially_signed')).toBe('Assinatura parcial');
    expect(contractLifecycleUiLabel('signed')).toBe('Assinado');
    expect(contractLifecycleUiLabel('completed')).toBe('Assinado');
    expect(contractLifecycleUiLabel('vigente')).toBe('Assinado');
    expect(contractLifecycleUiLabel('cancelled')).toBe('Cancelado');
    expect(contractLifecycleUiLabel('canceled')).toBe('Cancelado');
    expect(contractLifecycleUiLabel('voided')).toBe('Invalidado');
    expect(contractLifecycleUiLabel('superseded')).toBe('Substituído');
    expect(contractLifecycleUiLabel('replaced')).toBe('Substituído');
    expect(contractLifecycleUiLabel('expired')).not.toBe('Expirado');
    const three = deriveCeremonyProgress({
      ceremony: {
        requiredSigners: [
          { role: 'PROFESSIONAL', required: true, status: 'signed', satisfied: true },
          { role: 'PATIENT', required: true, status: 'pending' },
          { role: 'CLINIC_REPRESENTATIVE', required: true, status: 'pending' },
        ],
      },
    });
    expect(three.requiredCount).toBe(3);
    expect(three.completedCount).toBe(1);
    expect(three.remainingCount).toBe(2);
    expect(three.label).toBe('1 de 3 assinaturas concluídas');
    expect(readSrc('src/pages/contratos/ContractsAssinadosPage.jsx')).toContain('getContractLifecycleUiPolicy');
    expect(readSrc('src/pages/contratos/ContractsPendentesPage.jsx')).toContain('getContractLifecycleUiPolicy');
    expect(readSrc('src/components/clinical/ClinicalSignatureSection.jsx')).toContain('getContractLifecycleUiPolicy');
    expect(policyFor('generated', publicActor).canVoidSigned).toBe(false);
    expect(policyFor('generated', publicActor).canReissue).toBe(false);
  });

  it('static audit: no unsafe legacy UI, no DB mutation from UI', async () => {
    const ui = [
      'src/pages/contratos/ContractsAssinadosPage.jsx',
      'src/pages/contratos/ContractsPendentesPage.jsx',
      'src/components/clinical/ClinicalSignatureSection.jsx',
      'src/components/clinical/ClinicalContractSection.jsx',
      'src/components/clinical/PatientRemoteInviteActions.jsx',
    ].map(readSrc).join('\n');
    expect(ui).not.toMatch(/withDb\s*\(/);
    expect(ui).not.toContain('createContractNewVersion');
    expect(readSrc('src/pages/contratos/ContractsAssinadosPage.jsx')).not.toMatch(/useEffect\s*\(/);
    expect(readSrc('src/pages/contratos/ContractsPendentesPage.jsx')).not.toContain('sendContractForSignature(user, r.id);\n                          setRefresh');
    withDb((db) => {
      db.generatedContracts = [contract('generated')];
      db.contractSignatureRequests = [{ ...access().request, tenant_id: TENANT, signerRole: 'PATIENT' }];
      db.contractSignLinks = [{ ...access().link, token: 'hidden', tenant_id: TENANT }];
      db.clinicProfile = { id: 'clinic-1', tenant_id: TENANT };
      return db;
    });
    expectCode(
      () => rotateSigningAccess({ user: reception, contractId: 'gctr-h-1', requestId: 'csreq-h', reason: 'x' }),
      ROTATE_NOT_ALLOWED,
    );
    const resent = await resendSigningAccess({
      user: reception,
      contractId: 'gctr-h-1',
      requestId: 'csreq-h',
      deliverEmail: false,
    });
    expect(resent.ok).toBe(true);
  });
});
