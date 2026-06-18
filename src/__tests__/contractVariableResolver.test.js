import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import { TREATMENT_TYPES } from '../contracts/contractConstants.js';
import {
  resolveContractVariables,
  validateResolvedVariables,
  detectPartyModel,
  calcPatientAge,
  isEmptyVariableValue,
  findUnresolvedTagsInHtml,
} from '../contracts/contractVariableResolver.js';
import { validateContractGeneration } from '../services/contractValidationService.js';
import { PARTY_MODEL } from '../contracts/contractQualificationTemplates.js';

describe('contractVariableResolver', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
  });

  function seedBase(patientOverrides = {}) {
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
      db.clinicProfile = {
        id: 'clinic-1',
        razaoSocial: 'Love Odonto LTDA',
        nomeFantasia: 'Love Odonto',
        email: 'contato@loveodonto.com',
      };
      db.clinicDocumentation = {
        cnpj: '12345678000199',
        responsavelTecnico: 'Dr. RT',
        conselhoRegionalNumero: 'CRO-MG 77777',
      };
      db.clinicAddresses = [{
        principal: true,
        logradouro: 'Rua A',
        numero: '100',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        uf: 'MG',
        cep: '30100000',
      }];
      db.clinicPhones = [{ principal: true, ddd: '31', numero: '33334444' }];
      db.patients = [{
        id: 'p1',
        tenant_id: 'tenant-1',
        full_name: 'João Silva',
        cpf: '52998224725',
        birth_date: '1990-05-10',
        email: 'joao@email.com',
        ...patientOverrides,
      }];
      db.patientAddresses = [{
        patient_id: 'p1',
        principal: true,
        logradouro: 'Rua B',
        numero: '50',
        bairro: 'Savassi',
        cidade: 'Belo Horizonte',
        uf: 'MG',
      }];
      db.appointments = [{ id: 'apt-1', patientId: 'p1', tenant_id: 'tenant-1' }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        patientId: 'p1',
        budget: {
          id: 'budget-91a25275-uuid',
          budgetNumber: 'ORC-002',
          status: BUDGET_STATUS.APROVADO,
          totalValue: 25000,
          planName: 'Implantes',
          procedures: [{
            id: 'proc-1',
            name: 'Implante',
            quantity: 1,
            unitValue: 25000,
            totalValue: 25000,
            tooth: '36',
          }],
          paymentOptions: [{
            id: 'pay-1',
            type: 'a_vista',
            accepted: true,
            total: 25000,
            method: 'pix',
          }],
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      }];
    });
  }

  it('resolve variáveis obrigatórias sem expor IDs técnicos', () => {
    seedBase();
    const { map } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana', cro: '12345' },
      contractNumber: 'CTR-001',
    });

    expect(map['#clinicaCidadeEstado']).toBe('Belo Horizonte/MG');
    expect(map['#orcamento_numero']).toBe('ORC-002');
    expect(map['#orcamento_numero']).not.toContain('budget-');
    expect(map['#numeroContrato']).toMatch(/^CTR-/);
    expect(map['#totalContratoExtenso']).toContain('real');
    expect(isEmptyVariableValue(map['#procedimentos'])).toBe(false);
  });

  it('detecta menor sem responsável como pendência', () => {
    seedBase({ birth_date: '2015-01-01', guardian_full_name: '' });
    const { map, meta, missing } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
    });

    expect(meta.partyModel).toBe(PARTY_MODEL.WITH_RESPONSIBLE);
    expect(calcPatientAge('2015-01-01')).toBeLessThan(18);
    expect(missing.some((m) => m.tag === '#responsavelNomeCompleto')).toBe(true);
    expect(detectPartyModel({ birth_date: '2015-01-01' }).isMinor).toBe(true);
  });

  it('bloqueia orçamento sem procedimentos', () => {
    seedBase();
    withDb((db) => {
      db.clinicalAppointments[0].budget.procedures = [];
    });
    const { missing } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
    });
    expect(missing.some((m) => m.tag === '#procedimentos')).toBe(true);
  });

  it('bloqueia clínica sem cidade/estado no foro', () => {
    seedBase();
    withDb((db) => {
      db.clinicAddresses = [{ principal: true, logradouro: 'Rua X' }];
    });
    const { missing } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
    });
    expect(missing.some((m) => m.tag === '#clinicaCidadeEstado')).toBe(true);
  });

  it('exige TCLE para ortodontia', () => {
    seedBase();
    withDb((db) => {
      db.clinicalAppointments[0].budget.planName = 'Ortodontia com aparelho';
      db.clinicalAppointments[0].budget.procedures = [{
        name: 'Aparelho ortodôntico',
        quantity: 1,
        unitValue: 8000,
        totalValue: 8000,
      }];
      db.clinicalAppointments[0].budget.maintenanceMonths = 24;
    });
    const result = validateContractGeneration({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
      strict: true,
    });
    expect(result.meta.treatmentTypes).toContain(TREATMENT_TYPES.ORTODONTIA);
    expect(result.requiredTcles.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it('findUnresolvedTagsInHtml detecta hashtag vazia no template', () => {
    const map = { '#pacienteNomeCompleto': 'João', '#pacienteCPF': '' };
    const html = '<p>#pacienteNomeCompleto — CPF #pacienteCPF</p>';
    expect(findUnresolvedTagsInHtml(html, map)).toContain('#pacienteCPF');
  });

  it('validateResolvedVariables rejeita paciente sem CPF no modelo direto', () => {
    seedBase({ cpf: '' });
    const { map, meta } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
    });
    const missing = validateResolvedVariables(map, meta);
    expect(missing.some((m) => m.tag === '#pacienteCPF')).toBe(true);
  });

  it('foro usa cidade/UF da clínica (Belo Horizonte/MG)', () => {
    seedBase();
    const { map } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
    });
    expect(map['#clinicaCidadeEstado']).toBe('Belo Horizonte/MG');
    expect(map['#clinicaCidadeEstado']).not.toMatch(/São Paulo|Rio de Janeiro/i);
  });

  it('alerta divergência de valor entre orçamento e condição escolhida', () => {
    seedBase();
    withDb((db) => {
      db.clinicalAppointments[0].budget.paymentOptions[0].total = 20000;
    });
    const result = validateContractGeneration({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
      strict: false,
    });
    expect(result.meta.valueMismatch).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('exige modelo com responsável para menor de idade', () => {
    seedBase({ birth_date: '2015-01-01' });
    const { party } = resolveContractVariables({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
    });
    expect(party.model).toBe(PARTY_MODEL.WITH_RESPONSIBLE);
    const result = validateContractGeneration({
      quoteSource: 'clinical_budget',
      quoteId: 'apt-1',
      patientId: 'p1',
      currentUser: { name: 'Dr. Ana' },
      strict: true,
    });
    expect(result.ok).toBe(false);
    expect(result.missing.some((m) => m.group === 'responsavel')).toBe(true);
  });
});
