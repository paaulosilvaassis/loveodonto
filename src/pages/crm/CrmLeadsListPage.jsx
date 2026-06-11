import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CalendarCheck, Download, Filter, PhoneCall, Plus, Upload, UserCheck, UserPlus, Users, XCircle,
} from 'lucide-react';
import GradientButton from '../../components/GradientButton.jsx';
import Button from '../../components/Button.jsx';
import { PipelineFilters, EMPTY_PIPELINE_FILTERS, hasActivePipelineFilters } from '../../crm/ui/PipelineFilters.jsx';
import { LeadsTable } from '../../crm/ui/LeadsTable.jsx';
import { ImportLeadsModal } from '../../crm/ui/ImportLeadsModal.jsx';
import { PipelineLeadModal } from '../../crm/ui/PipelineLeadModal.jsx';
import { LeadDetailsModal } from '../../crm/ui/LeadDetailsModal.jsx';
import { MarkLeadLostModal } from '../../crm/ui/MarkLeadLostModal.jsx';
import { ConvertLeadToPatientModal } from '../../crm/ui/ConvertLeadToPatientModal.jsx';
import { ScheduleFromLeadModal } from '../../crm/ui/ScheduleFromLeadModal.jsx';
import {
  listLeads, moveLeadToStage, addLeadEvent, listFollowUps, CRM_EVENT_TYPE,
} from '../../services/crmService.js';
import { listTasks, TASK_STATUS } from '../../services/crmTaskService.js';
import {
  STAGE_TYPE,
  ensurePipelineStagesForTenant,
  listPipelineStagesForTenant,
  findLostStage,
} from '../../services/crmPipelineStageService.js';
import { listTags } from '../../services/crmTagService.js';
import { buildLeadsCsv, downloadCsv } from '../../crm/leadsCsv.js';
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

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Página Leads: visão comercial completa dos leads captados,
 * com KPIs, filtros avançados, tabela moderna e ações rápidas.
 */
