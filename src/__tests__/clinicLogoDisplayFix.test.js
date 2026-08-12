import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getClinicLogo,
  hasClinicLogo,
  withClinicLogoCacheBust,
  normalizeClinicProfileForClient,
} from '../utils/clinicLogo.js';

describe('PHASE clinic logo display fix', () => {
  it('getClinicLogo usa logo da clínica e fallback só quando ausente', () => {
    expect(getClinicLogo({ logoUrl: 'https://cdn/t1/logo.webp' }, { includeDefault: false }))
      .toBe('https://cdn/t1/logo.webp');
    expect(getClinicLogo({}, { includeDefault: false })).toBe('');
    expect(getClinicLogo({})).toContain('love-odonto');
  });

  it('withClinicLogoCacheBust atualiza query v sem alterar data URL', () => {
    expect(withClinicLogoCacheBust('https://cdn/logo.webp', '2026-08-11T00:00:00Z'))
      .toBe('https://cdn/logo.webp?v=2026-08-11T00%3A00%3A00Z');
    expect(withClinicLogoCacheBust('https://cdn/logo.webp?x=1', 'abc'))
      .toBe('https://cdn/logo.webp?x=1&v=abc');
    expect(withClinicLogoCacheBust('data:image/png;base64,aaa', 'v1')).toBe('data:image/png;base64,aaa');
  });

  it('normalizeClinicProfileForClient preserva isolamento por tenant_id', () => {
    const a = normalizeClinicProfileForClient({
      tenant_id: 'tenant-a',
      logo_url: 'https://cdn/a/logo.webp',
      name: 'Clinica A',
    });
    const b = normalizeClinicProfileForClient({
      tenant_id: 'tenant-b',
      logo_url: 'https://cdn/b/logo.webp',
      name: 'Clinica B',
    });
    expect(a.logoUrl).toBe('https://cdn/a/logo.webp');
    expect(b.logoUrl).toBe('https://cdn/b/logo.webp');
    expect(a.tenantId).not.toBe(b.tenantId);
  });

  it('hasClinicLogo distingue clínica com e sem logo', () => {
    expect(hasClinicLogo({ logo_url: 'https://x' })).toBe(true);
    expect(hasClinicLogo({ logoUrl: '' })).toBe(false);
  });
});

describe('tenant context propaga clinicProfile', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('readTenantAccessSnapshot inclui clinicProfile do contexto', async () => {
    vi.doMock('../services/tenantContextService.js', () => ({
      getTenantContext: vi.fn(async () => ({
        tenant: { id: 't1', status: 'active' },
        clinicProfile: {
          tenant_id: 't1',
          logo_url: 'https://cdn/t1/logo.webp',
          name: 'Implanprime',
        },
        modules: {},
        flags: {},
        subscription: null,
        limits: {},
        warnings: [],
        currentUser: null,
      })),
    }));
    const { readTenantAccessSnapshot } = await import('../services/platformAccessService.js');
    const snap = await readTenantAccessSnapshot('t1');
    expect(snap.clinicProfile?.logo_url).toBe('https://cdn/t1/logo.webp');
    expect(getClinicLogo(snap.clinicProfile, { includeDefault: false })).toBe('https://cdn/t1/logo.webp');
  });
});
