import { CheckCircle2, Circle } from 'lucide-react';
import { CLINICAL_WORKFLOW_STEPS } from './clinicalAppointmentConfig.js';

/**
 * Indicador visual do fluxo Planejamento → Orçamento → Contrato → Documentos.
 */
export function ClinicalWorkflowStepper({ workflow, activeSection }) {
  const stepOrder = CLINICAL_WORKFLOW_STEPS.map((s) => s.id);
  const activeIndex = Math.max(0, stepOrder.indexOf(activeSection === 'observacoes' || activeSection === 'dados-clinicos' ? workflow.phase : activeSection));

  const completedUntil = (() => {
    if (workflow.budgetApproved) return 2;
    if (workflow.hasBudget) return 1;
    if (workflow.hasPlanning) return 0;
    return -1;
  })();

  return (
    <div className="clinical-workflow-stepper" role="list" aria-label="Progresso do atendimento comercial">
      {CLINICAL_WORKFLOW_STEPS.map((step, index) => {
        const done = index <= completedUntil;
        const current = step.id === activeSection || (activeSection === 'orcamento' && step.id === 'orcamento');
        return (
          <div
            key={step.id}
            className={`clinical-workflow-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}
            role="listitem"
          >
            {done ? <CheckCircle2 size={16} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
            <span>{step.label}</span>
          </div>
        );
      })}
      <span className="clinical-workflow-phase-badge">
        {workflow.budgetApproved && 'Orçamento aprovado'}
        {!workflow.budgetApproved && workflow.hasBudget && 'Orçamento em edição'}
        {!workflow.hasBudget && workflow.hasPlanning && 'Planejamento em edição'}
        {!workflow.hasPlanning && 'Inicie pelo planejamento'}
      </span>
    </div>
  );
}
