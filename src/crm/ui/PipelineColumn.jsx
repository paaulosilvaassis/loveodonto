import { useEffect, useRef, useState } from 'react';
import { EyeOff, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency.js';

const MIME_LEAD_ID = 'text/plain';
const MIME_LEAD_STAGE = 'application/x-lead-stage';

function ColumnMenu({ stage, leadCount, onAddLead, onEditStage, onHideStage, onDeleteStage }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const runAndClose = (fn) => () => {
    setOpen(false);
    fn?.(stage);
  };

  return (
    <div className="crm-pipeline-column-menu" ref={menuRef}>
      <button
        type="button"
        className="crm-pipeline-column-menu-trigger"
        aria-label={`Ações da fase ${stage.label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="crm-pipeline-column-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={runAndClose(onAddLead)}>
            <Plus size={14} /> Adicionar lead nesta fase
          </button>
          <button type="button" role="menuitem" onClick={runAndClose(onEditStage)}>
            <Pencil size={14} /> Editar nome e cor
          </button>
          <button type="button" role="menuitem" onClick={runAndClose(onHideStage)}>
            <EyeOff size={14} /> Ocultar fase
          </button>
          <button
            type="button"
            role="menuitem"
            className="crm-pipeline-column-menu-danger"
            disabled={leadCount > 0}
            title={leadCount > 0 ? 'Apenas fases vazias podem ser excluídas' : undefined}
            onClick={runAndClose(onDeleteStage)}
          >
            <Trash2 size={14} /> Excluir fase vazia
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Coluna do Kanban (fase do pipeline). Droppable: solte um card aqui para mover o lead.
 */
export function PipelineColumn({
  stage,
  leads = [],
  onMoveLead,
  renderLeadCard,
  onAddLead,
  onEditStage,
  onHideStage,
  onDeleteStage,
}) {
  const potentialValue = leads.reduce((sum, l) => sum + (Number(l.estimatedValue) || 0), 0);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('crm-pipeline-column-drag-over');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('crm-pipeline-column-drag-over');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.currentTarget.classList.remove('crm-pipeline-column-drag-over');
    const leadId = e.dataTransfer.getData(MIME_LEAD_ID);
    const fromStageKey = e.dataTransfer.getData(MIME_LEAD_STAGE);
    if (!leadId || !onMoveLead) return;
    if (fromStageKey === stage.key) return;
    onMoveLead(leadId, stage.key);
  };

  return (
    <div
      className="crm-pipeline-column"
      data-stage-key={stage.key}
      style={{ '--stage-color': stage.color || '#94a3b8' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="crm-pipeline-column-header">
        <span className="crm-pipeline-column-dot" aria-hidden="true" />
        <span className="crm-pipeline-column-label" title={stage.label}>{stage.label}</span>
        <span className="crm-pipeline-column-count">{leads.length}</span>
        <ColumnMenu
          stage={stage}
          leadCount={leads.length}
          onAddLead={onAddLead}
          onEditStage={onEditStage}
          onHideStage={onHideStage}
          onDeleteStage={onDeleteStage}
        />
      </div>
      {potentialValue > 0 && (
        <div className="crm-pipeline-column-value" title="Valor potencial da fase">
          {formatCurrencyBRL(potentialValue)}
        </div>
      )}
      <div className="crm-pipeline-column-cards">
        {leads.length === 0 ? (
          <div className="crm-pipeline-column-empty">
            <p className="crm-pipeline-column-empty-title">Nenhum lead nesta fase</p>
            <p className="crm-pipeline-column-empty-hint">
              Arraste um lead para cá ou cadastre um novo.
            </p>
          </div>
        ) : (
          leads.map((lead) => renderLeadCard(lead, stage))
        )}
      </div>
    </div>
  );
}
