/**
 * @module domain/contracts/fixtures/contract-v2.fixtures
 * @description Fixtures fictícias determinísticas — Phase 10.5.
 * Nenhum dado real de paciente/clínica/orçamento.
 */

import type { TenantId } from '../contract.ids.js';
import {
  createContractBudgetSnapshot,
  createContractClinicSnapshot,
  createContractFinancialSnapshot,
  createContractGuardianSnapshot,
  createContractOdontogramSnapshot,
  createContractPatientSnapshot,
  createContractProfessionalSnapshot,
  createContractSignerSnapshot,
  createContractTreatmentSnapshot,
} from '../snapshots/contract-snapshot.factories.js';
import { createEmptyContentSchema, contentSchemaToHtml } from '../templates/contract-template-content.schema.js';
import type { ContractTemplate, ContractTemplateVersion } from '../templates/contract-template.types.js';
import { createDefaultTemplateRequirements } from '../templates/contract-template.types.js';
import type { ContractGenerationContext } from '../generation/contract-generation.types.js';
import type { Contract } from '../contract.types.js';

export const DEMO_TENANT_ID = 'tenant_demo_contracts_v2' as TenantId;

export const demoClinic = createContractClinicSnapshot({
  legalName: 'Clínica Odontológica Demonstração Ltda',
  tradeName: 'Clínica Demo V2',
  cnpjMasked: '00.000.000/0001-00',
  addressFull: 'Rua Exemplo, 100 — Centro — São Paulo/SP',
  phone: '(11) 3000-0000',
  email: 'contato@clinica-demo.example',
  responsibleProfessionalName: 'Dra. Maria Exemplo',
  responsibleProfessionalCro: 'CRO XX 00000',
}).snapshot;

export const demoPatient = createContractPatientSnapshot({
  patientId: 'patient_demo_001',
  fullName: 'João da Silva',
  documentType: 'CPF',
  documentNumberMasked: '***.***.***-**',
  birthDate: '1990-01-01',
  email: 'paciente.demo@example.com',
  phone: '(11) 90000-0000',
  addressFull: 'Av. Demonstração, 200 — São Paulo/SP',
  maritalStatus: 'Solteiro(a)',
}).snapshot;

export const demoGuardian = createContractGuardianSnapshot({
  patientId: 'guardian_demo_001',
  fullName: 'Ana Responsável Demo',
  documentNumberMasked: '***.***.***-**',
  relationship: 'Mãe',
  phone: '(11) 91111-1111',
  email: 'responsavel.demo@example.com',
}).snapshot;

export const demoProfessional = createContractProfessionalSnapshot({
  professionalId: 'pro_demo_001',
  name: 'Dra. Maria Exemplo',
  cro: 'CRO XX 00000',
  specialty: 'Ortodontia',
}).snapshot;

export const demoBudget = createContractBudgetSnapshot({
  budgetId: 'budget_demo_001',
  budgetNumber: 'ORC-DEMO-001',
  quoteSource: 'clinical_budget',
  total: 12500,
  discountTotal: 0,
  finalTotal: 12500,
  currency: 'BRL',
  validUntil: '2026-08-31',
  notes: 'Orçamento demonstrativo — sem valor jurídico.',
  items: [{
    procedureCode: 'ORTO-01',
    procedureName: 'Ortodontia corretiva',
    quantity: 1,
    unitPrice: 12500,
    finalPrice: 12500,
  }],
}).snapshot;

export const demoTreatment = createContractTreatmentSnapshot({
  treatmentPlanId: 'tp_demo_001',
  summary: 'Tratamento ortodôntico demonstrativo.',
  items: demoBudget.items,
}).snapshot;

export const demoOdontogram = createContractOdontogramSnapshot({
  patientId: demoPatient.patientId,
  summary: 'Odontograma demonstrativo capturado em 01/08/2026.',
  capturedAt: '2026-08-01T10:00:00.000Z',
  imageFileId: 'file_odontogram_demo',
}).snapshot;

export const demoFinancial = createContractFinancialSnapshot({
  budgetTotal: 12500,
  contractTotal: 12500,
  downPayment: 2500,
  financedAmount: 10000,
  installmentCount: 20,
  installmentValue: 500,
  interestRate: 0,
  paymentMethods: ['PIX', 'Cartão', 'Boleto'],
  financialConditionsText: 'Entrada de R$ 2.500,00 + 20 parcelas de R$ 500,00.',
  currency: 'BRL',
  capturedAt: '2026-08-03T12:00:00.000Z',
}).snapshot;

