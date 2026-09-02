/**
 * PATCH B.2AA.2A — expose updateClinicAddress on the live ProtectedApp graph.
 * Sem executar o writer contra dados de produção.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, resetDb, withDb, loadDb, getDbPersistenceStatus } from '../db/index.js';
import {
  addClinicAddress,
  updateClinicAddress as canonicalUpdateClinicAddress,
} from '../services/clinicService.js';
import {
  updateClinicAddress as facadeUpdateClinicAddress,
} from '../services/clinicAddressUpdateFacade.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readSrc(rel) {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

const admin = { id: 'user-aa2a-admin', role: 'admin' };

describe('PHASE_10.23AA2A — live writer reachability', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  it('AA2A-01 production-facing module exports updateClinicAddress', async () => {
    const shellSrc = readSrc('src/ProtectedApp.jsx');
    expect(shellSrc).toMatch(
      /export\s*\{\s*updateClinicAddress\s*\}\s*from\s*['"]\.\/services\/clinicAddressUpdateFacade\.js['"]/,
    );
    const facadeSrc = readSrc('src/services/clinicAddressUpdateFacade.js');
    expect(facadeSrc).toMatch(
      /export\s*\{\s*updateClinicAddress\s*\}\s*from\s*['"]\.\/clinicService\.js['"]/,
    );
    const ns = await import('../services/clinicAddressUpdateFacade.js');
    expect(typeof ns.updateClinicAddress).toBe('function');
    expect(Object.keys(ns)).toContain('updateClinicAddress');
  });

  it('AA2A-02 importing the facade does not execute any DB mutation', async () => {
    const facadeSrc = readSrc('src/services/clinicAddressUpdateFacade.js');
    expect(facadeSrc).not.toMatch(/updateClinicAddress\s*\(/);
    expect(facadeSrc).not.toContain('withDb');
    expect(facadeSrc).not.toContain('clinic:update-address');
    const shellSrc = readSrc('src/ProtectedApp.jsx');
    expect(shellSrc).not.toMatch(/updateClinicAddress\s*\(/);

    const epochBefore = getDbPersistenceStatus().saveEpoch;
    const addressesBefore = JSON.stringify(loadDb().clinicAddresses || []);
    const ns = await import('../services/clinicAddressUpdateFacade.js');
    expect(typeof ns.updateClinicAddress).toBe('function');
    expect(getDbPersistenceStatus().saveEpoch).toBe(epochBefore);
    expect(JSON.stringify(loadDb().clinicAddresses || [])).toBe(addressesBefore);
  });

  it('AA2A-03 writer identity resolves to the canonical clinicService implementation', () => {
    expect(facadeUpdateClinicAddress).toBe(canonicalUpdateClinicAddress);
    const serviceSrc = readSrc('src/services/clinicService.js');
    expect(serviceSrc).toContain('export const updateClinicAddress');
    expect(serviceSrc).toContain("logAction('clinic:update-address'");
    expect(serviceSrc).toContain('DB_NO_CHANGE');
  });

  it('AA2A-04 existing ClinicSettingsPage/addClinicAddress behavior unchanged', () => {
    const pageSrc = readSrc('src/pages/ClinicSettingsPage.jsx');
    expect(pageSrc).toContain('addClinicAddress');
    expect(pageSrc).toContain('addClinicAddress(user, draft.newAddress)');
    expect(pageSrc).not.toMatch(/updateClinicAddress\s*\(/);

    withDb((db) => {
      db.clinicAddresses = [];
      return db;
    });
    const rows = addClinicAddress(admin, {
      tipo: 'comercial',
      cep: '30130-000',
      logradouro: 'Rua Nova',
      numero: '1',
      cidade: 'Belo Horizonte',
      uf: 'mg',
      principal: true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].clinicId).toBe('clinic-1');
    expect(rows[0].uf).toBe('mg');
    expect(loadDb().clinicAddresses).toHaveLength(1);
  });
});
