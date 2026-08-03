/**
 * @module domain/contracts/templates/contract-template-variables.catalog
 * @description Catálogo tipado de variáveis de templates — Phase 10.4.
 */

import type { ContractDocumentType } from '../contract.constants.js';

export type ContractTemplateVariableDataType =
  | 'string'
  | 'number'
  | 'currency'
  | 'date'
  | 'boolean'
  | 'html'
  | 'image'
  | 'table'
  | 'list';

export type ContractTemplateVariableSource =
  | 'clinic'
  | 'patient'
  | 'guardian'
  | 'professional'
  | 'budget'
  | 'financial'
  | 'treatment'
  | 'odontogram'
  | 'contract'
  | 'signature'
  | 'custom';

export interface ContractTemplateVariableDefinition {
  key: string;
  label: string;
  description: string;
  dataType: ContractTemplateVariableDataType;
  source: ContractTemplateVariableSource;
  requiredByDefault: boolean;
  sensitive: boolean;
  previewValue: unknown;
  allowedInDocumentTypes?: ContractDocumentType[];
}

function def(
  partial: ContractTemplateVariableDefinition,
): ContractTemplateVariableDefinition {
  return partial;
}

/** Catálogo mínimo Phase 10.4 — valores de preview fictícios apenas. */
export const CONTRACT_TEMPLATE_VARIABLE_CATALOG: ContractTemplateVariableDefinition[] = [
  def({
    key: 'clinic.legalName',
    label: 'Razão social',
    description: 'Razão social da clínica',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: true,
    sensitive: false,
    previewValue: 'Clínica Odontológica Demonstração Ltda',
  }),
  def({
    key: 'clinic.tradeName',
    label: 'Nome fantasia',
    description: 'Nome fantasia da clínica',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Clínica Odontológica Demonstração',
  }),
  def({
    key: 'clinic.cnpj',
    label: 'CNPJ',
    description: 'CNPJ da clínica',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: true,
    sensitive: true,
    previewValue: '00.000.000/0001-00',
  }),
  def({
    key: 'clinic.address.full',
    label: 'Endereço da clínica',
    description: 'Endereço completo',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Rua Exemplo, 100 — Centro — São Paulo/SP',
  }),
  def({
    key: 'clinic.phone',
    label: 'Telefone da clínica',
    description: 'Telefone principal',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '(11) 3000-0000',
  }),
  def({
    key: 'clinic.email',
    label: 'E-mail da clínica',
    description: 'E-mail institucional',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'contato@clinica-demo.example',
  }),
  def({
    key: 'clinic.responsibleProfessional.name',
    label: 'Responsável técnico',
    description: 'Nome do responsável técnico',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Dra. Maria Exemplo',
  }),
  def({
    key: 'clinic.responsibleProfessional.cro',
    label: 'CRO do responsável',
    description: 'CRO do responsável técnico',
    dataType: 'string',
    source: 'clinic',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'CRO XX 00000',
  }),
  def({
    key: 'clinic.logo',
    label: 'Logo da clínica',
    description: 'Referência segura de imagem',
    dataType: 'image',
    source: 'clinic',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '[logo-demo]',
  }),
  def({
    key: 'patient.name',
    label: 'Nome do paciente',
    description: 'Nome completo',
    dataType: 'string',
    source: 'patient',
    requiredByDefault: true,
    sensitive: true,
    previewValue: 'João da Silva',
  }),
  def({
    key: 'patient.cpf',
    label: 'CPF do paciente',
    description: 'CPF mascarado no preview',
    dataType: 'string',
    source: 'patient',
    requiredByDefault: true,
    sensitive: true,
    previewValue: '***.***.***-**',
  }),
  def({
    key: 'patient.rg',
    label: 'RG do paciente',
    description: 'Documento de identidade',
    dataType: 'string',
    source: 'patient',
    requiredByDefault: false,
    sensitive: true,
    previewValue: '**.***.***-*',
  }),
  def({
    key: 'patient.birthDate',
    label: 'Data de nascimento',
    description: 'Data de nascimento',
    dataType: 'date',
    source: 'patient',
    requiredByDefault: false,
    sensitive: true,
    previewValue: '01/01/1990',
  }),
  def({
    key: 'patient.age',
    label: 'Idade',
    description: 'Idade calculada',
    dataType: 'number',
    source: 'patient',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 36,
  }),
  def({
    key: 'patient.address.full',
    label: 'Endereço do paciente',
    description: 'Endereço completo',
    dataType: 'string',
    source: 'patient',
    requiredByDefault: false,
    sensitive: true,
    previewValue: 'Av. Demonstração, 200 — São Paulo/SP',
  }),
  def({
    key: 'patient.phone',
    label: 'Telefone do paciente',
    description: 'Telefone de contato',
    dataType: 'string',
    source: 'patient',
    requiredByDefault: false,
    sensitive: true,
    previewValue: '(11) 90000-0000',
  }),
  def({
    key: 'patient.email',
    label: 'E-mail do paciente',
    description: 'E-mail de contato',
    dataType: 'string',
    source: 'patient',
    requiredByDefault: false,
    sensitive: true,
    previewValue: 'paciente.demo@example.com',
  }),
  def({
    key: 'patient.maritalStatus',
    label: 'Estado civil',
    description: 'Estado civil',
    dataType: 'string',
    source: 'patient',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Solteiro(a)',
  }),
  def({
    key: 'guardian.name',
    label: 'Nome do responsável',
    description: 'Responsável legal',
    dataType: 'string',
    source: 'guardian',
    requiredByDefault: false,
    sensitive: true,
    previewValue: 'Ana Responsável Demo',
  }),
  def({
    key: 'guardian.cpf',
    label: 'CPF do responsável',
    description: 'CPF mascarado',
    dataType: 'string',
    source: 'guardian',
    requiredByDefault: false,
    sensitive: true,
    previewValue: '***.***.***-**',
  }),
  def({
    key: 'guardian.relationship',
    label: 'Parentesco',
    description: 'Relação com o paciente',
    dataType: 'string',
    source: 'guardian',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Mãe',
  }),
  def({
    key: 'guardian.phone',
    label: 'Telefone do responsável',
    description: 'Telefone',
    dataType: 'string',
    source: 'guardian',
    requiredByDefault: false,
    sensitive: true,
    previewValue: '(11) 91111-1111',
  }),
  def({
    key: 'guardian.email',
    label: 'E-mail do responsável',
    description: 'E-mail',
    dataType: 'string',
    source: 'guardian',
    requiredByDefault: false,
    sensitive: true,
    previewValue: 'responsavel.demo@example.com',
  }),
  def({
    key: 'professional.name',
    label: 'Nome do profissional',
    description: 'Dentista responsável',
    dataType: 'string',
    source: 'professional',
    requiredByDefault: true,
    sensitive: false,
    previewValue: 'Dra. Maria Exemplo',
  }),
  def({
    key: 'professional.cro',
    label: 'CRO do profissional',
    description: 'Registro profissional',
    dataType: 'string',
    source: 'professional',
    requiredByDefault: true,
    sensitive: false,
    previewValue: 'CRO XX 00000',
  }),
  def({
    key: 'professional.specialty',
    label: 'Especialidade',
    description: 'Especialidade odontológica',
    dataType: 'string',
    source: 'professional',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Ortodontia',
  }),
  def({
    key: 'budget.number',
    label: 'Número do orçamento',
    description: 'Identificador do orçamento',
    dataType: 'string',
    source: 'budget',
    requiredByDefault: true,
    sensitive: false,
    previewValue: 'ORC-DEMO-001',
  }),
  def({
    key: 'budget.issueDate',
    label: 'Data de emissão',
    description: 'Data do orçamento',
    dataType: 'date',
    source: 'budget',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '01/08/2026',
  }),
  def({
    key: 'budget.validUntil',
    label: 'Validade do orçamento',
    description: 'Data de validade',
    dataType: 'date',
    source: 'budget',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '31/08/2026',
  }),
  def({
    key: 'budget.total',
    label: 'Total bruto',
    description: 'Valor total sem desconto',
    dataType: 'currency',
    source: 'budget',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'R$ 12.500,00',
  }),
  def({
    key: 'budget.discount',
    label: 'Desconto',
    description: 'Valor de desconto',
    dataType: 'currency',
    source: 'budget',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'R$ 0,00',
  }),
  def({
    key: 'budget.finalTotal',
    label: 'Total final',
    description: 'Valor final do orçamento',
    dataType: 'currency',
    source: 'budget',
    requiredByDefault: true,
    sensitive: false,
    previewValue: 'R$ 12.500,00',
  }),
  def({
    key: 'budget.notes',
    label: 'Observações do orçamento',
    description: 'Notas',
    dataType: 'string',
    source: 'budget',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Orçamento demonstrativo — sem valor jurídico.',
  }),
  def({
    key: 'financial.downPayment',
    label: 'Entrada',
    description: 'Valor de entrada',
    dataType: 'currency',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'R$ 2.500,00',
  }),
  def({
    key: 'financial.financedAmount',
    label: 'Valor financiado',
    description: 'Saldo parcelado',
    dataType: 'currency',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'R$ 10.000,00',
  }),
  def({
    key: 'financial.installmentCount',
    label: 'Quantidade de parcelas',
    description: 'Número de parcelas',
    dataType: 'number',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 20,
  }),
  def({
    key: 'financial.installmentValue',
    label: 'Valor da parcela',
    description: 'Valor de cada parcela',
    dataType: 'currency',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'R$ 500,00',
  }),
  def({
    key: 'financial.interestRate',
    label: 'Taxa de juros',
    description: 'Taxa aplicada',
    dataType: 'string',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '0% a.m.',
  }),
  def({
    key: 'financial.paymentMethods',
    label: 'Formas de pagamento',
    description: 'Métodos aceitos',
    dataType: 'list',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'PIX, Cartão, Boleto',
  }),
  def({
    key: 'financial.dueDatesTable',
    label: 'Tabela de vencimentos',
    description: 'Tabela HTML de parcelas',
    dataType: 'html',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<table><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr><tr><td>1</td><td>10/09/2026</td><td>R$ 500,00</td></tr></table>',
  }),
  def({
    key: 'financial.conditionsText',
    label: 'Condições financeiras',
    description: 'Texto das condições',
    dataType: 'html',
    source: 'financial',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<p>Entrada de R$ 2.500,00 + 20 parcelas de R$ 500,00.</p>',
  }),
  def({
    key: 'treatment.summary',
    label: 'Resumo do tratamento',
    description: 'Resumo textual',
    dataType: 'string',
    source: 'treatment',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Tratamento ortodôntico demonstrativo.',
  }),
  def({
    key: 'treatment.itemsTable',
    label: 'Tabela de itens',
    description: 'Itens do tratamento',
    dataType: 'html',
    source: 'treatment',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<table><tr><th>Procedimento</th><th>Dente</th><th>Valor</th></tr><tr><td>Ortodontia</td><td>—</td><td>R$ 12.500,00</td></tr></table>',
  }),
  def({
    key: 'treatment.procedures',
    label: 'Procedimentos',
    description: 'Lista de procedimentos',
    dataType: 'list',
    source: 'treatment',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Ortodontia corretiva',
  }),
  def({
    key: 'treatment.teeth',
    label: 'Dentes',
    description: 'Dentes envolvidos',
    dataType: 'list',
    source: 'treatment',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Arcada completa',
  }),
  def({
    key: 'treatment.regions',
    label: 'Regiões',
    description: 'Regiões anatômicas',
    dataType: 'list',
    source: 'treatment',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Superior e inferior',
  }),
  def({
    key: 'odontogram.image',
    label: 'Imagem do odontograma',
    description: 'Referência segura',
    dataType: 'image',
    source: 'odontogram',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '[odontogram-demo]',
  }),
  def({
    key: 'odontogram.summary',
    label: 'Resumo do odontograma',
    description: 'Texto resumido',
    dataType: 'string',
    source: 'odontogram',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'Odontograma demonstrativo capturado em 01/08/2026.',
  }),
  def({
    key: 'odontogram.capturedAt',
    label: 'Captura do odontograma',
    description: 'Data/hora da captura',
    dataType: 'date',
    source: 'odontogram',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '01/08/2026 10:00',
  }),
  def({
    key: 'contract.number',
    label: 'Número do contrato',
    description: 'Identificador',
    dataType: 'string',
    source: 'contract',
    requiredByDefault: false,
    sensitive: false,
    previewValue: 'CTR-DEMO-001',
  }),
  def({
    key: 'contract.issueDate',
    label: 'Data de emissão do contrato',
    description: 'Emissão',
    dataType: 'date',
    source: 'contract',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '03/08/2026',
  }),
  def({
    key: 'contract.effectiveDate',
    label: 'Vigência',
    description: 'Início da vigência',
    dataType: 'date',
    source: 'contract',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '03/08/2026',
  }),
  def({
    key: 'contract.expirationDate',
    label: 'Expiração',
    description: 'Fim da vigência',
    dataType: 'date',
    source: 'contract',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '03/08/2027',
  }),
  def({
    key: 'contract.version',
    label: 'Versão do contrato',
    description: 'Número da versão',
    dataType: 'string',
    source: 'contract',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '1',
  }),
  def({
    key: 'signature.patientBlock',
    label: 'Bloco assinatura paciente',
    description: 'HTML de assinatura',
    dataType: 'html',
    source: 'signature',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<p><strong>Paciente:</strong> ________________________</p>',
  }),
  def({
    key: 'signature.guardianBlock',
    label: 'Bloco assinatura responsável',
    description: 'HTML de assinatura',
    dataType: 'html',
    source: 'signature',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<p><strong>Responsável:</strong> ________________________</p>',
  }),
  def({
    key: 'signature.professionalBlock',
    label: 'Bloco assinatura profissional',
    description: 'HTML de assinatura',
    dataType: 'html',
    source: 'signature',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<p><strong>Profissional:</strong> ________________________</p>',
  }),
  def({
    key: 'signature.clinicBlock',
    label: 'Bloco assinatura clínica',
    description: 'HTML de assinatura',
    dataType: 'html',
    source: 'signature',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<p><strong>Clínica:</strong> ________________________</p>',
  }),
  def({
    key: 'signature.witnessesBlock',
    label: 'Bloco testemunhas',
    description: 'HTML de testemunhas',
    dataType: 'html',
    source: 'signature',
    requiredByDefault: false,
    sensitive: false,
    previewValue: '<p><strong>Testemunhas:</strong> 1) ______ 2) ______</p>',
  }),
];

const catalogByKey = new Map(
  CONTRACT_TEMPLATE_VARIABLE_CATALOG.map((item) => [item.key, item]),
);

export function getContractTemplateVariableDefinition(
  key: string,
): ContractTemplateVariableDefinition | undefined {
  return catalogByKey.get(String(key || '').trim());
}

export function listContractTemplateVariables(
  source?: ContractTemplateVariableSource,
): ContractTemplateVariableDefinition[] {
  if (!source) return [...CONTRACT_TEMPLATE_VARIABLE_CATALOG];
  return CONTRACT_TEMPLATE_VARIABLE_CATALOG.filter((item) => item.source === source);
}

export function buildPreviewVariableValues(): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const item of CONTRACT_TEMPLATE_VARIABLE_CATALOG) {
    values[item.key] = item.previewValue;
  }
  return values;
}

/** Chaves permitidas — whitelist estrita (sem prototype path). */
export function isKnownContractTemplateVariableKey(key: string): boolean {
  return catalogByKey.has(String(key || '').trim());
}
