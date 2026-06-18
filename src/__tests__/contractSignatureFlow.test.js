import { describe, expect, it, beforeEach } from 'vitest';
import { initDb, resetDb, withDb } from '../db/index.js';
import { CONTRACT_STATUS } from '../contracts/contractConstants.js';
import { BUDGET_STATUS } from '../services/clinicalBudgetConstants.js';
import {
  canSendContractForSignature,
  buildSignatureSendFormDefaults,
  sendContractForDigitalSignature,
} from '../services/contractSignatureFlowService.js';
import { buildSignatureEmailContent } from '../services/signatureEmailService.js';
import { mapWebhookEventToContractStatus } from '../services/signatureProviderService.js';
import { SIGNATURE_WEBHOOK_EVENTS } from '../contracts/contractConstants.js';

describe('contractSignatureFlow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetDb();
    await initDb();
    withDb((db) => {
      db.tenants = [{ id: 'tenant-1', name: 'Clínica', status: 'active' }];
      db.clinicProfile = {
        id: 'clinic-1',
        nomeFantasia: 'Love Odonto',
        razaoSocial: 'Love Odonto LTDA',
        email: 'contato@loveodonto.com',
      };
      db.clinicDocumentation = {
        cnpj: '12345678000199',
        responsavelTecnico: 'Dr. RT',
        conselhoRegionalNumero: 'CRO-MG 99999',
      };
      db.clinicAddresses = [{
        principal: true,
        logradouro: 'Rua A',
        numero: '100',
        bairro: 'Centro',
        cidade: 'Belo Horizonte',
        uf: 'MG',
      }];
      db.clinicPhones = [{ principal: true, ddd: '31', numero: '33334444' }];
      db.patients = [{
        id: 'p1',
        tenant_id: 'tenant-1',
        full_name: 'Maria Silva',
        cpf: '52998224725',
        email: 'maria@email.com',
        birth_date: '1990-01-01',
      }];
      db.patientAddresses = [{
        patient_id: 'p1',
        principal: true,
        logradouro: 'Rua B',
        numero: '50',
        cidade: 'Belo Horizonte',
        uf: 'MG',
      }];
      db.appointments = [{ id: 'apt-1', patientId: 'p1', tenant_id: 'tenant-1' }];
      db.clinicalAppointments = [{
        appointmentId: 'apt-1',
        patientId: 'p1',
        budget: {
          id: 'budget-1',
          budgetNumber: 'ORC-001',
          status: BUDGET_STATUS.APROVADO,
          totalValue: 25000,
          planName: 'Restaurações',
          procedures: [{
            name: 'Restauração em resina',
            quantity: 1,
            unitValue: 25000,
            totalValue: 25000,
          }],
          paymentOptions: [{ id: 'pay-1', accepted: true, type: 'a_vista', total: 25000 }],
        },
      }];
      db.generatedContracts = [{
        id: 'ctr-1',
        clinicId: 'clinic-1',
        patientId: 'p1',
        quoteId: 'apt-1',
        quoteSource: 'clinical_budget',
        budgetId: 'budget-1',
        contractNumber: 'CTR-001',
        status: CONTRACT_STATUS.GENERATED,
        renderedHtml: '<p>Contrato teste</p>',
        finalContent: '<p>Contrato teste com #pacienteNomeCompleto</p>',
        metadata: { attachedTcleIds: [] },
      }];
      db.contractSettings = [{
        clinicId: 'clinic-1',
        tenant_id: 'tenant-1',
        settings: { signatureProvider: 'internal', signLinkExpiryDays: 7 },
      }];
    });
  });

  const approvedBudget = {
    id: 'budget-1',
    status: BUDGET_STATUS.APROVADO,
    totalValue: 25000,
    paymentOptions: [{ id: 'pay-1', accepted: true, type: 'a_vista' }],
  };

  it('canSendContractForSignature valida requisitos', () => {
    expect(canSendContractForSignature({
      contract: { status: CONTRACT_STATUS.GENERATED },
      budget: approvedBudget,
    })).toBe(true);

    expect(canSendContractForSignature({
      contract: { status: CONTRACT_STATUS.SENT },
      budget: approvedBudget,
    })).toBe(false);

    expect(canSendContractForSignature({
      contract: { status: CONTRACT_STATUS.GENERATED },
      budget: { ...approvedBudget, status: BUDGET_STATUS.RASCUNHO },
    })).toBe(false);
  });

  it('buildSignatureSendFormDefaults preenche dados do paciente', () => {
    const defaults = buildSignatureSendFormDefaults({
      patientId: 'p1',
      professional: { email: 'dentista@clinica.com' },
      settings: { technicalResponsibleEmail: '', signLinkExpiryDays: 15 },
    });
    expect(defaults.patientName).toBe('Maria Silva');
    expect(defaults.patientEmail).toBe('maria@email.com');
    expect(defaults.linkExpiryDays).toBe(15);
  });

  it('sendContractForDigitalSignature cria solicitação e muda status para sent', async () => {
    const user = { id: 'user-1', tenant_id: 'tenant-1', name: 'Admin' };
    const result = await sendContractForDigitalSignature(user, 'ctr-1', {
      patientName: 'Maria Silva',
      patientCpf: '12345678901',
      patientEmail: 'maria@email.com',
      patientPhone: '(11) 99999-9999',
      clinicEmail: 'contato@loveodonto.com',
      technicalEmail: 'rt@clinica.com',
      linkExpiryDays: 7,
      signatureType: 'electronic_simple',
      treatmentName: 'Implantes',
    });

    expect(result.request).toBeTruthy();
    expect(result.signUrl).toContain('/assinatura/');

    withDb((db) => {
      const contract = db.generatedContracts.find((c) => c.id === 'ctr-1');
      expect(contract.status).toBe(CONTRACT_STATUS.SENT);
      expect(db.contractSignatureRequests.length).toBeGreaterThan(0);
      expect(db.contractSignatureAudits.length).toBeGreaterThan(0);
    });
  });

  it('buildSignatureEmailContent monta assunto e corpo', () => {
    const email = buildSignatureEmailContent({
      patientName: 'Maria',
      treatmentName: 'Implantes',
      clinicName: 'Love Odonto',
      signUrl: 'https://app/assinatura/token',
      expiresAt: '2026-06-23T12:00:00.000Z',
    });
    expect(email.subject).toContain('Love Odonto');
    expect(email.textBody).toContain('Maria');
    expect(email.htmlBody).toContain('Assinar contrato');
  });

  it('mapWebhookEventToContractStatus mapeia eventos', () => {
    expect(mapWebhookEventToContractStatus(SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_COMPLETED))
      .toBe(CONTRACT_STATUS.COMPLETED);
    expect(mapWebhookEventToContractStatus(SIGNATURE_WEBHOOK_EVENTS.DOCUMENT_REFUSED))
      .toBe(CONTRACT_STATUS.REFUSED);
  });
});
