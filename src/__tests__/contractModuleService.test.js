import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import {
  ensureContractsModuleSeeded,
  createContractDraft,
  isContractEditable,
  signContractOnScreen,
  hasSignedContractForQuote,
  getContractSettings,
  saveContractSettings,
} from '../services/contractModuleService.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';

const user = { id: 'user-1', name: 'Dr. Teste', role: 'admin', tenant_id: 'tenant-1' };

describe('contractModuleService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica Teste', status: 'active' }];
      db.clinicProfile = { id: 'clinic-1', razaoSocial: 'Clínica Teste' };
      db.clinicDocumentation = { cnpj: '12345678000199' };
      db.patients = [{
        id: 'pat-1',
        full_name: 'Paciente Contrato',
        cpf: '52998224725',
        birth_date: '1990-01-01',
        sex: 'M',
        tenant_id: 'tenant-1',
      }];
      db.crmBudgets = [{
        id: 'budget-1',
        title: 'Implante',
        patientId: 'pat-1',
        leadId: 'lead-1',
        status: 'APROVADO',
        totalValue: 5000,
        itemsJson: [{ description: 'Implante', value: 5000 }],
        createdAt: new Date().toISOString(),
      }];
      return db;
    });
    ensureContractsModuleSeeded();
  });

  it('cria rascunho com snapshots e hashtags resolvidas', () => {
    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const row = createContractDraft(user, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-1',
      patientId: 'pat-1',
      templateId: tpl.id,
    });
    expect(row.patientSnapshotJson?.full_name).toBe('Paciente Contrato');
    expect(row.totalValueSnapshot).toBe(5000);
    expect(row.documentHash).toBeTruthy();
    expect(isContractEditable(row)).toBe(true);
  });

  it('bloqueia edição após assinatura e vincula orçamento', () => {
    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const draft = createContractDraft(user, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-1',
      patientId: 'pat-1',
      templateId: tpl.id,
    });
    const signed = signContractOnScreen(user, draft.id, {
      signerName: 'Paciente Contrato',
      signerCpf: '52998224725',
      signatureImageDataUrl: 'data:image/png;base64,abc',
    });
    expect(signed.contract.status).toBe(CONTRACT_STATUS.SIGNED);
    expect(isContractEditable(signed.contract)).toBe(false);
    expect(hasSignedContractForQuote('budget-1', 'crm_budget')).toBe(true);
  });

  it('persiste configurações por clínica', () => {
    saveContractSettings(user, { contractRequiredBeforeTreatment: true, signLinkExpiryDays: 14 });
    const settings = getContractSettings(user);
    expect(settings.contractRequiredBeforeTreatment).toBe(true);
    expect(settings.signLinkExpiryDays).toBe(14);
  });
});
