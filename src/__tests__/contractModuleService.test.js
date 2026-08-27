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
  finalizeGeneratedContract,
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
      db.clinicDocumentation = {
        cnpj: '12345678000199',
        responsavelTecnico: 'Dr. Responsável Teste',
        conselhoRegionalNumero: 'CRO-MG 12345',
      };
      db.clinicAddresses = [{
        principal: true,
        logradouro: 'Rua Clínica',
        numero: '1',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        uf: 'MG',
        cep: '30100000',
      }];
      db.patients = [{
        id: 'pat-1',
        tenant_id: 'tenant-1',
        full_name: 'Paciente Contrato',
        cpf: '52998224725',
        birth_date: '1990-01-01',
        sex: 'M',
      }];
      db.patientAddresses = [{
        patient_id: 'pat-1',
        principal: true,
        logradouro: 'Rua Paciente',
        numero: '10',
        bairro: 'Savassi',
        cidade: 'Belo Horizonte',
        uf: 'MG',
      }];
      db.crmBudgets = [{
        id: 'budget-1',
        title: 'Restauração',
        patientId: 'pat-1',
        leadId: 'lead-1',
        status: 'APROVADO',
        totalValue: 5000,
        paymentMethod: 'À vista',
        itemsJson: [{ description: 'Restauração', value: 5000 }],
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

  it('bloqueia edição após assinatura e vincula orçamento', async () => {
    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const draft = createContractDraft(user, {
      quoteSource: 'crm_budget',
      quoteId: 'budget-1',
      patientId: 'pat-1',
      templateId: tpl.id,
    });
    const finalized = finalizeGeneratedContract(user, draft.id);
    const signed = await signContractOnScreen(user, finalized.id, {
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

  it('snapshot financeiro vincula parcelas pelo budgetId, não pelo appointmentId', () => {
    withDb((db) => {
      db.appointments = [{ id: 'apt-clinical', patientId: 'pat-1', tenant_id: 'tenant-1' }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-clinical',
        patientId: 'pat-1',
        budget: {
          id: 'budget-clinical-1',
          budgetNumber: 'ORC-001',
          status: 'APROVADO',
          totalValue: 5000,
          procedures: [{ name: 'Restauração', quantity: 1, unitValue: 5000, totalValue: 5000 }],
          paymentOptions: [{ id: 'pay-1', accepted: true, type: 'a_vista', total: 5000 }],
        },
      }];
      db.financings = [{
        id: 'fin-1',
        tenant_id: 'tenant-1',
        patient_id: 'pat-1',
        budget_id: 'budget-clinical-1',
        entry_amount: 1000,
        installments_count: 4,
        interest_rate: 0,
        total_value: 5000,
        status: 'active',
      }];
      db.accountsReceivable = [
        {
          id: 'ar-wrong',
          tenant_id: 'tenant-1',
          patient_id: 'pat-1',
          origin_id: 'apt-clinical',
          description: 'Parcela errada',
          net_amount: 999,
          status: 'open',
        },
        {
          id: 'ar-correct',
          tenant_id: 'tenant-1',
          patient_id: 'pat-1',
          origin_id: 'budget-clinical-1',
          budget_id: 'budget-clinical-1',
          financing_id: 'fin-1',
          description: 'Parcela 1/4',
          net_amount: 1000,
          installment_number: 1,
          total_installments: 4,
          status: 'open',
        },
      ];
    });

    const tpl = withDb((db) => db.contractTemplates.find((t) => t.type === 'system_default'));
    const row = createContractDraft(user, {
      quoteSource: 'clinical_budget',
      quoteId: 'apt-clinical',
      patientId: 'pat-1',
      budgetId: 'budget-clinical-1',
      templateId: tpl.id,
      skipHashtagValidation: true,
      editedHtml: '<p>Contrato</p>',
    });

    expect(row.financialSnapshotJson?.budgetId).toBe('budget-clinical-1');
    expect(row.financialSnapshotJson?.parcelas).toHaveLength(1);
    expect(row.financialSnapshotJson?.parcelas[0]?.description).toBe('Parcela 1/4');
    expect(row.financialSnapshotJson?.financiamentos).toHaveLength(1);
    expect(row.metadata?.attachedTcleIds).toEqual([]);
  });
});
