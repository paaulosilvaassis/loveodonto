import { describe, expect, it } from 'vitest';
import { buildProfessionalContractHtml } from '../components/clinical/contract/professionalContractTemplate.js';
import { LEGAL_CONTRACT_TEXTS } from '../components/clinical/contract/professionalContractClauses.js';

const mockContext = {
  meta: {
    contractNumber: 'CTR-000123',
    issueDate: '15/06/2026',
    issueDateExtenso: '15 de junho de 2026',
    budgetNumber: 'ORC-001',
    city: 'São Paulo - SP',
    clinicForumCity: 'São Paulo - SP',
  },
  clinic: {
    logoUrl: '',
    name: 'Clínica Sorriso',
    fantasyName: 'Sorriso Odonto',
    legalName: 'Sorriso Odonto Ltda',
    cnpj: '12.345.678/0001-90',
    address: 'Rua das Flores, 100, Centro, São Paulo/SP',
    city: 'São Paulo',
    state: 'SP',
    clinicForumCity: 'São Paulo - SP',
    phone: '(11) 99999-9999',
    email: 'contato@sorriso.com',
    legalRepresentative: 'Dr. Admin',
    technicalResponsible: 'Dr. João Silva',
  },
  patient: {
    name: 'Maria Santos',
    cpf: '123.456.789-00',
    rg: '12.345.678-9',
    birthDate: '01/01/1990',
    address: 'Av. Paulista, 1000',
    phone: '(11) 98888-8888',
    email: 'maria@email.com',
    guardian: '',
  },
  professional: {
    name: 'Dr. João Silva',
    cro: 'CRO-SP 12345',
    specialty: 'Implantodontia',
  },
  treatment: {
    planName: 'Reabilitação oral completa',
    typeLabel: 'Implante',
    startDate: '15/06/2026',
    endDate: '15/12/2026',
    notes: 'Manutenção periódica obrigatória.',
  },
  procedures: [{
    name: 'Protocolo Total Superior',
    category: 'Prótese',
    quantity: 1,
    unitValue: 25000,
    totalValue: 25000,
  }],
  financial: {
    originalValue: 25000,
    originalValueFormatted: 'R$ 25.000,00',
    discount: 0,
    discountFormatted: 'R$ 0,00',
    finalValue: 25000,
    finalValueFormatted: 'R$ 25.000,00',
    finalValueWords: 'vinte e cinco mil reais',
    paymentTitle: 'PIX / À vista',
    paymentMethodLabel: 'PIX',
    paymentType: 'a_vista',
    summaryLines: [
      { label: 'Valor do tratamento', value: 'R$ 25.000,00' },
      { label: 'Valor final do contrato', value: 'R$ 25.000,00' },
      { label: 'Forma de pagamento', value: 'PIX' },
    ],
    schedule: [{
      parcelLabel: 'Pagamento à vista',
      label: 'Pagamento à vista',
      dueDateFormatted: '15/06/2026',
      amountFormatted: 'R$ 25.000,00',
      paymentMethod: 'PIX',
      statusLabel: 'Previsto',
      isEntry: false,
    }],
    installmentCount: 0,
    installmentValue: 0,
    installmentValueFormatted: '',
  },
  legalTexts: LEGAL_CONTRACT_TEXTS,
  treatmentWarranties: [],
};

describe('professionalContractTemplate', () => {
  it('gera contrato jurídico com estrutura de escritório', () => {
    const html = buildProfessionalContractHtml(mockContext);

    expect(html).toContain('Contrato de Prestação de Serviços Odontológicos');
    expect(html).toContain('CTR-000123');
    expect(html).toContain('doravante denominada CONTRATADA');
    expect(html).toContain('doravante denominado CONTRATANTE');
    expect(html).toContain('CLÁUSULA PRIMEIRA — DO OBJETO');
    expect(html).toContain('CLÁUSULA SEGUNDA — DOS PROCEDIMENTOS CONTRATADOS');
    expect(html).toContain('I</strong> — Protocolo Total Superior');
    expect(html).toContain('CLÁUSULA QUARTA — DAS CONDIÇÕES FINANCEIRAS');
    expect(html).toContain('vinte e cinco mil reais');
    expect(html).toContain('CLÁUSULA QUINTA — DO CRONOGRAMA FINANCEIRO');
    expect(html).toContain('Forma de pagamento');
    expect(html).toContain('Status');
    expect(html).toContain('Responsável Técnico');
    expect(html).toContain('signature-grid-3');
    expect(html).toContain('signature-grid-2');
    expect(html).toContain('signature-place');
    expect(html).toContain('Representante Legal da Contratada');
    expect(html).toContain('comarca de São Paulo - SP');
    expect(html).toContain('renúncia expressa');
    expect(html).toContain('Times New Roman');
    expect(html).not.toContain('Love Odonto');
    expect(html).not.toContain('Resumo Executivo');
    expect(html).not.toContain('party-box');
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('exibe cronograma com parcelas numeradas e status', () => {
    const ctx = {
      ...mockContext,
      financial: {
        ...mockContext.financial,
        paymentType: 'cartao',
        paymentMethodLabel: 'Cartão de crédito',
        installmentCount: 2,
        summaryLines: [
          { label: 'Valor final do contrato', value: 'R$ 25.000,00' },
          { label: 'Quantidade de parcelas', value: '2' },
          { label: 'Valor de cada parcela', value: 'R$ 12.500,00' },
        ],
        schedule: [
          {
            parcelLabel: 'Parcela 01/02',
            dueDateFormatted: '15/07/2026',
            amountFormatted: 'R$ 12.500,00',
            paymentMethod: 'Cartão de crédito',
            statusLabel: 'A vencer',
            isEntry: false,
          },
          {
            parcelLabel: 'Parcela 02/02',
            dueDateFormatted: '15/08/2026',
            amountFormatted: 'R$ 12.500,00',
            paymentMethod: 'Cartão de crédito',
            statusLabel: 'A vencer',
            isEntry: false,
          },
        ],
      },
    };
    const html = buildProfessionalContractHtml(ctx);

    expect(html).toContain('Parcela 01/02');
    expect(html).toContain('Parcela 02/02');
    expect(html).toContain('A vencer');
    expect(html).toContain('Cartão de crédito');
  });
});
