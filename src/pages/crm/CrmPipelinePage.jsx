import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck, Clock3, Filter, Plus, Settings2, UserCheck, UserPlus, Users, XCircle,
} from 'lucide-react';
import GradientButton from '../../components/GradientButton.jsx';
import Button from '../../components/Button.jsx';
import { PipelineColumn } from '../../crm/ui/PipelineColumn.jsx';
import { LeadCard } from '../../crm/ui/LeadCard.jsx';
import { PipelineFilters, EMPTY_PIPELINE_FILTERS, hasActivePipelineFilters } from '../../crm/ui/PipelineFilters.jsx';
import { PipelineStagesConfigModal } from '../../crm/ui/PipelineStagesConfigModal.jsx';
import { PipelineLeadModal } from '../../crm/ui/PipelineLeadModal.jsx';
import { LeadDetailsModal } from '../../crm/ui/LeadDetailsModal.jsx';
import { MarkLeadLostModal } from '../../crm/ui/MarkLeadLostModal.jsx';
import { ConvertLeadToPatientModal } from '../../crm/ui/ConvertLeadToPatientModal.jsx';
import { ScheduleFromLeadModal } from '../../crm/ui/ScheduleFromLeadModal.jsx';
import { listLeads, moveLeadToStage, addLeadEvent, listFollowUps, CRM_EVENT_TYPE } from '../../services/crmService.js';
import {
  STAGE_TYPE,
  ensurePipelineStagesForTenant,
  listPipelineStagesForTenant,
  countLeadsByStageKey,
  setPipelineStageActive,
  deletePipelineStage,
  findLostStage,
} from '../../services/crmPipelineStageService.js';
import { useAuth } from '../../auth/useAuth.js';
import { useCrmTenantLabels } from '../../crm/hooks/useCrmTenantLabels.js';
import { loadDb } from '../../db/index.js';

const TOAST_DURATION_MS = 4000;

const matchesPeriod = (lead, from, to) => {
  const created = lead.createdAt || '';
  if (from && created < `${from}T00:00:00`) return false;
  if (to && created > `${to}T23:59:59`) return false;
  return true;
};

