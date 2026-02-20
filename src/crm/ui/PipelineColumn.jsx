import { useMemo } from 'react';

const MIME_LEAD_ID = 'text/plain';
const MIME_LEAD_STAGE = 'application/x-lead-stage';

/**
 * Coluna do Kanban (PipelineStage). Droppable: solte um card aqui para mover o lead para este estágio.
 */
export function PipelineColumn({ stage, leads = [], onMoveLead, renderLeadCard }) {
  const count = useMemo(() => leads.length, [leads.length]);

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
        <span className="crm-pipeline-column-label">{stage.label}</span>
        <span className="crm-pipeline-column-count">{count}</span>
      </div>
      <div className="crm-pipeline-column-cards">
        {leads.map((lead) =>
          renderLeadCard ? (
            renderLeadCard(lead, stage, onMoveLead)
          ) : (
            <div key={lead.id} className="crm-pipeline-card">
              <div className="crm-pipeline-card-name">{lead.name || 'Sem nome'}</div>
              <div className="crm-pipeline-card-phone">{lead.phone || '—'}</div>
              <div className="crm-pipeline-card-origin">{lead.source || '—'}</div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
