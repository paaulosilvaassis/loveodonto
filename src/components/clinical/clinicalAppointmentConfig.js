import {
  Calendar,
  DollarSign,
  FileCheck,
  FileSignature,
  FileText,
  PenLine,
  Stethoscope,
} from 'lucide-react';
import { BUDGET_STATUS } from '../../services/clinicalService.js';
import { getBudget, getClinicalData } from '../../services/clinicalService.js';
import { getBudgetLockContext, getBudgetLockContextForBudget } from '../../services/clinicalBudgetLockService.js';
import { resolveBudgetForView } from '../../services/budgetNavigationService.js';
import {
  canAccessContract,
  isBudgetApprovedStatus,
} from './contract/contractAccessUtils.js';
import { getContractStatusForQuote } from '../../services/contractModuleService.js';
import { areRequiredApplicableDocumentsSatisfied } from '../../contracts/treatmentDocumentRequirements.js';
import {
  evaluateClinicalSignatureReadiness,
  CLINICAL_SIGNATURE_STEP,
} from '../../contracts/clinicalSignatureReadiness.js';

/** Etapas do fluxo clínico (header). IDs são slugs estáveis — não numerar por índice em rotas. */
export const CLINICAL_WORKFLOW_STEPS = [
  { id: 'planejamento', label: 'Planejamento' },
  { id: 'orcamento', label: 'Orçamento' },
  { id: 'contrato', label: 'Contrato' },
  { id: 'documentos', label: 'Documentos' },
  { id: 'assinatura', label: 'Assinatura' },
  { id: 'dados-clinicos', label: 'Dados Clínicos' },
  { id: 'observacoes', label: 'Observações' },
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
  { id: 'assinatura', label: 'Assinatura', icon: PenLine },
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

export function getClinicalWorkflowState(appointmentId, viewBudgetId = null) {
  const clinical = getClinicalData(appointmentId);
  const resolved = viewBudgetId
    ? resolveBudgetForView(appointmentId, viewBudgetId)
    : { budget: getBudget(appointmentId), isHistoricalView: false, isReadOnly: false, record: null };

  const budget = resolved.budget;
  const isHistoricalView = Boolean(resolved.isHistoricalView);
  const isReadOnly = Boolean(resolved.isReadOnly);
  const plannedFromClinical = clinical?.plannedProcedures || [];
  const plannedFromBudget = budget?.procedures || [];
  const hasPlanning = isHistoricalView
    ? plannedFromBudget.length > 0
    : plannedFromClinical.length > 0;
  const lockCtx = viewBudgetId && budget
    ? getBudgetLockContextForBudget(appointmentId, budget)
    : getBudgetLockContext(appointmentId);
  const hasBudget = Boolean(budget?.id || plannedFromBudget.length);
  const budgetApproved = isBudgetApprovedStatus(budget?.status);
  const linkedContract = lockCtx?.contract
    || getContractStatusForQuote(appointmentId, 'clinical_budget', budget?.id || null);
  const hasPersistedContract = Boolean(
    linkedContract
    && !['canceled', 'replaced', 'refused'].includes(String(linkedContract.status || '').toLowerCase()),
  );
  const contractAccessible = canAccessContract(budget, lockCtx) || hasPersistedContract;
  const contractUnlocked = contractAccessible;

  let phase = 'planejamento';
  if (contractAccessible || budgetApproved) phase = 'contrato';
  else if (hasBudget) phase = 'orcamento';
  else if (hasPlanning) phase = 'planejamento';

  return {
    hasPlanning,
    hasBudget,
    budgetApproved,
    contractAccessible,
    contractUnlocked,
    hasPersistedContract,
    budgetStatus: budget?.status || null,
    phase,
    plannedCount: isHistoricalView ? plannedFromBudget.length : plannedFromClinical.length,
    budget,
    lockCtx,
    viewBudgetId: viewBudgetId || null,
    isHistoricalView,
    isReadOnly,
    appointmentId,
    patientId: clinical?.patientId || null,
    budgetId: budget?.id || viewBudgetId || null,
  };
}

export function canAccessClinicalSection(sectionId, workflow) {
  if (sectionId === 'planejamento') return true;
  if (workflow.viewBudgetId) {
    if (sectionId === 'orcamento') return workflow.hasBudget || workflow.hasPlanning;
    if (sectionId === 'contratos') {
      return Boolean(workflow.contractAccessible);
    }
    if (sectionId === 'documentos') return Boolean(workflow.budgetApproved || workflow.contractAccessible);
    if (sectionId === 'assinatura') return Boolean(workflow.budgetApproved || workflow.contractAccessible);
    return true;
  }
  if (sectionId === 'orcamento') return workflow.hasPlanning;
  if (sectionId === 'contratos') return Boolean(workflow.contractAccessible);
  if (sectionId === 'documentos') return Boolean(workflow.budgetApproved || workflow.contractAccessible);
  if (sectionId === 'assinatura') return Boolean(workflow.budgetApproved || workflow.contractAccessible);
  return true;
}

export function sectionLockMessage(sectionId, workflow) {
  if (workflow.viewBudgetId) return null;
  if (sectionId === 'orcamento' && !workflow.hasPlanning) {
    return 'Cadastre ao menos um procedimento no Planejamento antes de montar o orçamento.';
  }
  if (sectionId === 'contratos' && !workflow.contractAccessible) {
    if (!workflow.budgetApproved) {
      return 'Contrato disponível somente após aprovação do orçamento e escolha da forma de pagamento.';
    }
    return 'Selecione a condição de pagamento escolhida pelo paciente antes de acessar o contrato.';
  }
  if (sectionId === 'documentos' && !workflow.budgetApproved && !workflow.contractAccessible) {
    return 'Documentos disponíveis somente após aprovação do orçamento.';
  }
  if (sectionId === 'assinatura' && !workflow.budgetApproved && !workflow.contractAccessible) {
    return 'Assinatura disponível após o contrato e os documentos obrigatórios do tratamento.';
  }
  return null;
}

/**
 * Completion de negócio da etapa — independente da aba selecionada.
 * Aba ativa pode destacar visualmente, mas não reabre etapa já concluída.
 */
export function getNavStepCompletionStatus(stepId, workflow) {
  const locked = !canAccessClinicalSection(stepId, workflow);
  if (locked) return STEP_STATUS.BLOCKED;

  if (stepId === 'planejamento') {
    if (workflow.hasPlanning || workflow.hasBudget || workflow.budgetApproved) {
      return STEP_STATUS.COMPLETED;
    }
    return STEP_STATUS.PENDING;
  }

  if (stepId === 'orcamento') {
    if (workflow.budgetApproved || workflow.hasBudget) return STEP_STATUS.COMPLETED;
    if (workflow.hasPlanning) return STEP_STATUS.PENDING;
    return STEP_STATUS.BLOCKED;
  }

  if (stepId === 'contratos') {
    if (
      workflow.hasPersistedContract
      || (
        workflow.lockCtx?.contractApplies
        && (workflow.lockCtx?.hasActiveContract || workflow.lockCtx?.contractSigned)
      )
    ) {
      return STEP_STATUS.COMPLETED;
    }
    if (workflow.contractAccessible) return STEP_STATUS.PENDING;
    return STEP_STATUS.BLOCKED;
  }

  if (stepId === 'documentos') {
    if (!(workflow.budgetApproved || workflow.contractAccessible)) {
      return STEP_STATUS.BLOCKED;
    }
    const docsComplete = areRequiredApplicableDocumentsSatisfied({
      appointmentId: workflow.appointmentId,
      budgetId: workflow.budgetId || workflow.viewBudgetId || workflow.budget?.id || null,
      patientId: workflow.patientId,
    });
    return docsComplete ? STEP_STATUS.COMPLETED : STEP_STATUS.PENDING;
  }

  if (stepId === 'assinatura') {
    if (!(workflow.budgetApproved || workflow.contractAccessible)) {
      return STEP_STATUS.BLOCKED;
    }
    const signature = evaluateClinicalSignatureReadiness({
      appointmentId: workflow.appointmentId,
      budgetId: workflow.budgetId || workflow.viewBudgetId || workflow.budget?.id || null,
      patientId: workflow.patientId,
    });
    if (signature.step === CLINICAL_SIGNATURE_STEP.SIGNED) return STEP_STATUS.COMPLETED;
    if (signature.step === CLINICAL_SIGNATURE_STEP.BLOCKED) return STEP_STATUS.BLOCKED;
    if (
      signature.step === CLINICAL_SIGNATURE_STEP.PARTIALLY_SIGNED
      || signature.step === CLINICAL_SIGNATURE_STEP.AWAITING_REQUIRED_SIGNERS
    ) {
      return STEP_STATUS.IN_PROGRESS;
    }
    return STEP_STATUS.PENDING;
  }

  return STEP_STATUS.PENDING;
}

export function getNavStepStatus(stepId, workflow, activeSection) {
  const completion = getNavStepCompletionStatus(stepId, workflow);
  if (completion === STEP_STATUS.COMPLETED || completion === STEP_STATUS.BLOCKED) {
    return completion;
  }
  if (completion === STEP_STATUS.IN_PROGRESS) return completion;
  if (activeSection === stepId) return STEP_STATUS.IN_PROGRESS;
  return completion;
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
