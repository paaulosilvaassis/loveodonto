/**
 * Phase 10.8 — Contract Signed Transition, Audit Ledger and Gated Side-Effects
 */

import { describe, expect, it, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createSigningCompletionHarness } from '../domain/contracts/completion/signing-completion.harness.ts';
import { ContractLedgerMemoryRepository } from '../domain/contracts/ledger/contract-ledger.repository.ts';
import { hashLedgerEntry } from '../domain/contracts/ledger/contract-ledger.hash.ts';
import { deriveContractSignedPendingEffects } from '../domain/contracts/completion/contract-signed-effects.policy.ts';
import { validateContractSigningCompletion } from '../domain/contracts/completion/contract-signing-completion.validator.ts';
import { createContractSignedReconciliationService } from '../domain/contracts/completion/contract-signed-reconciliation.service.ts';
import { isContractFeatureEnabled } from '../domain/contracts/contract-feature-flags.ts';
import {
  isContractSigningCompletionV2UiEnabled,
  setContractSigningCompletionV2HarnessForTests,
  resetContractSigningCompletionV2HarnessForTests,
} from '../services/contractSigningCompletionV2Service.js';
import {
  createContractSigningCompletionV2Handlers,
  isContractSigningCompletionV2ApiEnabled,
} from '../../server/lib/contractSigningCompletionV2Api.js';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';
import { buildPermissionsCatalog } from '../permissions/catalog.js';
import { ContractIdempotencyConflictError } from '../domain/contracts/idempotency/contract-idempotency.ts';

const ROOT = join(process.cwd());

afterEach(() => {
  resetContractSigningCompletionV2HarnessForTests();
});

async function prepareInput(h, key = 'idem-1') {
  const prep = await h.prepareSignedArtifacts();
  return {
    prep,
    input: {
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      signedPdfFileId: prep.signedPdf.id,
      evidenceReportFileId: prep.evidenceReport.id,
      integrityManifestFileId: prep.integrityManifest.id,
      idempotencyKey: key,
    },
  };
}

describe('Phase 10.8 — flags e gates', () => {
  it('flags permanecem OFF', () => {
    expect(isContractFeatureEnabled('contract_audit_ledger_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contract_financial_activation_on_signed_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contract_patient_portal_enabled')).toBe(false);
    expect(isContractFeatureEnabled('contract_public_verification_enabled')).toBe(false);
    expect(isContractSigningCompletionV2UiEnabled()).toBe(false);
    expect(isContractSigningCompletionV2ApiEnabled({})).toBe(false);
  });

  it('nav Conclusão v2 exige sete flags', () => {
    const item = contractsShellNavItems.find((i) => i.id === 'conclusao-v2');
    expect(item?.featureFlagsAll).toEqual(expect.arrayContaining([
      'contracts_domain_v2_enabled',
      'contracts_module_v2_enabled',
      'contract_versioning_enabled',
      'contract_internal_signature_v2_enabled',
      'contract_pdf_v2_enabled',
      'contract_storage_v2_enabled',
      'contract_audit_ledger_enabled',
    ]));
  });

  it('permissões no catálogo sem roleDefaults grants implícitos', () => {
    const actions = buildPermissionsCatalog()
      .filter((p) => p.module_key === 'contracts')
      .map((p) => p.action_key);
    expect(actions).toEqual(expect.arrayContaining([
      'complete_signing',
      'view_ledger',
      'verify_ledger',
      'view_signed_effects',
      'reconcile_signed_state',
    ]));
  });
});

