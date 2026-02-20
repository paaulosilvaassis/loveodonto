import { useMemo, useState, useCallback, useEffect } from 'react';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { PipelineColumn } from '../../crm/ui/PipelineColumn.jsx';
import { LeadCard } from '../../crm/ui/LeadCard.jsx';
import { ScheduleFromLeadModal } from '../../crm/ui/ScheduleFromLeadModal.jsx';
import { getPipelineStages, listLeads, moveLeadToStage } from '../../services/crmService.js';
import { listTags } from '../../services/crmTagService.js';
import { useAuth } from '../../auth/AuthContext.jsx';

/**
 * Pipeline Kanban: colunas vindas de PipelineStage, cards de leads.
 * Drag & drop: arraste um card para outra coluna para mudar o estágio (persistido em localStorage).
 */
export default function CrmPipelinePage() {
  const { user } = useAuth();
  const [tagFilter, setTagFilter] = useState('');
  const [allLeads, setAllLeads] = useState(() => listLeads());
  const [toast, setToast] = useState(null);
  const [scheduleModalLead, setScheduleModalLead] = useState(null);

  const tags = useMemo(() => listTags(), []);
  const filteredLeads = useMemo(() => {
    if (!tagFilter) return allLeads;
    return allLeads.filter((l) => (l.tagList || []).some((t) => t.id === tagFilter));
  }, [allLeads, tagFilter]);

  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const stages = useMemo(() => getPipelineStages(), []);

  const leadsByStage = useMemo(() => {
    const map = {};
    stages.forEach((s) => { map[s.key] = []; });
    filteredLeads.forEach((l) => {
      if (map[l.stageKey]) map[l.stageKey].push(l);
      else map[l.stageKey] = [l];
    });
    return map;
  }, [stages, filteredLeads]);

  const handleMoveLead = useCallback((leadId, newStageKey) => {
    if (!leadId || !newStageKey) return;
    const validStage = stages.some((s) => s.key === newStageKey);
    if (!validStage) return;

    let lossReason = null;
    if (newStageKey === 'perdido') {
      lossReason = window.prompt('Informe o motivo da perda (opcional):') || null;
      if (lossReason !== null) lossReason = String(lossReason).trim() || null;
    }

    const previousLeads = [...allLeads];
    setAllLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stageKey: newStageKey } : l))
    );

    try {
      moveLeadToStage(user, leadId, newStageKey, { lossReason });
      setToast(null);
    } catch (e) {
      console.error('moveLeadToStage:', e);
      setAllLeads(previousLeads);
      setToast({
        type: 'error',
        message: e?.message || 'Falha ao mover lead. Tente novamente.',
      });
    }
  }, [user, stages, allLeads]);

  return (
    <CrmLayout
      title="Pipeline de Atendimento"
      description="Funil visual Kanban. Arraste os cards entre colunas para alterar o estágio."
    >
      {toast && (
        <div
          className="toast error"
          role="alert"
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 1000,
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#ef4444',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {toast.message}
        </div>
      )}
      <div className="crm-pipeline-toolbar">
        <label htmlFor="crm-pipeline-tag-filter" className="crm-pipeline-tag-filter-label">Filtrar por tag:</label>
        <select
          id="crm-pipeline-tag-filter"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Filtrar por tag"
          className="crm-pipeline-tag-filter"
        >
          <option value="">Todas</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.category}: {t.name}</option>
          ))}
        </select>
      </div>
      <div className="crm-pipeline-board">
        {stages.map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            leads={leadsByStage[stage.key] || []}
            onMoveLead={handleMoveLead}
            renderLeadCard={(lead, st, onMove) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                stage={st}
                onMoveLead={onMove}
                onScheduleClick={setScheduleModalLead}
              />
            )}
          />
        ))}
      </div>

      <ScheduleFromLeadModal
        open={!!scheduleModalLead}
        onClose={() => setScheduleModalLead(null)}
        lead={scheduleModalLead || undefined}
        user={user}
        onSuccess={() => setAllLeads(listLeads())}
      />
    </CrmLayout>
  );
}
