import { History, Import } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';

export function PreviousBudgetImportCard({
  budgetNumber,
  procedureCount = 0,
  onViewHistory,
  onImport,
  importing = false,
}) {
  return (
    <aside className="clinical-previous-budget-card" role="note">
      <p>
        Existe um orçamento anterior para este paciente
        {budgetNumber ? ` (${budgetNumber})` : ''}.
      </p>
      <div className="clinical-previous-budget-card-actions">
        <ClinicalBtn variant="ghost" icon={History} onClick={onViewHistory}>
          Ver histórico
        </ClinicalBtn>
        {procedureCount > 0 ? (
          <ClinicalBtn variant="secondary" icon={Import} onClick={onImport} disabled={importing}>
            {importing ? 'Importando…' : 'Importar procedimentos do orçamento anterior'}
          </ClinicalBtn>
        ) : null}
      </div>
    </aside>
  );
}
