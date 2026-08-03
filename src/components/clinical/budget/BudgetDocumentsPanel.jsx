import { Download, Eye, FileText, RefreshCw } from 'lucide-react';
import { ClinicalBtn } from '../ClinicalStageShell.jsx';

export function BudgetDocumentsPanel({
  documents = [],
  onGenerate,
  onView,
  onDownload,
  compact = false,
}) {
  const latest = documents.length ? documents[documents.length - 1] : null;

  return (
    <section className={`clinical-budget-docs-panel${compact ? ' is-compact' : ''}`}>
      {!compact ? (
        <h4>
          <FileText size={16} />
          Documentos
        </h4>
      ) : (
        <h4 className="clinical-budget-docs-compact-title">
          <FileText size={14} />
          PDF do orçamento
        </h4>
      )}

      {!latest ? (
        <div className="clinical-budget-docs-empty">
          <p className="clinical-budget-footer-hint">Nenhum PDF gerado ainda.</p>
          <ClinicalBtn variant="primary" icon={FileText} onClick={onGenerate}>
            Gerar PDF do orçamento
          </ClinicalBtn>
        </div>
      ) : (
        <div className="clinical-budget-doc-card">
          <div className="clinical-budget-doc-card-info">
            <strong>PDF do orçamento</strong>
            <span>
              Gerado em{' '}
              {latest.createdAt
                ? new Date(latest.createdAt).toLocaleString('pt-BR')
                : '—'}
            </span>
            <span>Responsável: {latest.createdByName || 'Usuário do sistema'}</span>
          </div>
          <div className="clinical-budget-doc-card-actions">
            <ClinicalBtn variant="secondary" icon={Eye} onClick={() => onView(latest)}>
              Visualizar
            </ClinicalBtn>
            <ClinicalBtn variant="secondary" icon={Download} onClick={() => onDownload(latest)}>
              Baixar
            </ClinicalBtn>
            <ClinicalBtn variant="secondary" icon={RefreshCw} onClick={onGenerate}>
              Gerar novo PDF
            </ClinicalBtn>
          </div>
        </div>
      )}
    </section>
  );
}