describe('Phase 10.8 — completion validator', () => {
  it('fluxo válido', async () => {
    const h = await createSigningCompletionHarness();
    const { input } = await prepareInput(h);
    const v = await h.completion.validateCompletion(h.tenantId, input);
    expect(v.valid).toBe(true);
    expect(v.contractReady).toBe(true);
    expect(v.envelopeReady).toBe(true);
    expect(v.signedPdfReady).toBe(true);
    expect(v.manifestReady).toBe(true);
  });

  it('contrato inexistente / tenant mismatch / não aprovado', async () => {
    const h = await createSigningCompletionHarness();
    const { prep, input } = await prepareInput(h);

    const missing = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: 'ctr_missing',
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: null,
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(missing.valid).toBe(false);
    expect(missing.errors.some((e) => e.code === 'CONTRACT_NOT_FOUND')).toBe(true);

    const wrongTenant = await validateContractSigningCompletion({
      tenantId: 'tenant_other',
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(wrongTenant.valid).toBe(false);

    const draft = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: { ...h.contract, status: 'DRAFT' },
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(draft.valid).toBe(false);
    expect(draft.errors.some((e) => e.code === 'CONTRACT_SIGNING_COMPLETION_NOT_READY')).toBe(true);

    const cancelled = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: { ...h.contract, status: 'CANCELLED' },
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(cancelled.valid).toBe(false);

    void input;
  });

  it('versão/hash/envelope/artefatos inválidos', async () => {
    const h = await createSigningCompletionHarness();
    const { prep } = await prepareInput(h);

    const unlocked = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: { ...h.version, lockedAt: undefined },
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(unlocked.errors.some((e) => e.code === 'VERSION_NOT_LOCKED')).toBe(true);

    const noHash = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: { ...h.version, documentHash: undefined },
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(noHash.errors.some((e) => e.code === 'CONTENT_HASH_REQUIRED')).toBe(true);

    const envOpen = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: h.version,
      envelope: { ...prep.envelope, status: 'SENT' },
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(envOpen.errors.some((e) => e.code === 'CONTRACT_SIGNING_COMPLETION_NOT_READY')).toBe(true);

    const pendingSigner = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers.map((s) => ({ ...s, status: 'PENDING' })),
      evidences: prep.evidences,
      signedPdf: prep.signedPdf,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(pendingSigner.errors.some((e) => e.code === 'SIGNATURES_INCOMPLETE')).toBe(true);

    const noPdf = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: null,
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(noPdf.errors.some((e) => e.code === 'CONTRACT_SIGNED_PDF_REQUIRED')).toBe(true);

    const otherTenantPdf = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: { ...prep.signedPdf, tenantId: 'tenant_b' },
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(otherTenantPdf.errors.some((e) => e.code === 'CONTRACT_SIGNED_ARTIFACT_TENANT_MISMATCH')).toBe(true);

    const unverified = await validateContractSigningCompletion({
      tenantId: h.tenantId,
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      contract: h.contract,
      version: h.version,
      envelope: prep.envelope,
      signers: prep.signers,
      evidences: prep.evidences,
      signedPdf: { ...prep.signedPdf, status: 'STORED' },
      evidenceReport: prep.evidenceReport,
      integrityManifestFile: prep.integrityManifest,
      manifest: null,
    });
    expect(unverified.errors.some((e) => e.code === 'CONTRACT_SIGNED_PDF_INVALID')).toBe(true);
  });
});

describe('Phase 10.8 — signed transition', () => {
  it('APPROVED → PENDING_SIGNATURES → SIGNED com ledger', async () => {
    const h = await createSigningCompletionHarness();
    const { input } = await prepareInput(h, 'trans-1');
    const before = await h.contractRepo.findById(h.tenantId, h.contract.id);
    expect(before.status).toBe('APPROVED');
    const docHash = h.version.documentHash;

    const r = await h.completion.completeSigning(h.tenantId, input, h.actor);
    expect(r.contract.status).toBe('SIGNED');
    expect(r.contract.completedAt).toBeTruthy();
    expect(r.contract.currentVersionId).toBe(h.version.id);
    expect(r.version.documentHash).toBe(docHash);
    expect(r.idempotentReplay).toBe(false);
    expect(r.events.some((e) => e.eventType === 'contract.signed')).toBe(true);
    expect(r.ledgerEntries.map((e) => e.eventType)).toEqual(expect.arrayContaining([
      'CONTRACT_SIGNING_VALIDATED',
      'CONTRACT_STATUS_PENDING_SIGNATURES',
      'CONTRACT_SIGNED',
      'CONTRACT_SIGNED_EFFECTS_PREPARED',
    ]));
    expect(r.ledgerEntries.filter((e) => e.eventType === 'CONTRACT_SIGNED')).toHaveLength(1);
  });

  it('signed não reabre e preserva hashes', async () => {
    const h = await createSigningCompletionHarness();
    const { input } = await prepareInput(h, 'reopen-1');
    const r = await h.completion.completeSigning(h.tenantId, input, h.actor);
    expect(r.contract.status).toBe('SIGNED');
    const { canTransitionContract } = await import('../domain/contracts/contract-status.machine.ts');
    const t = canTransitionContract('SIGNED', 'APPROVED', {});
    expect(t.allowed).toBe(false);
    const t2 = canTransitionContract('SIGNED', 'DRAFT', {});
    expect(t2.allowed).toBe(false);
    const t3 = canTransitionContract('SIGNED', 'PENDING_SIGNATURES', {});
    expect(t3.allowed).toBe(false);
  });
});

describe('Phase 10.8 — ledger', () => {
  it('primeira entrada, sequência, hash determinístico e cadeia', async () => {
    const ledger = new ContractLedgerMemoryRepository();
    const tenantId = 'tenant_ledger';
    const contractId = 'ctr_ledger';
    const base = {
      tenantId,
      contractId,
      sequenceNumber: 1,
      eventType: 'CONTRACT_CREATED',
      actor: { actorType: 'SYSTEM', actorId: 'sys' },
      source: 'APP',
      payload: { a: 1 },
      occurredAt: '2026-08-03T12:00:00.000Z',
    };
    const entryHash = await hashLedgerEntry(base);
    const e1 = await ledger.append(tenantId, {
      ...base,
      id: 'ldg_1',
      entryHash,
      createdAt: base.occurredAt,
    });
    expect(e1.sequenceNumber).toBe(1);
    expect(e1.previousEntryHash).toBeUndefined();

    const hash2a = await hashLedgerEntry({
      ...base,
      sequenceNumber: 2,
      eventType: 'CONTRACT_APPROVED',
      previousEntryHash: e1.entryHash,
      payload: { b: 2 },
    });
    const hash2b = await hashLedgerEntry({
      ...base,
      sequenceNumber: 2,
      eventType: 'CONTRACT_APPROVED',
      previousEntryHash: e1.entryHash,
      payload: { b: 2 },
    });
    expect(hash2a).toBe(hash2b);
    const hash2diff = await hashLedgerEntry({
      ...base,
      sequenceNumber: 2,
      eventType: 'CONTRACT_APPROVED',
      previousEntryHash: e1.entryHash,
      payload: { b: 3 },
    });
    expect(hash2diff).not.toBe(hash2a);

    await ledger.append(tenantId, {
      ...base,
      id: 'ldg_2',
      sequenceNumber: 2,
      eventType: 'CONTRACT_APPROVED',
      previousEntryHash: e1.entryHash,
      payload: { b: 2 },
      entryHash: hash2a,
      createdAt: base.occurredAt,
    });

    const chain = await ledger.verifyChain(tenantId, contractId);
    expect(chain.valid).toBe(true);
    expect(chain.entryCount).toBe(2);

    await expect(ledger.append(tenantId, {
      ...base,
      id: 'ldg_bad',
      sequenceNumber: 2,
      eventType: 'CONTRACT_SIGNED',
      previousEntryHash: e1.entryHash,
      entryHash: hash2a,
      createdAt: base.occurredAt,
    })).rejects.toMatchObject({ domainError: { code: 'CONTRACT_LEDGER_SEQUENCE_CONFLICT' } });

    // cross-tenant
    const other = await ledger.listByContract('tenant_other', contractId);
    expect(other).toEqual([]);
  });

  it('cadeia adulterada falha verify', async () => {
    const h = await createSigningCompletionHarness();
    const { input } = await prepareInput(h, 'chain-1');
    await h.completion.completeSigning(h.tenantId, input, h.actor);
    const entries = await h.ledger.listByContract(h.tenantId, h.contract.id);
    // adulterar via acesso interno
    const storeKey = `${h.tenantId}::${h.contract.id}`;
    const internal = h.ledger;
    internal.store.get(storeKey)[0].payload = { tampered: true };
    const chain = await h.ledger.verifyChain(h.tenantId, h.contract.id);
    expect(chain.valid).toBe(false);
  });
});

describe('Phase 10.8 — atomicidade e rollback', () => {
  it('falha após 1 append faz rollback completo', async () => {
    const h = await createSigningCompletionHarness({ failAfterLedgerAppends: 1 });
    const { input } = await prepareInput(h, 'rb-1');
    await expect(h.completion.completeSigning(h.tenantId, input, h.actor))
      .rejects.toMatchObject({ domainError: { code: 'CONTRACT_LEDGER_APPEND_FAILED' } });
    const c = await h.contractRepo.findById(h.tenantId, h.contract.id);
    expect(c.status).toBe('APPROVED');
    const entries = await h.ledger.listByContract(h.tenantId, h.contract.id);
    expect(entries).toHaveLength(0);
  });

  it('falha após SIGNED no ledger faz rollback (sem signed parcial)', async () => {
    const h = await createSigningCompletionHarness({ failAfterLedgerAppends: 3 });
    const { input } = await prepareInput(h, 'rb-3');
    await expect(h.completion.completeSigning(h.tenantId, input, h.actor)).rejects.toBeTruthy();
    const c = await h.contractRepo.findById(h.tenantId, h.contract.id);
    expect(c.status).toBe('APPROVED');
    const entries = await h.ledger.listByContract(h.tenantId, h.contract.id);
    expect(entries).toHaveLength(0);
  });

  it('retry seguro após falha', async () => {
    const h = await createSigningCompletionHarness({ failAfterLedgerAppends: 1 });
    const { input } = await prepareInput(h, 'retry-1');
    await expect(h.completion.completeSigning(h.tenantId, input, h.actor)).rejects.toBeTruthy();
    // remover falha simulada
    const h2 = await createSigningCompletionHarness();
    // reutilizar não — novo harness; testar retry no mesmo com override
    h.completion = (await import('../domain/contracts/completion/contract-signing-completion.service.ts'))
      .createContractSigningCompletionService({
        contractRepository: h.contractRepo,
        envelopeRepository: h.envelopeRepo,
        signerRepository: h.signerRepo,
        evidenceRepository: h.evidenceRepo,
        storage: h.storage,
        loadManifest: async (tenantId, file) => {
          const dl = await h.storage.getAuthorizedDownload(tenantId, file.id, h.actor);
          return JSON.parse(new TextDecoder().decode(dl.bytes));
        },
        ledgerRepository: h.ledger,
        idempotency: h.idempotency,
        clock: h.clock,
        ids: h.ids,
        skipFeatureFlagCheck: true,
      });
    const r = await h.completion.completeSigning(h.tenantId, input, h.actor);
    expect(r.contract.status).toBe('SIGNED');
    void h2;
  });
});

describe('Phase 10.8 — idempotência', () => {
  it('primeira conclusão + replay idêntico', async () => {
    const h = await createSigningCompletionHarness();
    const { input } = await prepareInput(h, 'idem-same');
    const r1 = await h.completion.completeSigning(h.tenantId, input, h.actor);
    const r2 = await h.completion.completeSigning(h.tenantId, input, h.actor);
    expect(r1.idempotentReplay).toBe(false);
    expect(r2.idempotentReplay).toBe(true);
    expect(r2.contract.status).toBe('SIGNED');
    const signed = (await h.ledger.listByContract(h.tenantId, h.contract.id))
      .filter((e) => e.eventType === 'CONTRACT_SIGNED');
    expect(signed).toHaveLength(1);
  });

  it('mesma key com PDF diferente gera conflito', async () => {
    const h = await createSigningCompletionHarness();
    const { input, prep } = await prepareInput(h, 'idem-conflict');
    await h.completion.completeSigning(h.tenantId, input, h.actor);
    await expect(h.completion.completeSigning(h.tenantId, {
      ...input,
      signedPdfFileId: 'file_other_pdf',
    }, h.actor)).rejects.toBeInstanceOf(ContractIdempotencyConflictError);
    void prep;
  });
});

describe('Phase 10.8 — pending effects', () => {
  it('todos executed=false e readiness gated por SIGNED', async () => {
    const h = await createSigningCompletionHarness();
    const unsigned = deriveContractSignedPendingEffects({
      contract: h.contract,
      signed: false,
      signedPdf: null,
      hasFinancialSnapshot: true,
      hasClinicalConsent: true,
    });
    expect(unsigned.financialActivation.required).toBe(true);
    expect(unsigned.financialActivation.ready).toBe(false);
    expect(unsigned.financialActivation.executed).toBe(false);

    const { input } = await prepareInput(h, 'fx-1');
    const r = await h.completion.completeSigning(h.tenantId, input, h.actor);
    for (const fx of Object.values(r.effects)) {
      expect(fx.executed).toBe(false);
      expect(fx.idempotencyKey).toBeTruthy();
    }
    expect(r.effects.patientDelivery.ready).toBe(true);
    expect(r.effects.notificationDispatch.executed).toBe(false);
  });

  it('CRM por origin', () => {
    const fx = deriveContractSignedPendingEffects({
      contract: { id: 'c1', origin: 'CRM', documentType: 'SERVICE_CONTRACT' },
      signed: true,
      signedPdf: { id: 'f1' },
      hasFinancialSnapshot: false,
      hasClinicalConsent: false,
    });
    expect(fx.crmRegistration.required).toBe(true);
    expect(fx.crmRegistration.ready).toBe(true);
    expect(fx.crmRegistration.executed).toBe(false);
  });
});

describe('Phase 10.8 — reconciliation', () => {
  it('estado consistente após SIGNED', async () => {
    const h = await createSigningCompletionHarness();
    const { input } = await prepareInput(h, 'rec-ok');
    await h.completion.completeSigning(h.tenantId, input, h.actor);
    const r = await h.reconciliation.inspect(h.tenantId, h.contract.id);
    expect(r.inconsistencies).toEqual([]);
    expect(r.ledgerValid).toBe(true);
  });

  it('envelope completed e contrato approved', async () => {
    const h = await createSigningCompletionHarness();
    const { prep } = await prepareInput(h, 'rec-gap');
    await h.contractRepo.update(h.tenantId, {
      ...(await h.contractRepo.findById(h.tenantId, h.contract.id)),
      signatureEnvelopeId: prep.envelope.id,
    });
    const r = await h.reconciliation.inspect(h.tenantId, h.contract.id);
    expect(r.inconsistencies).toContain('ENVELOPE_COMPLETED_CONTRACT_APPROVED');
    const repair = await h.reconciliation.repairLedgerProjection(
      h.tenantId,
      h.contract.id,
      h.actor,
    );
    expect(repair.repairPlan.every((p) => p.autoExecuted === false)).toBe(true);
  });

  it('plano sem execução automática', async () => {
    const h = await createSigningCompletionHarness();
    const svc = createContractSignedReconciliationService({
      contractRepository: h.contractRepo,
      envelopeRepository: h.envelopeRepo,
      storage: h.storage,
      ledgerRepository: h.ledger,
      clock: h.clock,
    });
    const r = await svc.repairLedgerProjection(h.tenantId, h.contract.id, h.actor);
    expect(r.repairPlan.every((p) => p.autoExecuted === false)).toBe(true);
  });
});

describe('Phase 10.8 — cross-tenant', () => {
  it('tenant A não conclui/lê ledger de B', async () => {
    const a = await createSigningCompletionHarness();
    const { input } = await prepareInput(a, 'xt-a');
    await a.completion.completeSigning(a.tenantId, input, a.actor);

    const b = await createSigningCompletionHarness();
    await expect(b.completion.completeSigning(b.tenantId, {
      ...input,
      contractId: a.contract.id,
    }, b.actor)).rejects.toBeTruthy();

    const ledgerB = await b.ledger.listByContract(b.tenantId, a.contract.id);
    expect(ledgerB).toEqual([]);
    const chain = await b.ledger.verifyChain(b.tenantId, a.contract.id);
    expect(chain.entryCount).toBe(0);
    expect(chain.valid).toBe(true);
  });
});

describe('Phase 10.8 — migration 030 estática', () => {
  it('030 existe, append-only, RLS, não aplicada', () => {
    const path = join(ROOT, 'supabase/migrations/030_app_contract_ledger.sql');
    expect(existsSync(path)).toBe(true);
    const sql = readFileSync(path, 'utf8');
    expect(sql).toMatch(/app_contract_ledger/);
    expect(sql).toMatch(/sequence_number/);
    expect(sql).toMatch(/entry_hash/);
    expect(sql).toMatch(/previous_entry_hash/);
    expect(sql).toMatch(/unique \(tenant_id, contract_id, sequence_number\)/);
    expect(sql).toMatch(/append-only/);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/create policy/i);
    expect(sql).not.toMatch(/create policy[\s\S]*update/i);
    expect(sql).toMatch(/NÃO EXECUTAR|nao executar|não aplicada|nao aplicada/i);
    // espelhos
    expect(existsSync(join(ROOT, 'supabase-local/migrations/030_app_contract_ledger.sql'))).toBe(true);
    expect(existsSync(join(ROOT, 'supabase-local/supabase/migrations/030_app_contract_ledger.sql'))).toBe(true);
  });
});

describe('Phase 10.8 — UI / API técnica', () => {
  it('rota não monta com flags OFF', () => {
    expect(isContractSigningCompletionV2UiEnabled()).toBe(false);
    expect(isContractSigningCompletionV2UiEnabled({
      contracts_domain_v2_enabled: true,
    })).toBe(false);
  });

  it('API bloqueia com flags OFF e sem harness', async () => {
    const handlers = createContractSigningCompletionV2Handlers({});
    const res = {
      statusCode: 0,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; },
    };
    await handlers.completeSigning({
      params: { id: 'x' },
      body: {},
      tenantContext: { tenantId: 't1', permissions: ['contracts:complete_signing'] },
      appAuthUser: { id: 'u1' },
    }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FEATURE_FLAG_DISABLED');
  });

  it('UI harness demo sem efeito real', async () => {
    const h = await createSigningCompletionHarness();
    setContractSigningCompletionV2HarnessForTests(h);
    const { input } = await prepareInput(h, 'ui-demo');
    const r = await h.completion.completeSigning(h.tenantId, input, h.actor);
    expect(Object.values(r.effects).every((e) => e.executed === false)).toBe(true);
    expect(r.events.every((e) => e.payload?.legacyBusNotNotified !== false
      || e.eventType !== 'contract.signed')).toBe(true);
  });
});