export default function CrmLeadsListPage() {
  const { user } = useAuth();
  const location = useLocation();
  const tenantId = user?.tenantId || user?.tenant_id || '';
  const { sourceLabels, interestLabels } = useCrmTenantLabels(user, tenantId);
  const dashboardNav = location.state || {};
  const initialStageKey = dashboardNav.filterStageKey || '';
  const hasDashboardFilter = Boolean(
    dashboardNav.stalledDays
    || dashboardNav.semFollowUp
    || dashboardNav.noShow
    || dashboardNav.awaitingReturn
    || dashboardNav.lostThisMonth
    || initialStageKey
  );

  const [stages, setStages] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [version, setVersion] = useState(0);
  const [filters, setFilters] = useState({ ...EMPTY_PIPELINE_FILTERS, stageKey: initialStageKey });
  const [showFilters, setShowFilters] = useState(hasDashboardFilter);
  const [toast, setToast] = useState(null);
  const [newLeadOpen, setNewLeadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
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
  const tags = useMemo(() => listTags(), []);

  const activeStages = useMemo(() => stages.filter((s) => s.isActive !== false), [stages]);
  const stageByKey = useMemo(
    () => Object.fromEntries(stages.map((s) => [s.key, s])),
    [stages]
  );

  const tenantLeads = useMemo(
    () => allLeads.filter((l) => l.tenant_id === tenantId || !l.tenant_id),
    [allLeads, tenantId]
  );

  const nextFollowUpByLeadId = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const map = {};
    listFollowUps({ pending: true }).forEach((f) => {
      if (map[f.leadId]) return;
      const due = f.dueAt ? startOfDay(f.dueAt).getTime() : null;
      map[f.leadId] = { ...f, overdue: due != null && due < today, dueToday: due === today };
    });
    return map;
  }, [version]);

  const eventsByLeadId = useMemo(() => {
    const map = {};
    (loadDb().crmLeadEvents || []).forEach((ev) => {
      if (!map[ev.leadId]) map[ev.leadId] = [];
      map[ev.leadId].push(ev);
    });
    return map;
  }, [version]);

  const lostKeys = useMemo(
    () => new Set(stages.filter((s) => s.stageType === STAGE_TYPE.LOST).map((s) => s.key)),
    [stages]
  );
  const conversionKeys = useMemo(
    () => new Set(stages.filter((s) => s.stageType === STAGE_TYPE.CONVERSION).map((s) => s.key)),
    [stages]
  );

  const isLeadOpen = useCallback((lead) => (
    !lead.patientId && !lostKeys.has(lead.stageKey) && !conversionKeys.has(lead.stageKey)
  ), [lostKeys, conversionKeys]);

  const lastActivityMs = useCallback((lead) => {
    const evs = eventsByLeadId[lead.id] || [];
    const lastEv = evs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return lastEv
      ? new Date(lastEv.createdAt).getTime()
      : new Date(lead.updatedAt || lead.createdAt).getTime();
  }, [eventsByLeadId]);

  const matchesDashboardAlert = useCallback((lead) => {
    const now = Date.now();
    if (dashboardNav.stalledDays) {
      const cutoff = now - Number(dashboardNav.stalledDays) * 24 * 60 * 60 * 1000;
      if (!isLeadOpen(lead) || lastActivityMs(lead) >= cutoff) return false;
    }
    if (dashboardNav.semFollowUp) {
      const pendingTasks = listTasks({ status: TASK_STATUS.PENDING });
      const leadIdsComTask = new Set(pendingTasks.filter((t) => t.leadId).map((t) => t.leadId));
      const leadIdsComFollowUp = new Set(listFollowUps({ pending: true }).map((f) => f.leadId));
      if (!isLeadOpen(lead) || leadIdsComTask.has(lead.id) || leadIdsComFollowUp.has(lead.id)) return false;
    }
    if (dashboardNav.noShow) {
      if (lead.stageKey !== 'avaliacao_agendada') return false;
      const apptEvents = (eventsByLeadId[lead.id] || [])
        .filter((e) => e.type === CRM_EVENT_TYPE.APPOINTMENT_SCHEDULED)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (!apptEvents.length) return false;
      const apptDate = apptEvents[0].data?.date;
      if (!apptDate) return false;
      const todayStart = startOfDay(new Date());
      if (new Date(`${apptDate}T23:59:59`) >= todayStart) return false;
    }
    if (dashboardNav.awaitingReturn) {
      if (!['orcamento_apresentado', 'em_negociacao'].includes(lead.stageKey || '')) return false;
      const retornoCutoff = now - 7 * 24 * 60 * 60 * 1000;
      if (lastActivityMs(lead) >= retornoCutoff) return false;
    }
    if (dashboardNav.lostThisMonth) {
      if (!lostKeys.has(lead.stageKey)) return false;
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const updated = new Date(lead.updatedAt || lead.createdAt);
      if (updated < monthStart) return false;
    }
    return true;
  }, [dashboardNav, isLeadOpen, lastActivityMs, eventsByLeadId, lostKeys]);

  const filteredLeads = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const searchDigits = filters.search.replace(/\D/g, '');
    const fromDashboard = hasDashboardFilter && (
      dashboardNav.stalledDays
      || dashboardNav.semFollowUp
      || dashboardNav.noShow
      || dashboardNav.awaitingReturn
      || dashboardNav.lostThisMonth
    );
    return tenantLeads.filter((l) => {
      if (fromDashboard && !matchesDashboardAlert(l)) return false;
      if (search && !(
        (l.name || '').toLowerCase().includes(search) ||
        (searchDigits && (l.phone || '').includes(searchDigits)) ||
        (l.interest || '').toLowerCase().includes(search)
      )) return false;
      if (filters.interest && l.interest !== filters.interest) return false;
      if (filters.source && l.source !== filters.source) return false;
      if (filters.assignedToUserId && l.assignedToUserId !== filters.assignedToUserId) return false;
      if (filters.stageKey && l.stageKey !== filters.stageKey) return false;
      if (filters.tagId && !(l.tagList || []).some((t) => t.id === filters.tagId)) return false;
      if (!matchesPeriod(l, filters.createdFrom, filters.createdTo)) return false;
      if (filters.overdueOnly && !nextFollowUpByLeadId[l.id]?.overdue) return false;
      return true;
    });
  }, [tenantLeads, filters, nextFollowUpByLeadId, hasDashboardFilter, dashboardNav, matchesDashboardAlert]);

  const kpis = useMemo(() => {
    const firstStage = activeStages.find((s) => s.stageType === STAGE_TYPE.NORMAL) || activeStages[0];
    const normalKeys = new Set(activeStages.filter((s) => s.stageType === STAGE_TYPE.NORMAL).map((s) => s.key));
    const conversionKeys = new Set(activeStages.filter((s) => s.stageType === STAGE_TYPE.CONVERSION).map((s) => s.key));
    const lostKeys = new Set(stages.filter((s) => s.stageType === STAGE_TYPE.LOST).map((s) => s.key));
    const open = (l) => !l.patientId && !lostKeys.has(l.stageKey);
    return [
      { id: 'total', label: 'Total de leads', sub: 'Todos os leads captados', icon: Users, tone: 'primary', value: tenantLeads.length },
      { id: 'new', label: 'Novos leads', sub: 'Aguardando primeiro contato', icon: UserPlus, tone: 'accent', value: firstStage ? tenantLeads.filter((l) => open(l) && l.stageKey === firstStage.key).length : 0 },
      { id: 'progress', label: 'Em atendimento', sub: 'Em negociação no pipeline', icon: PhoneCall, tone: 'warning', value: tenantLeads.filter((l) => open(l) && normalKeys.has(l.stageKey) && l.stageKey !== firstStage?.key).length },
      { id: 'scheduled', label: 'Agendados', sub: 'Avaliação marcada', icon: CalendarCheck, tone: 'accent', value: tenantLeads.filter((l) => l.stageKey === 'avaliacao_agendada').length },
      { id: 'converted', label: 'Convertidos', sub: 'Viraram pacientes', icon: UserCheck, tone: 'success', value: tenantLeads.filter((l) => Boolean(l.patientId) || conversionKeys.has(l.stageKey)).length },
      { id: 'lost', label: 'Perdidos', sub: 'Oportunidades perdidas', icon: XCircle, tone: 'danger', value: tenantLeads.filter((l) => lostKeys.has(l.stageKey)).length },
    ];
  }, [activeStages, stages, tenantLeads]);

  const handleRegisterContact = useCallback((lead) => {
    try {
      addLeadEvent(user, lead.id, CRM_EVENT_TYPE.CONTACT, { channel: 'manual' });
      showToast('success', `Contato registrado para ${lead.name || 'o lead'}.`);
      reload();
    } catch (err) {
      showToast('error', err?.message || 'Erro ao registrar contato.');
    }
  }, [user, showToast, reload]);

  const handleMarkLost = useCallback((lead) => {
    const lostStage = findLostStage(activeStages);
    if (!lostStage) {
      showToast('error', 'Configure uma fase de perda ativa antes de marcar leads como perdidos.');
      return;
    }
    setLostState({ lead, targetStageKey: lostStage.key });
  }, [activeStages, showToast]);

  const handleConfirmLost = useCallback((reason) => {
    try {
      moveLeadToStage(user, lostState.lead.id, lostState.targetStageKey, { lossReason: reason });
      showToast('success', `Lead “${lostState.lead.name || ''}” marcado como perdido.`);
      reload();
    } catch (err) {
      showToast('error', err?.message || 'Falha ao marcar lead como perdido.');
    } finally {
      setLostState(null);
    }
  }, [user, lostState, showToast, reload]);

  const handleExport = useCallback(() => {
    if (!filteredLeads.length) {
      showToast('error', 'Nenhum lead para exportar com os filtros atuais.');
      return;
    }
    const stageLabelByKey = Object.fromEntries(stages.map((s) => [s.key, s.label]));
    const csv = buildLeadsCsv(filteredLeads, { stageLabelByKey, userNameById: usersById });
    downloadCsv(csv, `leads-${new Date().toISOString().slice(0, 10)}.csv`);
    showToast('success', `${filteredLeads.length} lead(s) exportado(s).`);
  }, [filteredLeads, stages, usersById, showToast]);

  const clearFilters = useCallback(() => setFilters(EMPTY_PIPELINE_FILTERS), []);
  const hasFilters = hasActivePipelineFilters(filters);

  return (
    <div className="crm-leads-page">
      <header className="crm-pipeline-header">
        <div className="crm-pipeline-header-text">
          <h1>Leads</h1>
          <p>Gerencie todos os leads captados e acompanhe oportunidades comerciais.</p>
        </div>
        <div className="crm-pipeline-header-actions">
          <Button
            type="button"
            variant="ghost"
            icon={Filter}
            aria-expanded={showFilters}
            className={hasFilters ? 'crm-pipeline-filters-active' : ''}
            onClick={() => setShowFilters((v) => !v)}
          >
            Filtros
          </Button>
          <Button type="button" variant="ghost" icon={Download} onClick={handleExport}>
            Exportar
          </Button>
          <Button type="button" variant="secondary" icon={Upload} onClick={() => setImportOpen(true)}>
            Importar leads
          </Button>
          <GradientButton icon={Plus} ariaLabel="Cadastrar novo lead" onClick={() => setNewLeadOpen(true)}>
            Novo lead
          </GradientButton>
        </div>
      </header>

      <div className="crm-leads-kpis">
        {kpis.map(({ id, label, sub, value, icon: Icon, tone }) => (
          <div key={id} className={`crm-pipeline-summary-card crm-pipeline-summary-card--${tone}`}>
            <span className="crm-pipeline-summary-icon" aria-hidden="true"><Icon size={18} /></span>
            <div>
              <strong className="crm-pipeline-summary-value">{value}</strong>
              <span className="crm-pipeline-summary-label">{label}</span>
              <span className="crm-leads-kpi-sub">{sub}</span>
            </div>
          </div>
        ))}
      </div>

      {showFilters && (
        <PipelineFilters
          filters={filters}
          onChange={setFilters}
          onClear={clearFilters}
          users={users}
          stages={activeStages}
          tags={tags}
          sourceLabels={sourceLabels}
          interestLabels={interestLabels}
        />
      )}

      <LeadsTable
        leads={filteredLeads}
        stageByKey={stageByKey}
        usersById={usersById}
        nextFollowUpByLeadId={nextFollowUpByLeadId}
        hasFilters={hasFilters}
        onOpenDetails={(lead) => setDetailsLeadId(lead.id)}
        onRegisterContact={handleRegisterContact}
        onConvert={setConvertLead}
        onMarkLost={handleMarkLost}
        onCreateLead={() => setNewLeadOpen(true)}
        onClearFilters={clearFilters}
      />

      <PipelineLeadModal
        open={newLeadOpen}
        onClose={() => setNewLeadOpen(false)}
        user={user}
        users={users}
        stages={activeStages}
        onCreated={(lead) => {
          showToast('success', `Lead “${lead.name}” cadastrado.`);
          reload();
        }}
      />

      <ImportLeadsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        user={user}
        onImported={(count) => {
          showToast('success', `${count} lead(s) importado(s) com sucesso.`);
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
        onConfirm={handleConfirmLost}
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
