import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, loadDb, withDb } from '../db/index.js';
import {
  bootstrapSaasTenantLocalDb,
  isSaasTenantUuid,
} from '../services/saasTenantBootstrapService.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';

const TENANT_ID = '117e69b9-2453-4839-abc8-097254592bb4';

describe('saasTenantBootstrapService', () => {
  beforeEach(async () => {
    resetDb();
    await initDb();
  });

  it('identifica tenant SaaS por UUID', () => {
    expect(isSaasTenantUuid(TENANT_ID)).toBe(true);
    expect(isSaasTenantUuid('tenant-1')).toBe(false);
  });

  it('inicializa IndexedDB limpo para novo tenant SaaS', async () => {
    const bootstrapped = await bootstrapSaasTenantLocalDb({
      id: 'user-saas-1',
      tenantId: TENANT_ID,
      authMode: 'saas',
      name: 'Paulo Teste',
      email: 'teste@clinica.com',
      role: 'admin',
      isMaster: true,
    }, {
      tenantSnapshot: {
        trade_name: 'Clínica Nova',
        legal_name: 'Clínica Nova LTDA',
        cnpj: '11222333000181',
        city: 'Itatiaiuçu',
        state: 'MG',
      },
    });

    expect(bootstrapped).toBe(true);

    ensureSaasUserInLocalDb({
      id: 'user-saas-1',
      tenantId: TENANT_ID,
      authMode: 'saas',
      name: 'Paulo Teste',
      email: 'teste@clinica.com',
      role: 'admin',
      isMaster: true,
    });

    const db = loadDb();
    expect(db.tenants).toHaveLength(1);
    expect(db.tenants[0].id).toBe(TENANT_ID);
    expect(db.tenants[0].saas_bootstrapped_at).toBeTruthy();
    expect(db.clinicProfile.nomeClinica).toBe('Clínica Nova');
    expect(db.patients).toEqual([]);
    expect(db.memberships.some((m) => m.tenant_id === TENANT_ID && m.user_id === 'user-saas-1')).toBe(true);
  });

  it('não reinicializa tenant já bootstrapado', async () => {
    await bootstrapSaasTenantLocalDb({
      id: 'user-saas-1',
      tenantId: TENANT_ID,
      authMode: 'saas',
      name: 'Paulo',
      email: 'a@b.com',
      role: 'admin',
      isMaster: true,
    }, { tenantSnapshot: { trade_name: 'Primeira' } });

    withDb((db) => {
      db.collaborators.push({
        id: 'col-local',
        status: 'ativo',
        nomeCompleto: 'Colaborador local',
        email: 'local@test.com',
      });
      return db;
    });

    const again = await bootstrapSaasTenantLocalDb({
      id: 'user-saas-1',
      tenantId: TENANT_ID,
      authMode: 'saas',
      name: 'Paulo',
      email: 'a@b.com',
      role: 'admin',
      isMaster: true,
    });

    expect(again).toBe(false);
    expect(loadDb().collaborators.some((c) => c.id === 'col-local')).toBe(true);
  });
});
