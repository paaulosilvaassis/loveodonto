import {
  Calendar,
  DollarSign,
  FileCheck,
  FileSignature,
  FileText,
  Stethoscope,
} from 'lucide-react';
import { BUDGET_STATUS } from '../../services/clinicalService.js';
import { getBudget, getClinicalData } from '../../services/clinicalService.js';

/** Etapas do fluxo clínico comercial (header). */
export const CLINICAL_WORKFLOW_STEPS = [
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'documentos', label: 'Documentos' },
];

/** Status visual das etapas na navegação lateral. */
export const STEP_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
};

export const STEP_STATUS_LABELS = {
  [STEP_STATUS.PENDING]: 'Pendente',
  [STEP_STATUS.IN_PROGRESS]: 'Em andamento',
  [STEP_STATUS.COMPLETED]: 'Concluído',
  [STEP_STATUS.BLOCKED]: 'Bloqueado',
};

/** Ordem das abas laterais do atendimento clínico. */
export const CLINICAL_NAV_ITEMS = [
  { id: 'planejamento', label: 'Planejamento', icon: Calendar },
  { id: 'orcamento', label: 'Orçamento', icon: DollarSign },
  { id: 'contratos', label: 'Contrato', icon: FileCheck },
  { id: 'documentos', label: 'Documentos', icon: FileSignature },
  { id: 'dados-clinicos', label: 'Dados Clínicos', icon: Stethoscope },
  { id: 'observacoes', label: 'Observações', icon: FileText },
];

export const PLANNING_STAGES = [
  { value: 'urgente', label: 'Urgente' },
  { value: 'inicial', label: 'Inicial' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'finalizacao', label: 'Finalização' },
  { value: 'manutencao', label: 'Manutenção' },
];

export const ANAMNESIS_ATTACH_OPTIONS = [
  { key: 'chiefComplaint', label: 'Queixa principal' },
  { key: 'healthHistory', label: 'Histórico de saúde' },
  { key: 'allergies', label: 'Alergias' },
  { key: 'medications', label: 'Medicamentos em uso' },
  { key: 'systemicConditions', label: 'Condições sistêmicas' },
  { key: 'clinicalNotes', label: 'Observações clínicas importantes' },
  { key: 'risks', label: 'Riscos e cuidados' },
  { key: 'restrictions', label: 'Restrições do tratamento' },
];

export const DEFAULT_PAYMENT_OPTIONS = () => ([
  {
    id: 'pay-a-vista',
    label: 'À vista',
    type: 'a_vista',
    total: 0,
    discount: 0,
    discountPercent: 0,
    methods: ['pix'],
    method: 'pix',
    downPayment: 0,
    installments: 1,
    installmentValue: 0,
    notes: '',
    presentToPatient: false,
    accepted: false,
  },
  {
    id: 'pay-parcelado',
    label: 'Parcelado pela clínica',
    type: 'parcelado_clinica',
    total: 0,
    discount: 0,
    discountPercent: 0,
    downPayment: 0,
    installments: 24,
    installmentValue: 0,
    method: 'boleto',
    notes: '',
    presentToPatient: false,
    accepted: false,
  },
  {
    id: 'pay-cartao',
    label: 'Cartão',
    type: 'cartao',
    total: 0,
    discount: 0,
    discountPercent: 0,
    cardBrand: 'visa',
    installments: 12,
    installmentValue: 0,
    method: 'cartao_credito',
    notes: '',
    presentToPatient: false,
    accepted: false,
  },
  {
    id: 'pay-financiamento',
    label: 'Financiamento',
    type: 'financiamento',
    total: 0,
    discount: 0,
    discountPercent: 0,
    partnerId: '',
    partner: '',
    customPartnerName: '',
    downPayment: 0,
    downPaymentPercent: 0,
    entryPercentMode: null,
    installments: 36,
    installmentValue: 0,
    interestType: 'none',
    interestRate: 0,
    firstDueDate: '',
    method: 'financiamento',
    notes: '',
    presentToPatient: false,
    accepted: false,
  },
]);