export const demoSigners = [
  createContractSignerSnapshot({
    role: 'patient',
    name: demoPatient.fullName,
    required: true,
    order: 1,
    documentNumberMasked: demoPatient.documentNumberMasked,
  }).snapshot,
  createContractSignerSnapshot({
    role: 'clinic',
    name: demoClinic.legalName,
    required: true,
    order: 2,
  }).snapshot,
  createContractSignerSnapshot({
    role: 'professional',
    name: demoProfessional.name,
    required: true,
    order: 3,
  }).snapshot,
];

export function createDemoPublishedTemplate(tenantId: TenantId = DEMO_TENANT_ID): {
  template: ContractTemplate;
  version: ContractTemplateVersion;
} {
  const schema = createEmptyContentSchema();
  const html = contentSchemaToHtml(schema);
  const templateId = 'tpl_demo_published';
  const versionId = 'tplv_demo_published';
  const now = '2026-08-01T00:00:00.000Z';
  const template: ContractTemplate = {
    id: templateId as ContractTemplate['id'],
    tenantId,
    name: 'Modelo Demo Serviço',
    description: 'Template fictício para testes Phase 10.5',
    documentType: 'SERVICE_CONTRACT',
    category: 'demo',
    templateStatus: 'PUBLISHED',
    currentVersionId: versionId as ContractTemplate['currentVersionId'],
    isDefault: true,
    requirements: {
      ...createDefaultTemplateRequirements(),
      requiresBudget: true,
      requiresFinancialPlan: true,
      requiresOdontogram: false,
      requiresGuardian: false,
    },
    createdBy: 'system',
    createdAt: now,
    updatedAt: now,
    rowVersion: 1,
  };
  const version: ContractTemplateVersion = {
    id: versionId as ContractTemplateVersion['id'],
    tenantId,
    templateId: templateId as ContractTemplateVersion['templateId'],
    versionNumber: 1,
    versionLabel: 'v1',
    contentSchema: schema,
    contentHtml: html,
    contentText: 'demo',
    variablesSchema: [],
    status: 'PUBLISHED',
    publishedBy: 'system',
    publishedAt: now,
    lockedAt: now,
    createdBy: 'system',
    createdAt: now,
    changeSummary: 'Publicação demo',
    rowVersion: 1,
  };
  return { template, version };
}

export function createDemoContractDraft(tenantId: TenantId = DEMO_TENANT_ID): Contract {
  return {
    id: 'ctr_demo_001' as Contract['id'],
    tenantId,
    contractNumber: 'CTR-2026-000001',
    documentType: 'SERVICE_CONTRACT',
    title: 'Contrato Demo Ortodontia',
    patientId: demoPatient.patientId,
    budgetId: demoBudget.budgetId,
    origin: 'MANUAL',
    status: 'DRAFT',
    createdBy: 'user_demo',
    createdAt: '2026-08-03T12:00:00.000Z',
    updatedAt: '2026-08-03T12:00:00.000Z',
    rowVersion: 1,
    metadata: {
      templateId: 'tpl_demo_published',
      templateVersionId: 'tplv_demo_published',
      requirements: createDefaultTemplateRequirements(),
    },
  };
}

export function createDemoGenerationContext(
  contract: Contract,
  overrides: Partial<ContractGenerationContext> = {},
): ContractGenerationContext {
  const { template, version } = createDemoPublishedTemplate(contract.tenantId);
  return {
    tenantId: contract.tenantId,
    contract,
    template,
    templateVersion: version,
    patient: demoPatient,
    clinic: demoClinic,
    professional: demoProfessional,
    budget: demoBudget,
    treatment: demoTreatment,
    odontogram: demoOdontogram,
    financial: demoFinancial,
    signers: demoSigners,
    generationReason: 'INITIAL',
    actor: { userId: 'user_demo', permissions: ['contracts:create', 'contracts:update_draft', 'contracts:view', 'contracts:review', 'contracts:approve', 'contracts:cancel'] },
    generatedAt: '2026-08-03T12:00:00.000Z',
    requirements: template.requirements,
    signaturesStarted: false,
    ...overrides,
  };
}
