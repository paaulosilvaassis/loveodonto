import { describe, expect, it } from 'vitest';
import {
  getClinicLogo,
  hasClinicLogo,
  normalizeClinicProfileForClient,
} from '../utils/clinicLogo.js';

describe('clinicLogo utils', () => {
  it('getClinicLogo prioriza logoUrl e logo_url', () => {
    expect(getClinicLogo({ logo_url: 'https://cdn/a.png' }, { includeDefault: false })).toBe('https://cdn/a.png');
    expect(getClinicLogo({ logoUrl: 'https://cdn/b.png' }, { includeDefault: false })).toBe('https://cdn/b.png');
  });

  it('getClinicLogo usa fallback Love Odonto quando ausente', () => {
    const url = getClinicLogo({});
    expect(url).toContain('love-odonto');
  });

  it('hasClinicLogo detecta presença de logomarca', () => {
    expect(hasClinicLogo({ logo_url: 'https://x' })).toBe(true);
    expect(hasClinicLogo({})).toBe(false);
  });

  it('normalizeClinicProfileForClient espelha logo_url em logoUrl', () => {
    const normalized = normalizeClinicProfileForClient({
      tenant_id: 't1',
      name: 'Implanprime',
      logo_url: 'https://cdn/logo.png',
    });
    expect(normalized.logoUrl).toBe('https://cdn/logo.png');
    expect(normalized.tenantId).toBe('t1');
  });
});
