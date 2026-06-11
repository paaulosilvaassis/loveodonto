import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  listProviders,
  saveProvider,
  savePlan,
  saveGuide,
  createBillingBatch,
  recordReceipt,
  listGlosas,
  GUIDE_STATUS,
} from '../services/convenioService.js';
import { getConvenioDashboard } from '../services/convenioDashboardService.js';

const user = { id: 'user-1', role: 'admin', tenant_id: 'tenant-1' };

describe('Módulo Convênios', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
      db.patients = [{ id: 'p1', full_name: 'Maria Silva', tenant_id: 'tenant-1' }];
    });
  });

  it('seeds operadoras e cria guia TISS', () => {
    const providers = listProviders('tenant-1');
    expect(providers.length).toBeGreaterThanOrEqual(5);

    const provider = saveProvider(user, { name: 'Teste Odonto', tenant_id: 'tenant-1' });
    const plan = savePlan(user, { provider_id: provider.id, name: 'Plano Ouro', tenant_id: 'tenant-1' });
    expect(plan.name).toBe('Plano Ouro');

    const guide = saveGuide(user, {
      tenant_id: 'tenant-1',
      patient_id: 'p1',
      provider_id: provider.id,
      plan_id: plan.id,
      procedureName: 'Restauração',
      professional_name: 'Dra Ana',
      tableValue: 200,
      repasseValue: 150,
      status: GUIDE_STATUS.FECHADA,
    });
    expect(guide.procedureName).toBe('Restauração');

    const dash = getConvenioDashboard('tenant-1');
    expect(dash.kpis.guiasEmitidas).toBeGreaterThanOrEqual(1);
  });

  it('gera glosa automaticamente quando recebimento tem diferença', () => {
    const provider = listProviders('tenant-1')[0];
    const guide = saveGuide(user, {
      tenant_id: 'tenant-1',
      patient_id: 'p1',
      provider_id: provider.id,
      procedureName: 'Consulta',
      tableValue: 100,
      repasseValue: 100,
      status: GUIDE_STATUS.FECHADA,
    });

    const batch = createBillingBatch(user, {
      tenant_id: 'tenant-1',
      provider_id: provider.id,
      competence: '2026-06',
      guideIds: [guide.id],
    });

    recordReceipt(user, {
      tenant_id: 'tenant-1',
      provider_id: provider.id,
      batch_id: batch.id,
      expectedAmount: 100,
      receivedAmount: 85,
    });

    const glosas = listGlosas('tenant-1');
    expect(glosas.length).toBe(1);
    expect(glosas[0].glosaAmount).toBe(15);
  });
});
