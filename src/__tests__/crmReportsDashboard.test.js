import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { createLead } from '../services/crmService.js';
import { ensurePipelineStagesForTenant } from '../services/crmPipelineStageService.js';
import {
  getCrmExecutiveDashboard,
  saveCrmCommercialGoals,
  getCrmCommercialGoals,
} from '../services/crmReportsService.js';

const user = { id: 'user-1', role: 'admin', tenant_id: 'tenant-1' };

describe('Dashboard gerencial CRM', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica Teste', status: 'active' }];
    });
    ensurePipelineStagesForTenant(user);
  });

  it('retorna resumo comercial, alertas e funil filtrados por tenant', () => {
    createLead(user, { name: 'Lead A', phone: '11999990001', estimatedValue: 5000 });
    createLead(user, { name: 'Lead B', phone: '11999990002', estimatedValue: 3000, stageKey: 'perdido', lossReason: 'Preço alto' });

    const dash = getCrmExecutiveDashboard({ tenantId: 'tenant-1', range: '30d' });
    expect(dash.resumoComercial.leads).toBe(2);
    expect(dash.resumoComercial).toMatchObject({
      avaliacoes: expect.any(Number),
      comparecimentos: expect.any(Number),
      fechamentos: expect.any(Number),
      conversao: expect.any(Number),
      receita: expect.any(Number),
    });
    expect(Array.isArray(dash.alerts)).toBe(true);
    expect(dash.funnel.funnelSteps.length).toBeGreaterThan(0);
    expect(dash.financial).toMatchObject({
      oportunidadesAbertas: expect.any(Number),
      orcamentosEnviados: expect.any(Number),
      valorNegociacao: expect.any(Number),
    });
    expect(dash.conversionTimes).toHaveProperty('leadParaPrimeiroContato');
  });

  it('salva e lê metas comerciais estendidas por tenant', () => {
    saveCrmCommercialGoals(user, {
      leadsGoal: 120,
      revenueGoal: 150000,
      closingsGoal: 30,
      conversionGoal: 22,
    });
    const goals = getCrmCommercialGoals('tenant-1');
    expect(goals.leadsGoal).toBe(120);
    expect(goals.revenueGoal).toBe(150000);
    expect(goals.closingsGoal).toBe(30);
    expect(goals.conversionGoal).toBe(22);

    const dash = getCrmExecutiveDashboard({ tenantId: 'tenant-1', range: '30d' });
    expect(dash.goals.leadsGoal).toBe(120);
    expect(dash.goals.revenueGoal).toBe(150000);
    expect(dash.goals.closingsGoal).toBe(30);
    expect(dash.goals.conversionGoal).toBe(22);
    expect(dash.goals).toHaveProperty('closingsPercent');
    expect(dash.goals).toHaveProperty('conversionPercent');
  });
});
