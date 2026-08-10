/**
 * PHASE_10.21K — localhost-only safe operational UX test mode
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isContractsOperationalUxLocalTestEnabled,
  isLocalhostHostname,
  isForbiddenProductionHostname,
  getContractsOperationalUxLocalTestStatus,
  CONTRACTS_OPERATIONAL_UX_LOCAL_TEST_ENV_KEY,
} from '../domain/contracts/rollout/contracts-operational-ux-local-test.ts';
import {
  CONTRACTS_OPERATIONAL_MODES,
  isContractsOperationalUxEnabled,
} from '../domain/contracts/rollout/contracts-operational-mode.ts';
import {
  __resetContractsOperationalRolloutCacheForTests,
  getServerOperationalUxSnapshot,
  isOperationalContractsUxEnabledForCurrentClinic,
} from '../services/contractsOperationalRolloutService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const admin = { id: 'u-admin', role: 'master', tenantId: 'b721c2c9-d924-41ee-8911-dc00c8208326' };

function seedServerOffState(mode = CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX) {
  __resetContractsOperationalRolloutCacheForTests();
  localStorage.setItem('loveodonto.contracts.operationalRollout.v1', JSON.stringify({
    state: {
      mode,
      productionGlobalEnabled: false,
      tenantEnabled: false,
      productionTenantAllowlist: [],
      source: 'feature_flags',
      rolloutPhase: 'READY_FOR_PRODUCTION_ACTIVATION',
      lastChangedAt: null,
      lastChangedBy: null,
      rollbackReason: null,
      notes: '',
    },
    metrics: {},
    audit: [],
    source: 'feature_flags',
  }));
}

describe('phase1021k — local operational UX test mode', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetContractsOperationalRolloutCacheForTests();
    vi.restoreAllMocks();
  });

  it('1) localhost + DEV + env ON → local test pode habilitar UX', () => {
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: 'localhost',
    })).toBe(true);
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: '127.0.0.1',
    })).toBe(true);
  });

  it('2) localhost + env OFF → não habilita', () => {
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'false',
      hostname: 'localhost',
    })).toBe(false);
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: null,
      hostname: 'localhost',
    })).toBe(false);
  });

  it('3) produção (DEV=false) + env ON acidental → NÃO habilita', () => {
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: false,
      envFlag: 'true',
      hostname: 'localhost',
    })).toBe(false);
  });

  it('4) loveodonto.com.br → NÃO habilita', () => {
    expect(isForbiddenProductionHostname('loveodonto.com.br')).toBe(true);
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: 'loveodonto.com.br',
    })).toBe(false);
  });

  it('5) www.loveodonto.com.br → NÃO habilita', () => {
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: 'www.loveodonto.com.br',
    })).toBe(false);
  });

  it('6) domínio Vercel → NÃO habilita', () => {
    expect(isForbiddenProductionHostname('foo.vercel.app')).toBe(true);
    expect(isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: 'loveodonto-abc.vercel.app',
    })).toBe(false);
  });

  it('7) server global OFF permanece OFF', () => {
    seedServerOffState();
    expect(getServerOperationalUxSnapshot(admin).productionGlobalEnabled).toBe(false);
  });

  it('8) server tenant OFF permanece OFF', () => {
    seedServerOffState();
    const snap = getServerOperationalUxSnapshot(admin);
    expect(snap.tenantEnabled).toBe(false);
    expect(snap.operationalUxEnabled).toBe(false);
  });

  it('9) bypass não chama ativação server-side', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const on = isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: 'localhost',
    });
    expect(on).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('10) V1 continua disponível (server OFF + local OFF → UX efetiva false)', () => {
    seedServerOffState();
    expect(isContractsOperationalUxEnabled({
      tenantId: admin.tenantId,
      state: {
        mode: CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX,
        productionGlobalEnabled: false,
        tenantEnabled: false,
        source: 'feature_flags',
      },
    })).toBe(false);
    // Sem bypass injetado na clinic helper: permanece false se local test runtime não estiver ON
    // (vitest não carrega .env.development por padrão)
    expect(getServerOperationalUxSnapshot(admin).operationalUxEnabled).toBe(false);
  });

  it('11) build de produção não ativa o bypass', () => {
    expect(getContractsOperationalUxLocalTestStatus({
      isDev: false,
      envFlag: 'true',
      hostname: 'localhost',
    }).localTestEnabled).toBe(false);
  });

  it('bypass efetiva UX sem mutar SSOT do servidor', () => {
    seedServerOffState();
    const serverOn = getServerOperationalUxSnapshot(admin).operationalUxEnabled;
    const localOn = isContractsOperationalUxLocalTestEnabled({
      isDev: true,
      envFlag: 'true',
      hostname: 'localhost',
    });
    expect(serverOn).toBe(false);
    expect(localOn).toBe(true);
    expect(serverOn || localOn).toBe(true);
    expect(getServerOperationalUxSnapshot(admin).productionGlobalEnabled).toBe(false);
    expect(getServerOperationalUxSnapshot(admin).tenantEnabled).toBe(false);
  });

  it('ROLLED_BACK não é sobrescrito pelo clinic helper', () => {
    seedServerOffState(CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK);
    expect(isOperationalContractsUxEnabledForCurrentClinic(admin)).toBe(false);
  });

  it('sync SaaS bloqueia local test (código + motivo)', () => {
    const syncSrc = readFileSync(
      path.join(ROOT, 'src/services/contractSaasSyncService.js'),
      'utf8',
    );
    expect(syncSrc).toContain('isContractsOperationalUxLocalTestEnabled');
    expect(syncSrc).toContain('local_operational_ux_test');
  });

  it('banner e env key existem', () => {
    expect(CONTRACTS_OPERATIONAL_UX_LOCAL_TEST_ENV_KEY).toBe('VITE_CONTRACTS_OPERATIONAL_UX_LOCAL_TEST');
    expect(isLocalhostHostname('localhost')).toBe(true);
    const banner = readFileSync(
      path.join(ROOT, 'src/components/contracts/operational/LocalOperationalUxTestBanner.jsx'),
      'utf8',
    );
    expect(banner).toContain('AMBIENTE DE TESTE LOCAL — CONTRATOS');
    expect(banner).toContain('Nenhuma ativação de produção foi realizada.');
    const envDev = readFileSync(path.join(ROOT, '.env.development'), 'utf8');
    expect(envDev).toMatch(/VITE_CONTRACTS_OPERATIONAL_UX_LOCAL_TEST\s*=\s*true/);
  });
});