export default function CrmPipelinePage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || user?.tenant_id || '';
  const { sourceLabels, interestLabels } = useCrmTenantLabels(user, tenantId);

  const [stages, setStages] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [version, setVersion] = useState(0);
  const [filters, setFilters] = useState(EMPTY_PIPELINE_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [newLeadStageKey, setNewLeadStageKey] = useState(null);
  const [detailsLeadId, setDetailsLeadId] = useState(null);
  const [convertLead, setConvertLead] = useState(null);
  const [lostState, setLostState] = useState(null);
  const [scheduleLead, setScheduleLead] = useState(null);

  const showToast = useCallback((type, message) => setToast({ type, message }), []);

  const reload = useCallback(() => {
    setStages(listPipelineStagesForTenant(tenantId, { includeInactive: true }));
    setAllLeads(listLeads());
    setVersion((v) => v + 1);
  }, [tenantId]);

  useEffect(() => {
    if (!user) return;
    try {
      ensurePipelineStagesForTenant(user);
    } catch (err) {
      if (import.meta.env?.DEV) console.debug('ensurePipelineStages:', err?.message);
    }
    reload();
  }, [user, reload]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const users = useMemo(() => (loadDb().users || []).filter((u) => u.active !== false), []);
  const usersById = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.name || u.id])),
    [users]
  );

  const activeStages = useMemo(() => stages.filter((s) => s.isActive !== false), [stages]);
  const leadCounts = useMemo(() => countLeadsByStageKey(tenantId), [tenantId, version]);

  const tenantLeads = useMemo(
    () => allLeads.filter((l) => l.tenant_id === tenantId || !l.tenant_id),
    [allLeads, tenantId]
  );

  const overdueLeadIds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ids = new Set();
    listFollowUps({ pending: true }).forEach((f) => {
      if (f.dueAt && new Date(f.dueAt) < today) ids.add(f.leadId);
    });
    return ids;
  }, [version]);

  const filteredLeads = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const searchDigits = filters.search.replace(/\D/g, '');
    return tenantLeads.filter((l) => {
      if (search && !(
        (l.name || '').toLowerCase().includes(search) ||
        (searchDigits && (l.phone || '').includes(searchDigits))
      )) return false;
      if (filters.interest && l.interest !== filters.interest) return false;
      if (filters.source && l.source !== filters.source) return false;
      if (filters.assignedToUserId && l.assignedToUserId !== filters.assignedToUserId) return false;
      if (filters.stageKey && l.stageKey !== filters.stageKey) return false;
      if (!matchesPeriod(l, filters.createdFrom, filters.createdTo)) return false;
      if (filters.overdueOnly && !overdueLeadIds.has(l.id)) return false;
      return true;
    });
  }, [tenantLeads, filters, overdueLeadIds]);

  const leadsByStage = useMemo(() => {
    const map = {};
    activeStages.forEach((s) => { map[s.key] = []; });
    filteredLeads.forEach((l) => {
      if (map[l.stageKey]) map[l.stageKey].push(l);
    });
    return map;
  }, [activeStages, filteredLeads]);

  const summary = useMemo(() => {
    const firstStage = activeStages.find((s) => s.stageType === STAGE_TYPE.NORMAL) || activeStages[0];
    const conversionKeys = new Set(activeStages.filter((s) => s.stageType === STAGE_TYPE.CONVERSION).map((s) => s.key));
    const lostKeys = new Set(stages.filter((s) => s.stageType === STAGE_TYPE.LOST).map((s) => s.key));
    return [
      { id: 'total', label: 'Total no pipeline', icon: Users, tone: 'primary', value: tenantLeads.length },
      { id: 'new', label: 'Novos leads', icon: UserPlus, tone: 'accent', value: firstStage ? tenantLeads.filter((l) => l.stageKey === firstStage.key).length : 0 },
      { id: 'waiting', label: 'Aguardando retorno', icon: Clock3, tone: 'warning', value: tenantLeads.filter((l) => overdueLeadIds.has(l.id)).length },
      { id: 'scheduled', label: 'Avaliações agendadas', icon: CalendarCheck, tone: 'accent', value: tenantLeads.filter((l) => l.stageKey === 'avaliacao_agendada').length },
      { id: 'converted', label: 'Convertidos', icon: UserCheck, tone: 'success', value: tenantLeads.filter((l) => Boolean(l.patientId) || conversionKeys.has(l.stageKey)).length },
      { id: 'lost', label: 'Perdidos', icon: XCircle, tone: 'danger', value: tenantLeads.filter((l) => lostKeys.has(l.stageKey)).length },
    ];
  }, [activeStages, stages, tenantLeads, overdueLeadIds]);

  const doMoveLead = useCallback((leadId, newStageKey, lossReason = null) => {
    const previous = allLeads;
    setAllLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stageKey: newStageKey } : l)));
    try {
      moveLeadToStage(user, leadId, newStageKey, { lossReason });
      const stageLabel = stages.find((s) => s.key === newStageKey)?.label || newStageKey;
      showToast('success', `Lead movido para “${stageLabel}”.`);
      reload();
    } catch (err) {
      setAllLeads(previous);
      showToast('error', err?.message || 'Falha ao mover lead. Tente novamente.');
    }
  }, [allLeads, user, stages, showToast, reload]);

  const handleMoveLead = useCallback((leadId, newStageKey) => {
    const target = activeStages.find((s) => s.key === newStageKey);
    if (!target) return;
    if (target.stageType === STAGE_TYPE.LOST) {
      const lead = tenantLeads.find((l) => l.id === leadId);
      if (lead) setLostState({ lead, targetStageKey: newStageKey });
      return;
    }
    doMoveLead(leadId, newStageKey);
  }, [activeStages, tenantLeads, doMoveLead]);

  const handleMarkLost = useCallback((lead) => {
    const lostStage = findLostStage(activeStages);
    if (!lostStage) {
      showToast('error', 'Configure uma fase de perda ativa antes de marcar leads como perdidos.');
      return;
    }
    setLostState({ lead, targetStageKey: lostStage.key });
  }, [activeStages, showToast]);

  const handleRegisterContact = useCallback((lead) => {
    try {
      addLeadEvent(user, lead.id, CRM_EVENT_TYPE.CONTACT, { channel: 'manual' });
      showToast('success', `Contato registrado para ${lead.name || 'o lead'}.`);
      reload();
    } catch (err) {
      showToast('error', err?.message || 'Erro ao registrar contato.');
    }
  }, [user, showToast, reload]);

  const handleHideStage = useCallback((stage) => {
    const count = leadCounts[stage.key] || 0;
    if (count > 0) {
      const ok = window.confirm(
        `A fase “${stage.label}” possui ${count} lead(s). Eles ficarão ocultos no quadro até a fase ser reativada. Continuar?`
      );
      if (!ok) return;
    }
    try {
      setPipelineStageActive(user, stage.id, false);
      showToast('success', `Fase “${stage.label}” oculta. Reative em “Configurar fases”.`);
      reload();
    } catch (err) {
      showToast('error', err?.message || 'Não foi possível ocultar a fase.');
    }
  }, [user, leadCounts, showToast, reload]);

  const handleDeleteStage = useCallback((stage) => {
    try {
      deletePipelineStage(user, stage.id);
      showToast('success', `Fase “${stage.label}” excluída.`);
      reload();
    } catch (err) {
      showToast('error', err?.message || 'Não foi possível excluir a fase.');
    }
  }, [user, showToast, reload]);

  const pipelineIsEmpty = tenantLeads.length === 0;

  return (
    <div className="crm-pipeline-page">
      <header className="crm-pipeline-header">
        <div className="crm-pipeline-header-text">
          <h1>Pipeline de Atendimento</h1>
          <p>Organize seus leads em etapas personalizadas até o agendamento ou conversão em paciente.</p>
        </div>
        <div className="crm-pipeline-header-actions">
          <Button
            type="button"
            variant="ghost"
            icon={Filter}
            aria-expanded={showFilters}
            className={hasActivePipelineFilters(filters) ? 'crm-pipeline-filters-active' : ''}
            onClick={() => setShowFilters((v) => !v)}
          >
            Filtros
          </Button>
          <Button type="button" variant="secondary" icon={Settings2} onClick={() => setConfigOpen(true)}>
            Configurar fases
          </Button>
          <GradientButton icon={Plus} ariaLabel="Cadastrar novo lead" onClick={() => setNewLeadStageKey(activeStages[0]?.key || '')}>
            Novo lead
          </GradientButton>
        </div>
      </header>

      <div className="crm-pipeline-summary">
        {summary.map(({ id, label, value, icon: Icon, tone }) => (
          <div key={id} className={`crm-pipeline-summary-card crm-pipeline-summary-card--${tone}`}>
            <span className="crm-pipeline-summary-icon" aria-hidden="true"><Icon size={18} /></span>
            <div>
              <strong className="crm-pipeline-summary-value">{value}</strong>
              <span className="crm-pipeline-summary-label">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {showFilters && (
        <PipelineFilters
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_PIPELINE_FILTERS)}
          users={users}
          stages={activeStages}
          sourceLabels={sourceLabels}
          interestLabels={interestLabels}
        />
      )}

      {pipelineIsEmpty ? (
        <div className="crm-pipeline-empty">
          <h2>Seu pipeline ainda está vazio</h2>
          <p>Cadastre o primeiro lead para iniciar o acompanhamento comercial.</p>
          <GradientButton icon={Plus} ariaLabel="Cadastrar lead" onClick={() => setNewLeadStageKey(activeStages[0]?.key || '')}>
            Cadastrar lead
          </GradientButton>
        </div>
      ) : (
        <div className="crm-pipeline-board">
          {activeStages.map((stage) => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              leads={leadsByStage[stage.key] || []}
              onMoveLead={handleMoveLead}
              onAddLead={(s) => setNewLeadStageKey(s.key)}
              onEditStage={() => setConfigOpen(true)}
              onHideStage={handleHideStage}
              onDeleteStage={handleDeleteStage}
              renderLeadCard={(lead, st) => (
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  stage={st}
                  usersById={usersById}
                  refreshToken={version}
                  onOpenDetails={(l) => setDetailsLeadId(l.id)}
                  onRegisterContact={handleRegisterContact}
                  onSchedule={setScheduleLead}
                  onConvert={setConvertLead}
                  onMarkLost={handleMarkLost}
                />
              )}
            />
          ))}
        </div>
      )}

      <PipelineStagesConfigModal
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        user={user}
        stages={stages}
        leadCounts={leadCounts}
        onSaved={() => {
          showToast('success', 'Fases do pipeline atualizadas.');
          reload();
        }}
      />

      <PipelineLeadModal
        open={newLeadStageKey !== null}
        onClose={() => setNewLeadStageKey(null)}
        user={user}
        users={users}
        stages={activeStages}
        initialStageKey={newLeadStageKey || undefined}
        onCreated={(lead) => {
          showToast('success', `Lead “${lead.name}” cadastrado.`);
          reload();
        }}
      />

      <LeadDetailsModal
        open={Boolean(detailsLeadId)}
        onClose={() => setDetailsLeadId(null)}
        leadId={detailsLeadId}
        user={user}
        users={users}
        onChanged={reload}
        onConvert={(lead) => setConvertLead(lead)}
        onMarkLost={(lead) => {
          setDetailsLeadId(null);
          handleMarkLost(lead);
        }}
        onSchedule={(lead) => setScheduleLead(lead)}
      />

      <MarkLeadLostModal
        open={Boolean(lostState)}
        onClose={() => setLostState(null)}
        lead={lostState?.lead}
        tenantId={tenantId}
        onConfirm={(reason) => {
          doMoveLead(lostState.lead.id, lostState.targetStageKey, reason);
          setLostState(null);
        }}
      />

      <ConvertLeadToPatientModal
        open={Boolean(convertLead)}
        onClose={() => setConvertLead(null)}
        lead={convertLead}
        user={user}
        onSuccess={(patientName) => {
          showToast('success', `Lead convertido em paciente${patientName ? `: ${patientName}` : ''}.`);
          reload();
        }}
      />

      <ScheduleFromLeadModal
        open={Boolean(scheduleLead)}
        onClose={() => setScheduleLead(null)}
        lead={scheduleLead || undefined}
        user={user}
        onSuccess={() => {
          showToast('success', 'Avaliação agendada com sucesso.');
          reload();
        }}
      />

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
