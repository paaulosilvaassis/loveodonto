import { describe, expect, it, beforeEach } from 'vitest';
import { defaultDbState } from '../db/schema.js';
import { saveDb, loadDb } from '../db/index.js';
import {
  buildClinicSummaryFromServerProfile,
  mapServerClinicProfileToLocal,
  needsClinicProfileResync,
  syncTenantClinicProfileToLocalDb,
} from '../services/tenantClinicProfileSync.js';

const TENANT_ID = 'b2f95268-101c-42cb-8a8e-8d3681aa7dfa';

const SERVER_PROFILE = {
  id: 'uuid-1',
  tenant_id: TENANT_ID,
  clinic_id: 'clinic-b2f95268',
  name: 'Implanprime Odontologia e Estética',
  fantasy_name: 'Implanprime Odontologia e Estética',
  legal_name: 'Prime Gestão Odontologica',
  logo_url: 'https://cdn.example/logo.png',
  email: 'contato@implanprime.com.br',
  cnpj: '12.345.678/0001-99',
  status: 'active',
};

describe('tenantClinicProfileSync', () => {
  beforeEach(() => {
    saveDb(defaultDbState());
  });

  it('mapeia clinicProfile do servidor para IndexedDB', () => {
    const local = mapServerClinicProfileToLocal(SERVER_PROFILE);
    expect(local.tenant_id).toBe(TENANT_ID);
    expect(local.nomeClinica).toBe('Implanprime Odontologia e Estética');
    expect(local.logoUrl).toBe('https://cdn.example/logo.png');
  });

  it('detecta resync quando IndexedDB tem placeholder LOVE ODONTO', () => {
    expect(needsClinicProfileResync(TENANT_ID)).toBe(true);
    syncTenantClinicProfileToLocalDb(SERVER_PROFILE, TENANT_ID);
    expect(needsClinicProfileResync(TENANT_ID)).toBe(false);
  });

  it('rejeita mismatch de tenant_id', () => {
    const ok = syncTenantClinicProfileToLocalDb(SERVER_PROFILE, 'outro-tenant-id');
    expect(ok).toBe(false);
    expect(loadDb().clinicProfile.nomeClinica).toBe('LOVE ODONTO');
  });

  it('buildClinicSummaryFromServerProfile expõe nome e logo para sidebar', () => {
    const summary = buildClinicSummaryFromServerProfile(SERVER_PROFILE);
    expect(summary.nomeClinica).toContain('Implanprime');
    expect(summary.logoUrl).toContain('logo.png');
    expect(summary.tenant_id).toBe(TENANT_ID);
  });
});
