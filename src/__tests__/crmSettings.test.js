import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  ensureCrmSettingsForTenant,
  listLeadSourcesForTenant,
  saveLeadSourcesForTenant,
  getCommercialGoalsSettings,
  saveCommercialGoalsSettings,
  getFollowUpSettings,
  getConversionSettings,
  listAutomationsForTenant,
} from '../services/crmSettingsService.js';

const user = { id: 'user-1', role: 'admin', tenant_id: 'tenant-1' };

describe('CRM Settings Service', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica Teste', status: 'active' }];
    });
  });

  it('faz seed de configurações por tenant', () => {
    ensureCrmSettingsForTenant(user);
    const sources = listLeadSourcesForTenant('tenant-1');
    expect(sources.length).toBeGreaterThan(5);
    expect(getFollowUpSettings('tenant-1').enabled).toBe(true);
    expect(getConversionSettings('tenant-1').manualEnabled).toBe(true);
    expect(listAutomationsForTenant('tenant-1').length).toBeGreaterThan(0);
  });

  it('salva origens personalizadas', () => {
    ensureCrmSettingsForTenant(user);
    const saved = saveLeadSourcesForTenant(user, [
      { label: 'TikTok', isActive: true },
      { label: 'Indicação VIP', isActive: true },
    ]);
    expect(saved).toHaveLength(2);
    expect(saved[0].key).toBeTruthy();
    const list = listLeadSourcesForTenant('tenant-1');
    expect(list.some((s) => s.label === 'TikTok')).toBe(true);
  });

  it('salva metas comerciais estendidas', () => {
    saveCommercialGoalsSettings(user, {
      leadsGoal: 120,
      appointmentsGoal: 80,
      attendancesGoal: 55,
      revenueGoal: 200000,
    });
    const goals = getCommercialGoalsSettings('tenant-1');
    expect(goals.leadsGoal).toBe(120);
    expect(goals.appointmentsGoal).toBe(80);
    expect(goals.attendancesGoal).toBe(55);
    expect(goals.revenueGoal).toBe(200000);
  });
});
