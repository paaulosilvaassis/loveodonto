import { Save, Send, FileText, CheckCircle2, XCircle, Eye, FilePlus2 } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';
import { BUDGET_STATUS } from '../../../services/clinicalService.js';

export function BudgetPremiumHeader({
  isEditBlocked,
  isLocked,
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
}) {
  return (
    <header className="budget-premium-header">
      <div className="budget-premium-header-text">
        <h2>Orçamento do Tratamento</h2>
        <p>
          Configure as condições de pagamento, apresente ao paciente e registre a escolha final.
        </p>
      </div>
      <div className="budget-premium-header-actions">
        {!isEditBlocked ? (
          <>
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
              disabled={budgetStatus === BUDGET_STATUS.APROVADO}
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
