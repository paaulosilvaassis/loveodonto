/**
 * PHASE_10.21X — Isolated staging browser env guards + package UI regressions.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertStagingExternalCommunicationDisabled,
  assertStagingTestModeSafe,
  isStagingTestModeEnabled,
  parseTruthyFlag,
  stagingBannerCopy,
  STAGING_REF,
  PRODUCTION_REF,
  urlLooksLikeProduction,
} from '../domain/contracts/staging/staging-browser-test-mode.ts';
import { evaluatePackageManifestSignGate } from '../domain/contracts/packages/package-manifest-freeze.service.ts';
import { buildPublicPackageDocumentsFromManifest } from '../components/contracts/public/PublicPackageManifestDocuments.jsx';

const ROOT = process.cwd();

describe('PHASE_10.21X — staging browser isolation', () => {
  it('staging env guard: production blocked when staging mode on', () => {
    const bad = assertStagingTestModeSafe({
      VITE_STAGING_TEST_MODE: 'true',
      VITE_SUPABASE_APP_URL: `https://${PRODUCTION_REF}.supabase.co`,
      VITE_SUPABASE_PLATFORM_URL: `https://${PRODUCTION_REF}.supabase.co`,
      CONTRACTS_V2_DELIVERY_MODE: 'disabled',
    });
    expect(bad.ok).toBe(false);
    expect(bad.productionDetected).toBe(true);
  });

  it('staging env guard: staging ref PASS', () => {
    const ok = assertStagingTestModeSafe({
      LOVE_ODONTO_STAGING_TEST_MODE: '1',
      VITE_SUPABASE_APP_URL: `https://${STAGING_REF}.supabase.co`,
      VITE_SUPABASE_PLATFORM_URL: `https://${STAGING_REF}.supabase.co`,
      VITE_PLATFORM_API_BASE_URL: 'http://127.0.0.1:3001',
      CONTRACTS_V2_DELIVERY_MODE: 'disabled',
    });
    expect(ok.ok).toBe(true);
    expect(ok.projectRef).toBe(STAGING_REF);
    expect(ok.environment).toBe('STAGING');
  });

  it('API production blocked in staging mode', () => {
    const bad = assertStagingTestModeSafe({
      STAGING_TEST_MODE: 'true',
      VITE_SUPABASE_APP_URL: `https://${STAGING_REF}.supabase.co`,
      VITE_SUPABASE_PLATFORM_URL: `https://${STAGING_REF}.supabase.co`,
      VITE_PLATFORM_API_BASE_URL: `https://api.${PRODUCTION_REF}.example.com`,
      CONTRACTS_V2_DELIVERY_MODE: 'disabled',
    });
    expect(bad.ok).toBe(false);
  });

  it('communication disabled required', () => {
    expect(assertStagingExternalCommunicationDisabled({
      VITE_STAGING_TEST_MODE: 'true',
      CONTRACTS_V2_DELIVERY_MODE: 'simulation',
    }).ok).toBe(false);
    expect(assertStagingExternalCommunicationDisabled({
      VITE_STAGING_TEST_MODE: 'true',
      CONTRACTS_V2_DELIVERY_MODE: 'disabled',
    }).ok).toBe(true);
  });

  it('banner copy is unmistakable and has no secrets', () => {
    const copy = stagingBannerCopy(STAGING_REF);
    expect(copy.title).toContain('STAGING');
    expect(copy.title).toContain('NÃO É PRODUÇÃO');
    expect(copy.projectLine).toMatch(/tckd/i);
    expect(JSON.stringify(copy)).not.toMatch(/eyJ|service_role|anon/i);
  });

  it('mode inactive does not force staging', () => {
    expect(isStagingTestModeEnabled({})).toBe(false);
    expect(assertStagingTestModeSafe({}).ok).toBe(true);
    expect(parseTruthyFlag('true')).toBe(true);
    expect(urlLooksLikeProduction(`https://${PRODUCTION_REF}.supabase.co`)).toBe(true);
  });

  it('wiring: banner + main guard + vite scripts exist', () => {
    const banner = readFileSync(resolve(ROOT, 'src/components/StagingTestModeBanner.jsx'), 'utf8');
    const main = readFileSync(resolve(ROOT, 'src/main.jsx'), 'utf8');
    const app = readFileSync(resolve(ROOT, 'src/App.jsx'), 'utf8');
    const vite = readFileSync(resolve(ROOT, 'vite.config.js'), 'utf8');
    const server = readFileSync(resolve(ROOT, 'server/index.js'), 'utf8');
    expect(banner).toContain('stagingBannerCopy');
    expect(banner).toContain('data-testid="staging-test-mode-banner"');
    const modeTs = readFileSync(
      resolve(ROOT, 'src/domain/contracts/staging/staging-browser-test-mode.ts'),
      'utf8',
    );
    expect(modeTs).toContain('STAGING — DADOS FICTÍCIOS — NÃO É PRODUÇÃO');
    expect(main).toContain('assertStagingTestModeSafe');
    expect(app).toContain('StagingTestModeBanner');
    expect(vite).toContain('STAGING_TEST_MODE');
    expect(server).toContain('STAGING_TEST_MODE');
    expect(existsSync(resolve(ROOT, 'scripts/staging/prepareStagingBrowserEnv.mjs'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'scripts/staging/runStagingBrowserVite.mjs'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'scripts/staging/runStagingBrowserApi.mjs'))).toBe(true);
  });

  it('package public UI + sign gate still PASS', () => {
    const manifest = {
      documents: [
        {
          documentKey: 'contract',
          documentType: 'SERVICE_CONTRACT',
          title: 'Contrato',
          required: true,
          displayOrder: 1,
          snapshotStoragePath: 'a',
          contentHash: 'a'.repeat(64),
        },
        {
          documentKey: 'tcle:x',
          documentType: 'IMPLANT_CONSENT',
          title: 'TCLE',
          required: true,
          displayOrder: 2,
          snapshotStoragePath: 'b',
          contentHash: 'b'.repeat(64),
        },
        {
          documentKey: 'lgpd',
          documentType: 'LGPD_TERM',
          title: 'LGPD',
          required: true,
          displayOrder: 3,
          snapshotStoragePath: 'c',
          contentHash: 'c'.repeat(64),
        },
      ],
    };
    const snaps = new Map([['a', '<p>C</p>'], ['b', '<p>T</p>'], ['c', '<p>L</p>']]);
    const docs = buildPublicPackageDocumentsFromManifest(manifest, snaps);
    expect(docs).toHaveLength(3);
    const gateBlocked = evaluatePackageManifestSignGate({
      manifest,
      envelopeManifestHash: 'd'.repeat(64),
      acceptances: [],
    });
    expect(gateBlocked.canSign).toBe(false);
  });
});
