/**
 * @module domain/contracts/templates/contract-clause.library
 * @description Biblioteca de cláusulas em memória (sistema) — Phase 10.4.
 * Persistência Postgres de cláusulas NÃO existe na migration 028; não criar migration aqui.
 */

import type { TenantId } from '../contract.ids.js';
import type { ContractClause, ContractClauseId } from './contract-clause.types.js';

function clause(
  partial: Omit<ContractClause, 'id'> & { id: string },
): ContractClause {
  return {
    ...partial,
    id: partial.id as ContractClauseId,
  };
}

const NOW = '2026-08-01T00:00:00.000Z';

/** Cláusulas de sistema — imutáveis pela clínica nesta fase. */
export const SYSTEM_CONTRACT_CLAUSES: ContractClause[] = [
  clause({
    id: 'sys_clause_identification',
    tenantId: null,
    clauseCode: 'SYS.IDENTIFICATION',
    title: 'Qualificação das Partes',
    category: 'IDENTIFICATION',
    content:
      'São partes deste instrumento {{clinic.legalName}}, inscrita no CNPJ {{clinic.cnpj}}, '
      + 'e {{patient.name}}, inscrito(a) no CPF {{patient.cpf}}.',
    variables: [
      { key: 'clinic.legalName', label: 'Clínica', required: true, valueType: 'string' },
      { key: 'clinic.cnpj', label: 'CNPJ', required: true, valueType: 'string' },
      { key: 'patient.name', label: 'Paciente', required: true, valueType: 'string' },
      { key: 'patient.cpf', label: 'CPF', required: true, valueType: 'string' },
    ],
    riskLevel: 'LOW',
    isMandatory: true,
    isSystemClause: true,
    status: 'PUBLISHED',
    legalReviewStatus: 'NOT_REQUIRED',
    createdBy: 'system',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  clause({
    id: 'sys_clause_object',
    tenantId: null,
    clauseCode: 'SYS.OBJECT',
    title: 'Objeto',
    category: 'OBJECT',
    content:
      'O presente contrato tem por objeto a prestação dos serviços odontológicos descritos no orçamento {{budget.number}}, '
      + 'no valor total de {{budget.finalTotal}}.',
    variables: [
      { key: 'budget.number', label: 'Orçamento', required: true, valueType: 'string' },
      { key: 'budget.finalTotal', label: 'Total', required: true, valueType: 'string' },
    ],
    riskLevel: 'MEDIUM',
    isMandatory: true,
    isSystemClause: true,
    status: 'PUBLISHED',
    legalReviewStatus: 'PENDING',
    createdBy: 'system',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  clause({
    id: 'sys_clause_risks',
    tenantId: null,
    clauseCode: 'SYS.RISKS',
    title: 'Riscos e Limitações',
    category: 'RISKS',
    content:
      'O(A) paciente declara ter sido informado(a) sobre os riscos inerentes ao tratamento {{treatment.summary}}, '
      + 'podendo solicitar esclarecimentos adicionais a qualquer tempo.',
    variables: [
      { key: 'treatment.summary', label: 'Tratamento', required: false, valueType: 'string' },
    ],
    riskLevel: 'HIGH',
    isMandatory: false,
    isSystemClause: true,
    status: 'PUBLISHED',
    legalReviewStatus: 'PENDING',
    createdBy: 'system',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  clause({
    id: 'sys_clause_lgpd',
    tenantId: null,
    clauseCode: 'SYS.LGPD',
    title: 'Proteção de Dados (LGPD)',
    category: 'LGPD',
    content:
      'Os dados pessoais serão tratados conforme a legislação aplicável, exclusivamente para a execução '
      + 'deste contrato e obrigações legais correlatas.',
    variables: [],
    riskLevel: 'HIGH',
    isMandatory: false,
    isSystemClause: true,
    status: 'PUBLISHED',
    legalReviewStatus: 'PENDING',
    createdBy: 'system',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  clause({
    id: 'sys_clause_consent',
    tenantId: null,
    clauseCode: 'SYS.CONSENT',
    title: 'Consentimento Informado',
    category: 'CONSENT',
    content:
      'O(A) paciente consente de forma livre e esclarecida com a realização dos procedimentos descritos, '
      + 'após leitura deste instrumento.',
    variables: [],
    riskLevel: 'HIGH',
    isMandatory: false,
    isSystemClause: true,
    status: 'PUBLISHED',
    legalReviewStatus: 'PENDING',
    createdBy: 'system',
    createdAt: NOW,
    updatedAt: NOW,
  }),
  clause({
    id: 'sys_clause_financial',
    tenantId: null,
    clauseCode: 'SYS.FINANCIAL',
    title: 'Condições Financeiras',
    category: 'FINANCIAL',
    content:
      'As condições financeiras são: entrada de {{financial.downPayment}} e '
      + '{{financial.installmentCount}} parcelas de {{financial.installmentValue}}.',
    variables: [
      { key: 'financial.downPayment', label: 'Entrada', required: false, valueType: 'string' },
      { key: 'financial.installmentCount', label: 'Parcelas', required: false, valueType: 'number' },
      { key: 'financial.installmentValue', label: 'Valor parcela', required: false, valueType: 'string' },
    ],
    riskLevel: 'MEDIUM',
    isMandatory: false,
    isSystemClause: true,
    status: 'PUBLISHED',
    legalReviewStatus: 'PENDING',
    createdBy: 'system',
    createdAt: NOW,
    updatedAt: NOW,
  }),
];

export interface ContractClauseLibrary {
  listSystemClauses(): ContractClause[];
  listForTenant(tenantId: TenantId): ContractClause[];
  getByCode(clauseCode: string, tenantId?: TenantId | null): ContractClause | null;
  /** Snapshot imutável para versão publicada. */
  snapshotClauses(clauseCodes: string[], tenantId?: TenantId | null): ContractClause[];
}

/** Cláusulas custom do tenant ficam em memória injetável (sem tabela Postgres). */
export function createInMemoryContractClauseLibrary(
  tenantClauses: ContractClause[] = [],
): ContractClauseLibrary {
  const custom = [...tenantClauses];

  return {
    listSystemClauses() {
      return SYSTEM_CONTRACT_CLAUSES.filter((c) => c.status === 'PUBLISHED');
    },
    listForTenant(tenantId) {
      return [
        ...this.listSystemClauses(),
        ...custom.filter((c) => c.tenantId === tenantId && c.status !== 'ARCHIVED'),
      ];
    },
    getByCode(clauseCode, tenantId = null) {
      const code = String(clauseCode || '').trim();
      const fromTenant = custom.find(
        (c) => c.clauseCode === code && c.tenantId === tenantId,
      );
      if (fromTenant) return fromTenant;
      return SYSTEM_CONTRACT_CLAUSES.find((c) => c.clauseCode === code) || null;
    },
    snapshotClauses(clauseCodes, tenantId = null) {
      return clauseCodes
        .map((code) => this.getByCode(code, tenantId))
        .filter((c): c is ContractClause => Boolean(c))
        .map((c) => ({ ...c, content: c.content, variables: [...c.variables] }));
    },
  };
}

export const defaultContractClauseLibrary = createInMemoryContractClauseLibrary();
