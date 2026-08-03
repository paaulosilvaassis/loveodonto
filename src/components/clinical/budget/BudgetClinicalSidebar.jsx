import { Eye, User, Stethoscope } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { BudgetStatusBadge } from './BudgetStatusBadge.jsx';

export function BudgetClinicalSidebar({
  patientName,
  professional,
  budget,
  planTypes,
  originalValue,
  discount,
  finalValue,
  procedureCount,
  onPlanChange,
  onValidityChange,
  onViewProcedures,
  readOnly,
}) {
  const professionalName =
    professional?.nomeCompleto || professional?.name || professional?.apelido || '—';

  return (
    <aside className="clinical-budget-col clinical-budget-col--clinical">
      <header className="clinical-budget-col-head">
        <Stethoscope size={16} />
        <h3>Resumo clínico</h3>
        <BudgetStatusBadge status={budget?.status} />
      </header>

      <dl className="clinical-budget-clinical-kpis">
        <div>
          <dt><User size={12} /> Paciente</dt>
          <dd>{patientName}</dd>
        </div>
        <div>
          <dt>Profissional</dt>
          <dd>{professionalName}</dd>
        </div>
        <div>
          <dt>Plano</dt>
          <dd>
            <select
              value={budget?.planName || ''}
              onChange={(e) => onPlanChange(e.target.value)}
              disabled={readOnly}
              className="clinical-budget-col-select"
            >
              <option value="">Selecione…</option>
              {planTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </dd>
        </div>
        <div>
          <dt>Procedimentos</dt>
          <dd>{procedureCount}</dd>
        </div>
      </dl>

      <div className="clinical-budget-clinical-values">
        <div className="clinical-budget-clinical-value-row">
          <span>Valor original</span>
          <strong>{formatCurrencyBRL(originalValue)}</strong>
        </div>
        {discount > 0 ? (
          <div className="clinical-budget-clinical-value-row is-discount">
            <span>Desconto</span>
            <strong>- {formatCurrencyBRL(discount)}</strong>
          </div>
        ) : null}
        <div className="clinical-budget-clinical-value-row is-final">
          <span>Valor final</span>
          <strong>{formatCurrencyBRL(finalValue)}</strong>
        </div>
      </div>

      <label className="clinical-budget-col-field">
        <span>Validade</span>
        <input
          type="date"
          value={budget?.validityDate || ''}
          onChange={(e) => onValidityChange(e.target.value)}
          disabled={readOnly}
        />
      </label>

      <ClinicalBtn variant="secondary" icon={Eye} onClick={onViewProcedures}>
        Ver procedimentos
      </ClinicalBtn>
    </aside>
  );
}