export function getClinicalWorkflowState(appointmentId) {
  const clinical = getClinicalData(appointmentId);
  const planned = clinical?.plannedProcedures || [];
  const budget = getBudget(appointmentId);
  const hasPlanning = planned.length > 0;
  const hasBudget = Boolean(budget?.id || (budget?.procedures || []).length);
  const budgetApproved = budget?.status === BUDGET_STATUS.APROVADO;

  let phase = 'planejamento';
  if (budgetApproved) phase = 'contrato';
  else if (hasBudget) phase = 'orcamento';
  else if (hasPlanning) phase = 'planejamento';

  return {
    hasPlanning,
    hasBudget,
    budgetApproved,
    budgetStatus: budget?.status || null,
    phase,
    plannedCount: planned.length,
    budget,
  };
}

export function canAccessClinicalSection(sectionId, workflow) {
  if (sectionId === 'planejamento') return true;
  if (sectionId === 'orcamento') return workflow.hasPlanning;
  if (sectionId === 'contratos') return workflow.budgetApproved;
  if (sectionId === 'documentos') return workflow.budgetApproved;
  return true;
}

export function sectionLockMessage(sectionId, workflow) {
  if (sectionId === 'orcamento' && !workflow.hasPlanning) {
    return 'Cadastre ao menos um procedimento no Planejamento antes de montar o orçamento.';
  }
  if ((sectionId === 'contratos' || sectionId === 'documentos') && !workflow.budgetApproved) {
    return 'Contrato disponível somente após aprovação do orçamento.';
  }
  return null;
}

export function getNavStepStatus(stepId, workflow, activeSection) {
  const locked = !canAccessClinicalSection(stepId, workflow);
  if (locked) return STEP_STATUS.BLOCKED;

  if (stepId === 'planejamento') {
    if (activeSection === 'planejamento') return STEP_STATUS.IN_PROGRESS;
    if (workflow.hasPlanning) return STEP_STATUS.COMPLETED;
    return STEP_STATUS.PENDING;
  }

  if (stepId === 'orcamento') {
    if (activeSection === 'orcamento') return STEP_STATUS.IN_PROGRESS;
    if (workflow.budgetApproved) return STEP_STATUS.COMPLETED;
    if (workflow.hasBudget) return STEP_STATUS.COMPLETED;
    if (workflow.hasPlanning) return STEP_STATUS.PENDING;
    return STEP_STATUS.BLOCKED;
  }

  if (stepId === 'contratos' || stepId === 'documentos') {
    if (activeSection === stepId) return STEP_STATUS.IN_PROGRESS;
    if (workflow.budgetApproved) return STEP_STATUS.PENDING;
    return STEP_STATUS.BLOCKED;
  }

  if (activeSection === stepId) return STEP_STATUS.IN_PROGRESS;
  return STEP_STATUS.PENDING;
}

export const BUDGET_STATUS_UI = [
  { value: BUDGET_STATUS.RASCUNHO, label: 'Em análise' },
  { value: BUDGET_STATUS.ENVIADO, label: 'Enviado ao paciente' },
  { value: BUDGET_STATUS.APROVADO, label: 'Aprovado' },
  { value: BUDGET_STATUS.REPROVADO, label: 'Reprovado' },
  { value: 'EXPIRADO', label: 'Expirado' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

export const BUDGET_STATUS_BADGES = [
  { value: BUDGET_STATUS.RASCUNHO, label: 'Em elaboração', tone: 'amber' },
  { value: BUDGET_STATUS.ENVIADO, label: 'Apresentado ao paciente', tone: 'blue' },
  { value: BUDGET_STATUS.NEGOCIACAO, label: 'Em negociação', tone: 'violet' },
  { value: BUDGET_STATUS.APROVADO, label: 'Aprovado', tone: 'green' },
  { value: BUDGET_STATUS.CONTRATO_GERADO, label: 'Contrato gerado', tone: 'green' },
  { value: BUDGET_STATUS.HISTORICO, label: 'Histórico', tone: 'gray' },
  { value: BUDGET_STATUS.REPROVADO, label: 'Reprovado', tone: 'red' },
  { value: BUDGET_STATUS.CANCELADO, label: 'Cancelado', tone: 'gray' },
  { value: 'EXPIRADO', label: 'Expirado', tone: 'gray' },
];
