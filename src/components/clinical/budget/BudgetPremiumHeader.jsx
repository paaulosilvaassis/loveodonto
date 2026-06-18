import { Save, Send, FileText, CheckCircle2, XCircle, Eye, FilePlus2, DoorClosed } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';
import { BUDGET_STATUS } from '../../../services/clinicalService.js';

export function BudgetPremiumHeader({
  isEditBlocked,
  isLocked,
  isApprovedView = false,
  hasChosenCondition = false,
  hasDocuments,
  hasActiveContract,
  budgetStatus,
  saving,
  onSave,
  onSend,
  onReject,
  onGeneratePdf,
  onPrint,
  onViewContract,
  onCreateNew,
  onApprove,
  onFinishAppointment,
  canFinishAppointment = false,
  onNavigateToContract,
}) {
  return (
    <header className="budget-premium-header">
      <div className="budget-premium-header-text">
        <h2>Orçamento do Tratamento</h2>
        <p>
          {isApprovedView
            ? 'Orçamento aprovado. Gere o contrato na aba Contrato para continuar o fluxo.'
            : 'Configure as condições de pagamento, apresente ao paciente e registre a escolha final.'}
        </p>
      </div>
      <div className="budget-premium-header-actions">
        {isApprovedView ? (
          <>
            <ClinicalBtn variant="secondary" size="sm" icon={FileText} onClick={onGeneratePdf}>
              Baixar PDF
            </ClinicalBtn>
            {canFinishAppointment ? (
              <ClinicalBtn
                variant="secondary"
                size="sm"
                icon={DoorClosed}
                onClick={onFinishAppointment}
                className="budget-finish-appointment-btn"
              >
                Finalizar atendimento
              </ClinicalBtn>
            ) : null}
            {typeof onNavigateToContract === 'function' ? (
              <ClinicalBtn variant="primary" size="sm" icon={CheckCircle2} onClick={onNavigateToContract}>
                Ir para Contrato
              </ClinicalBtn>
            ) : null}
          </>
        ) : !isEditBlocked ? (
          <>
            {canFinishAppointment ? (
              <ClinicalBtn
                variant="secondary"
                size="sm"
                icon={DoorClosed}
                onClick={onFinishAppointment}
                className="budget-finish-appointment-btn"
              >
                Finalizar atendimento
              </ClinicalBtn>
            ) : null}
            <ClinicalBtn variant="secondary" size="sm" icon={Save} onClick={onSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </ClinicalBtn>
            <ClinicalBtn variant="secondary" size="sm" icon={FileText} onClick={onGeneratePdf}>
              Gerar PDF
            </ClinicalBtn>
            <ClinicalBtn variant="secondary" size="sm" icon={Send} onClick={onSend}>
              Enviar ao paciente
            </ClinicalBtn>
            <ClinicalBtn variant="secondary" size="sm" icon={XCircle} onClick={onReject}>
              Reprovar
            </ClinicalBtn>
            <ClinicalBtn
              variant="primary"
              size="sm"
              icon={CheckCircle2}
              onClick={onApprove}
              disabled={
                !hasChosenCondition
                || budgetStatus === BUDGET_STATUS.APROVADO
                || budgetStatus === BUDGET_STATUS.CONTRATO_GERADO
              }
              title={
                !hasChosenCondition
                  ? 'Marque uma condição de pagamento como escolhida antes de aprovar.'
                  : undefined
              }
            >
              Aprovar orçamento
            </ClinicalBtn>
          </>
        ) : (
          <>
            <ClinicalBtn variant="secondary" size="sm" icon={FileText} onClick={onGeneratePdf}>
              {isLocked ? 'Baixar PDF' : 'Gerar PDF'}
            </ClinicalBtn>
            {isLocked && hasDocuments ? (
              <ClinicalBtn variant="secondary" size="sm" icon={Eye} onClick={onPrint}>
                Imprimir
              </ClinicalBtn>
            ) : null}
            {isLocked && hasActiveContract ? (
              <ClinicalBtn variant="secondary" size="sm" icon={FileText} onClick={onViewContract}>
                Ver contrato
              </ClinicalBtn>
            ) : null}
            {canFinishAppointment ? (
              <ClinicalBtn
                variant="secondary"
                size="sm"
                icon={DoorClosed}
                onClick={onFinishAppointment}
                className="budget-finish-appointment-btn"
              >
                Finalizar atendimento
              </ClinicalBtn>
            ) : null}
            {isLocked ? (
              <ClinicalBtn variant="primary" size="sm" icon={FilePlus2} onClick={onCreateNew}>
                Criar novo orçamento
              </ClinicalBtn>
            ) : null}
          </>
        )}
      </div>
    </header>
  );
}
