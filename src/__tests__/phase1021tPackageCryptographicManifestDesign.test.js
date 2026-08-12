/**
 * PHASE_10.21T — testes puros de arquitetura (sem DDL / sem Supabase).
 */
import { describe, expect, it } from 'vitest';
import {
  canonicalizePresentedTextV1,
  hashPresentedTextContentV1,
  canonicalizePackageManifestHashInput,
  hashPackageManifest,
  buildPackageManifestHashInput,
} from '../domain/contracts/packages/package-manifest-hash.ts';
import {
  mapOperationalDocumentTypeToContractDocumentType as mapDoc,
  buildManifestDocumentKey as buildKey,
} from '../domain/contracts/packages/package-manifest-document-map.ts';
import { PACKAGE_MANIFEST_CANONICALIZATION_VERSION as CANON_V } from '../domain/contracts/packages/package-manifest.types.ts';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function baseManifest(docs) {
  return {
    tenantId: 'tenant-a',
    sourcePackageKey: 'pkg_budget_1',
    packageId: null,
    manifestVersion: 1,
    primaryContractId: 'ctr_1',
    primaryContractVersionId: 'ver_1',
    canonicalizationVersion: CANON_V,
    documents: docs,
  };
}

function doc(overrides) {
  return {
    id: 'd1',
    tenantId: 'tenant-a',
    manifestId: 'm1',
    documentKey: 'contract',
    documentType: 'SERVICE_CONTRACT',
    sourceKind: 'CONTRACT_VERSION',
    sourceId: 'ver_1',
    documentVersion: '1',
    title: 'Contrato',
    required: true,
    displayOrder: 1,
    contentMimeType: 'text/html',
    contentHash: 'aa'.repeat(32),
    contentHashEncoding: 'utf8_canonical_v1',
    createdAt: '2026-08-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('PHASE_10.21T — package cryptographic manifest design', () => {
  it('canonicalizationVersion é pkg_manifest_v1', () => {
    expect(CANON_V).toBe('pkg_manifest_v1');
  });

  it('texto: CRLF/BOM normalizam sem alterar conteúdo jurídico', async () => {
    const a = 'Linha 1\r\nLinha 2';
    const b = '\uFEFFLinha 1\nLinha 2';
    expect(canonicalizePresentedTextV1(a)).toBe('Linha 1\nLinha 2');
    expect(canonicalizePresentedTextV1(b)).toBe('Linha 1\nLinha 2');
    const ha = await hashPresentedTextContentV1(a);
    const hb = await hashPresentedTextContentV1(b);
    expect(ha).toBe(hb);
    expect(ha).toHaveLength(64);
  });

  it('whitespace interno relevante muda o hash', async () => {
    const h1 = await hashPresentedTextContentV1('Paulo Henrique');
    const h2 = await hashPresentedTextContentV1('Paulo  Henrique');
    expect(h1).not.toBe(h2);
  });

  it('T1/T2: alterar TCLE ou LGPD muda manifestHash', async () => {
    const contractHash = await hashPresentedTextContentV1('<p>Contrato</p>');
    const tcleA = await hashPresentedTextContentV1('TCLE A');
    const tcleB = await hashPresentedTextContentV1('TCLE B');
    const lgpdA = await hashPresentedTextContentV1('LGPD A');
    const lgpdB = await hashPresentedTextContentV1('LGPD B');

    const base = baseManifest([
      doc({ documentKey: 'contract', displayOrder: 1, contentHash: contractHash }),
      doc({
        documentKey: 'tcle:tcle_implante',
        documentType: 'IMPLANT_CONSENT',
        displayOrder: 2,
        contentHash: tcleA,
      }),
      doc({
        documentKey: 'lgpd',
        documentType: 'LGPD_TERM',
        displayOrder: 3,
        contentHash: lgpdA,
      }),
    ]);

    const h0 = await hashPackageManifest(buildPackageManifestHashInput(base));
    const hTcle = await hashPackageManifest(buildPackageManifestHashInput({
      ...base,
      documents: base.documents.map((d) => (
        d.documentKey.startsWith('tcle:') ? { ...d, contentHash: tcleB } : d
      )),
    }));
    const hLgpd = await hashPackageManifest(buildPackageManifestHashInput({
      ...base,
      documents: base.documents.map((d) => (
        d.documentKey === 'lgpd' ? { ...d, contentHash: lgpdB } : d
      )),
    }));

    expect(hTcle).not.toBe(h0);
    expect(hLgpd).not.toBe(h0);
  });

  it('T3/T4: remover/adicionar documento muda manifestHash', async () => {
    const c = await hashPresentedTextContentV1('C');
    const t = await hashPresentedTextContentV1('T');
    const l = await hashPresentedTextContentV1('L');
    const withThree = baseManifest([
      doc({ documentKey: 'contract', displayOrder: 1, contentHash: c }),
      doc({ documentKey: 'tcle:x', documentType: 'INFORMED_CONSENT', displayOrder: 2, contentHash: t }),
      doc({ documentKey: 'lgpd', documentType: 'LGPD_TERM', displayOrder: 3, contentHash: l }),
    ]);
    const withoutTcle = {
      ...withThree,
      documents: withThree.documents.filter((d) => d.documentKey !== 'tcle:x'),
    };
    const withImage = {
      ...withThree,
      documents: [
        ...withThree.documents,
        doc({
          documentKey: 'image',
          documentType: 'IMAGE_AUTHORIZATION',
          displayOrder: 4,
          contentHash: await hashPresentedTextContentV1('IMG'),
          required: false,
        }),
      ],
    };

    const h3 = await hashPackageManifest(buildPackageManifestHashInput(withThree));
    const h2 = await hashPackageManifest(buildPackageManifestHashInput(withoutTcle));
    const h4 = await hashPackageManifest(buildPackageManifestHashInput(withImage));
    expect(h2).not.toBe(h3);
    expect(h4).not.toBe(h3);
  });

  it('ordem de apresentação juridicamente relevante muda hash', async () => {
    const a = await hashPresentedTextContentV1('A');
    const b = await hashPresentedTextContentV1('B');
    const m1 = baseManifest([
      doc({ documentKey: 'contract', displayOrder: 1, contentHash: a }),
      doc({ documentKey: 'lgpd', documentType: 'LGPD_TERM', displayOrder: 2, contentHash: b }),
    ]);
    const m2 = baseManifest([
      doc({ documentKey: 'contract', displayOrder: 2, contentHash: a }),
      doc({ documentKey: 'lgpd', documentType: 'LGPD_TERM', displayOrder: 1, contentHash: b }),
    ]);
    const h1 = await hashPackageManifest(buildPackageManifestHashInput(m1));
    const h2 = await hashPackageManifest(buildPackageManifestHashInput(m2));
    expect(h1).not.toBe(h2);
  });

  it('canonical JSON é determinístico (key order independente)', () => {
    const input = {
      canonicalizationVersion: 'pkg_manifest_v1',
      tenantId: 't',
      sourcePackageKey: 'pkg',
      packageId: null,
      manifestVersion: 1,
      primaryContractId: 'c',
      primaryContractVersionId: 'v',
      documents: [
        {
          documentKey: 'b',
          documentType: 'LGPD_TERM',
          documentVersion: '1',
          required: true,
          displayOrder: 2,
          contentHash: '11'.repeat(32),
          contentMimeType: 'text/plain',
        },
        {
          documentKey: 'a',
          documentType: 'SERVICE_CONTRACT',
          documentVersion: '1',
          required: true,
          displayOrder: 1,
          contentHash: '22'.repeat(32),
          contentMimeType: 'text/html',
        },
      ],
    };
    const c1 = canonicalizePackageManifestHashInput(input);
    const c2 = canonicalizePackageManifestHashInput({ ...input, documents: [...input.documents].reverse() });
    expect(c1).toBe(c2);
    expect(c1).toContain('"documentKey":"a"');
  });

  it('mapeia operacional → taxonomia oficial (sem enum paralelo)', () => {
    expect(mapDoc('CONTRACT_SERVICES').documentType).toBe('SERVICE_CONTRACT');
    expect(mapDoc('LGPD').documentType).toBe('LGPD_TERM');
    expect(mapDoc('IMAGE_USE').documentType).toBe('IMAGE_AUTHORIZATION');
    expect(mapDoc('TCLE', 'tcle_implante').documentType).toBe('IMPLANT_CONSENT');
    expect(mapDoc('TCLE', 'tcle_implante').defaultAcceptanceCode).toBe('CLINICAL_CONSENT_CONFIRMED');
    expect(buildKey('TCLE', 'tcle_implante')).toBe('tcle:tcle_implante');
  });

  it('LGPD não usa hash estático genérico no design de conteúdo', async () => {
    const h1 = await hashPresentedTextContentV1('Política LGPD clínica A');
    const h2 = await hashPresentedTextContentV1('Política LGPD clínica B');
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe('term_lgpd_notice_v1');
  });

  it('migration proposta existe e NÃO deve ser considerada aplicada', () => {
    const candidates = [
      resolve(process.cwd(), 'supabase/migrations/036_app_package_manifest_foundation.sql'),
      resolve(process.cwd(), 'supabase-local/migrations/036_app_package_manifest_foundation.sql'),
    ];
    const found = candidates.filter((p) => existsSync(p));
    expect(found.length).toBeGreaterThan(0);
    const sql = readFileSync(found[0], 'utf8');
    expect(sql).toContain('app_package_manifests');
    expect(sql).toContain('app_package_manifest_documents');
    expect(sql).toContain('app_package_document_acceptances');
    expect(sql).toContain('package_manifest_id');
    expect(sql).toMatch(/NÃO APLICAR|DO NOT APPLY|NOT APPLY/i);
    expect(sql).toContain('pkg_manifest_v1');
  });

  it('não cria motor paralelo de assinatura', () => {
    const types = readFileSync(
      resolve(process.cwd(), 'src/domain/contracts/packages/package-manifest.types.ts'),
      'utf8',
    );
    const freeze = readFileSync(
      resolve(process.cwd(), 'src/domain/contracts/packages/package-manifest-freeze.design.ts'),
      'utf8',
    );
    expect(types).toContain('OPTION_C');
    expect(freeze).toContain('package_manifest_hash');
    expect(freeze).not.toMatch(/createExternalSignatureProvider|new SignatureProvider/);
  });
});
