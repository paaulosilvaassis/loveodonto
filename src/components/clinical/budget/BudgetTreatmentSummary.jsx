import { Eye } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { BudgetStatusBadge } from './BudgetStatusBadge.jsx';

function formatDateBR(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('pt-BR');
  } catch {
    return value;
  }
}

export function BudgetTreatmentSummary({
  budget,
  procedureCount,
  plannedValue,
  professional,
  planTypes,
  onPlanChange,
  onValidityChange,
  onNotesChange,
  onViewProcedures,
}) {
  const professionalName =
    professional?.nomeCompleto || professional?.name || 'Não definido';

  return (
    <div className="clinical-budget-treatment-card">
      <div className="clinical-budget-treatment-head">
        <div>
          <span className="clinical-budget-treatment-kicker">Tratamento planejado</span>
          <h3 className="clinical-budget-treatment-title">
            {procedureCount} procedimento{procedureCount !== 1 ? 's' : ''}
          </h3>
        </div>
        <BudgetStatusBadge status={budget?.status} />
      </div>

      <dl className="clinical-budget-treatment-meta">
        <div>
          <dt>Valor planejado</dt>
          <dd>{formatCurrencyBRL(plannedValue)}</dd>
        </div>
        <div>
          <dt>Profissional</dt>
          <dd>{professionalName}</dd>
        </div>
        <div>
          <dt>Validade</dt>
          <dd>
            <input
              type="date"
              className="clinical-budget-validity-input"
              value={budget?.validityDate || ''}
              onChange={(e) => onValidityChange(e.target.value)}
            />
          </dd>
        </div>
      </dl>

      <ClinicalBtn variant="secondary" icon={Eye} onClick={onViewProcedures}>
        Ver procedimentos
      </ClinicalBtn>

      <div className="clinical-budget-commercial-fields">
        <label className="clinical-budget-field">
          <span>Tipo de tratamento</span>
          <select
            value={budget?.planName || ''}
            onChange={(e) => onPlanChange(e.target.value)}
          >
            <option value="">Selecione…</option>
            {planTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <label className="clinical-budget-field clinical-budget-field--full">
          <span>Observações clínicas e comerciais</span>
          <textarea
            rows={2}
            value={budget?.commercialNotes || ''}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Informações relevantes para apresentação do caso ao paciente"
          />
        </label>
      </div>
    </div>
  );
}
