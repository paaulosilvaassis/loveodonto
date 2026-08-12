/**
 * Phase 10.14 — Staging feature-flag pilot (unit + in-memory functional smoke).
 * Produção bloqueada; defaults globais permanecem false.
 */

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CONTRACT_FEATURE_FLAGS,
  CONTRACT_FEATURE_FLAG_DEFAULTS,
  isContractFeatureEnabled,
  getContractFeatureFlags,
  assertAllContractFeatureFlagsDisabled,
  buildContractFeatureFlagContext,
} from '../domain/contracts/contract-feature-flags.ts';
import {
  STAGING_CONTRACTS_PILOT_TENANT_CODE,
  STAGING_CONTRACTS_PILOT_TENANT_ID,
  STAGING_REF,
  PRODUCTION_REF,
  CONTRACTS_V2_PILOT_FLAG_ALIASES,
  STAGING_PILOT_ENABLED_CANONICAL_FLAGS,
  buildStagingPilotTenantFlags,
  getStagingPilotFlagOverrides,
  isContractsV2StagingPilotEnvironment,
  isStagingContractsPilotTenantId,
} from '../domain/contracts/staging/contracts-v2-staging-pilot.ts';
import { isContractTemplatesV2UiEnabled } from '../services/contractTemplatesV2Service.js';
import { isContractsV2UiEnabled } from '../services/contractsV2Service.js';
import { isSignaturesV2UiEnabled } from '../services/signaturesV2Service.js';
import { isContractDocumentsV2UiEnabled } from '../services/contractDocumentsV2Service.js';
import { createSigningCompletionHarness } from '../domain/contracts/completion/signing-completion.harness.ts';
import { createDocumentsV2Harness } from '../domain/contracts/artifacts/documents-v2.harness.ts';
import { contractsShellNavItems } from '../contracts/contractsShellConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const OTHER_TENANT = 'b2222222-2222-4222-8222-222222222299';

describe('Phase 10.14 — pilot constants & aliases', () => {
  it('tenant técnico e aliases contracts.v2.*', () => {
    expect(STAGING_CONTRACTS_PILOT_TENANT_CODE).toBe('STAGING_CONTRACTS_PILOT');
    expect(isStagingContractsPilotTenantId(STAGING_CONTRACTS_PILOT_TENANT_ID)).toBe(true);
    expect(Object.keys(CONTRACTS_V2_PILOT_FLAG_ALIASES)).toEqual([
      'contracts.v2.templates',
      'contracts.v2.instances',
      'contracts.v2.signatures',
      'contracts.v2.pdf',
      'contracts.v2.storage',
    ]);
    expect(STAGING_REF).toBe('tckdjyunwmdpqmewrwvt');
    expect(PRODUCTION_REF).toBe('uoepkwhqztmsjnzirpev');
  });

  it('defaults globais 15/15 false e asserts disabled', () => {
    expect(CONTRACT_FEATURE_FLAGS).toHaveLength(15);
    expect(Object.values(CONTRACT_FEATURE_FLAG_DEFAULTS).every((v) => v === false)).toBe(true);
    expect(assertAllContractFeatureFlagsDisabled()).toBe(true);
  });
});

