import { Eye } from 'lucide-react';
import { formatCurrencyBRL } from '../../../utils/currency.js';
import { BudgetStatusBadge } from './BudgetStatusBadge.jsx';

export function BudgetOverviewPanel({
  patientName,
  planName,
  planTypes,
  procedureCount,
  baseValue,
  validityDate,
  status,
  commercialNotes,
  onPlanChange,
  onValidityChange,
  onNotesChange,
  onViewProcedures,
}) {
  return (
    <section className="clinical-budget-overview">
      <header className="clinical-budget-overview-head">
        <h3>Resumo do orçamento</h3>
        <BudgetStatusBadge status={status} />
      </header>

      <dl className="clinical-budget-overview-grid">
        <div>
          <dt>Paciente</dt>
          <dd>{patientName || '—'}</dd>
        </div>
        <div>
          <dt>Tratamento</dt>
          <dd>
            <select
              className="clinical-budget-overview-select"
              value={planName || ''}
              onChange={(e) => onPlanChange(e.target.value)}
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
          <dd className="clinical-budget-overview-procs">
            <span>{procedureCount}</span>
            <button type="button" className="clinical-budget-link-btn" onClick={onViewProcedures}>
              <Eye size={14} />
              Ver detalhes
            </button>
          </dd>
        </div>
        <div>
          <dt>Valor base</dt>
          <dd className="clinical-budget-overview-value">{formatCurrencyBRL(baseValue)}</dd>
        </div>
        <div>
          <dt>Validade</dt>
          <dd>
            <input
              type="date"
              className="clinical-budget-overview-date"
              value={validityDate || ''}
              onChange={(e) => onValidityChange(e.target.value)}
            />
          </dd>
        </div>
      </dl>

      <label className="clinical-budget-overview-notes">
        <span>Observações clínicas e comerciais</span>
        <textarea
          rows={2}
          value={commercialNotes || ''}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Informações para apresentação do caso ao paciente"
        />
      </label>
    </section>
  );
}