describe('Phase 10.14 — tenant isolation of flags', () => {
  it('piloto liga flags só para tenant técnico em staging', () => {
    const pilotCtx = buildContractFeatureFlagContext({
      tenantId: STAGING_CONTRACTS_PILOT_TENANT_ID,
      tenantFlags: buildStagingPilotTenantFlags(),
      projectRef: STAGING_REF,
      forceAllowPilotInTest: true,
    });
    expect(isContractFeatureEnabled('contract_templates_v2_enabled', pilotCtx)).toBe(true);
    expect(isContractFeatureEnabled('contracts_domain_v2_enabled', pilotCtx)).toBe(true);
    expect(isContractFeatureEnabled('contract_storage_v2_enabled', pilotCtx)).toBe(true);
    expect(isContractTemplatesV2UiEnabled(pilotCtx)).toBe(true);
    expect(isContractsV2UiEnabled(pilotCtx)).toBe(true);
    expect(isSignaturesV2UiEnabled(pilotCtx)).toBe(true);
    expect(isContractDocumentsV2UiEnabled(pilotCtx)).toBe(true);

    const otherCtx = buildContractFeatureFlagContext({
      tenantId: OTHER_TENANT,
      tenantFlags: {},
      projectRef: STAGING_REF,
      forceAllowPilotInTest: true,
    });
    expect(isContractFeatureEnabled('contract_templates_v2_enabled', otherCtx)).toBe(false);
    expect(isContractTemplatesV2UiEnabled(otherCtx)).toBe(false);
    expect(isContractsV2UiEnabled(otherCtx)).toBe(false);
  });

  it('produção nunca recebe overrides de piloto', () => {
    const overrides = getStagingPilotFlagOverrides({
      tenantId: STAGING_CONTRACTS_PILOT_TENANT_ID,
      projectRef: PRODUCTION_REF,
    });
    expect(overrides).toBeUndefined();
    expect(isContractsV2StagingPilotEnvironment({ projectRef: PRODUCTION_REF })).toBe(false);
  });

  it('aliases contracts.v2.* habilitam canônicas via tenantFlags', () => {
    const ctx = {
      tenantFlags: {
        'contracts.v2.templates': true,
        'contracts.v2.pdf': true,
      },
    };
    expect(isContractFeatureEnabled('contract_templates_v2_enabled', ctx)).toBe(true);
    expect(isContractFeatureEnabled('contract_pdf_v2_enabled', ctx)).toBe(true);
    expect(isContractFeatureEnabled('contract_storage_v2_enabled', ctx)).toBe(false);
  });

  it('rotas v2 listadas no shell', () => {
    const routes = contractsShellNavItems.filter((i) => String(i.route).includes('-v2')).map((i) => i.route);
    expect(routes).toEqual(expect.arrayContaining([
      '/gestao/contratos/modelos-v2',
      '/gestao/contratos/instancias-v2',
      '/gestao/contratos/assinaturas-v2',
      '/gestao/contratos/documentos-v2',
    ]));
  });
});

describe('Phase 10.14 — functional smoke in-memory (piloto)', () => {
  it('PDF/storage → assinatura → SIGNED → ledger sequencial', async () => {
    const flagContext = {
      tenantId: STAGING_CONTRACTS_PILOT_TENANT_ID,
      forceAllowPilotInTest: true,
      projectRef: STAGING_REF,
      overrides: Object.fromEntries(
        STAGING_PILOT_ENABLED_CANONICAL_FLAGS.map((f) => [f, true]),
      ),
    };
    expect(getContractFeatureFlags(flagContext).contract_templates_v2_enabled).toBe(true);
    expect(getContractFeatureFlags(flagContext).contract_audit_ledger_enabled).toBe(true);

    const docs = await createDocumentsV2Harness();
    const unsigned = await docs.pipeline.generateUnsignedArtifacts(
      docs.tenantId,
      docs.contract,
      docs.version,
      docs.actor,
    );
    expect(unsigned.file.fileType).toBe('GENERATED_PDF');
    expect(unsigned.pdf.artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
    await docs.storage.verifyIntegrity(docs.tenantId, unsigned.file.id);

    const h = await createSigningCompletionHarness();
    const prep = await h.prepareSignedArtifacts();
    const input = {
      contractId: h.contract.id,
      contractVersionId: h.version.id,
      envelopeId: prep.envelope.id,
      signedPdfFileId: prep.signedPdf.id,
      evidenceReportFileId: prep.evidenceReport.id,
      integrityManifestFileId: prep.integrityManifest.id,
      idempotencyKey: 'pilot-1014-1',
    };
    const completed = await h.completion.completeSigning(h.tenantId, input, h.actor);
    expect(completed.contract.status).toBe('SIGNED');
    expect(completed.ledgerEntries.length).toBeGreaterThan(0);
    const seqs = completed.ledgerEntries.map((e) => e.sequenceNumber);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

    const listed = await h.ledger.listByContract(h.tenantId, h.contract.id);
    expect(listed.length).toBe(completed.ledgerEntries.length);
  });
});

describe('Phase 10.14 — tooling artifacts', () => {
  it('script piloto e relatório existem ou serão gerados', () => {
    expect(fs.existsSync(path.join(ROOT, 'scripts/supabase/runStagingContractsV2Pilot.mjs'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'docs/reports/PHASE_10_14_STAGING_FEATURE_FLAG_PILOT.md'))).toBe(true);
  });
});
