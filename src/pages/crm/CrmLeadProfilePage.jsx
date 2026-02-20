import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CrmLayout } from '../../crm/ui/CrmLayout.jsx';
import { ScheduleFromLeadModal } from '../../crm/ui/ScheduleFromLeadModal.jsx';
import { LeadTimeline } from '../../crm/ui/LeadTimeline.jsx';
import { LeadTagsTab } from '../../crm/ui/LeadTagsTab.jsx';
import { getStatusLabel } from '../../utils/timelineLabels.js';
import {
  getLeadById,
  listLeadEvents,
  listMessageLogs,
  listBudgetLinks,
  buildWhatsAppLink,
  createFollowUp,
  LEAD_SOURCE_LABELS,
} from '../../services/crmService.js';
import { LeadTasksTab } from '../../crm/ui/LeadTasksTab.jsx';
import { linkAppointmentAndComplete } from '../../services/crmTaskService.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { ArrowLeft, MessageCircle, Tag, Calendar, FileText } from 'lucide-react';

const TABS = [
  { id: 'dados', label: 'Dados', icon: FileText },
  { id: 'timeline', label: 'Timeline', icon: MessageCircle },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'tarefas', label: 'Tarefas / Follow-up', icon: Calendar },
  { id: 'orcamentos', label: 'Orçamentos', icon: FileText },
];

/**
 * Perfil do lead /crm/leads/:id com abas: Dados, Timeline, Tags, Tarefas, Orçamentos.
 */
export default function CrmLeadProfilePage() {
  const { id: leadId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('dados');
  const [refreshKey, setRefreshKey] = useState(0);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleFromTask, setScheduleFromTask] = useState(null);

  const lead = useMemo(() => (leadId ? getLeadById(leadId) : null), [leadId]);
  const events = useMemo(() => (leadId ? listLeadEvents(leadId) : []), [leadId, refreshKey]);
  const messageLogs = useMemo(() => (leadId ? listMessageLogs(leadId) : []), [leadId]);
  const budgetLinks = useMemo(() => (leadId ? listBudgetLinks(leadId) : []), [leadId]);

  const whatsAppLink = useMemo(
    () => (lead?.phone ? buildWhatsAppLink(lead.phone) : ''),
    [lead?.phone]
  );

  const phoneForEvent = useCallback((ev) => {
    const p = ev.data?.phone || lead?.phone;
    return p ? String(p).replace(/\D/g, '') : '';
  }, [lead?.phone]);

  const handleCreateFollowUp = useCallback(() => {
    if (!user || !leadId) return;
    const due = new Date();
    due.setDate(due.getDate() + 3);
    createFollowUp(user, leadId, { dueAt: due.toISOString(), type: 'retorno', notes: 'Follow-up criado pela timeline' });
    setRefreshKey((k) => k + 1);
  }, [user, leadId]);

  if (!leadId) {
    return (
      <CrmLayout title="Perfil Lead" description="Selecione um lead na lista ou no pipeline.">
        <button type="button" className="button primary" onClick={() => navigate('/crm/leads')}>
          Ir para lista de leads
        </button>
      </CrmLayout>
    );
  }

  if (!lead) {
    return (
      <CrmLayout title="Lead não encontrado" description={`ID: ${leadId}`}>
        <button type="button" className="button secondary" onClick={() => navigate('/crm/leads')}>
          <ArrowLeft size={16} /> Voltar
        </button>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout
      title={lead.name || 'Lead'}
      description={`Origem: ${LEAD_SOURCE_LABELS[lead.source] || lead.source} · Estágio: ${getStatusLabel(lead.stageKey) || lead.stageKey || '—'}`}
    >
      <div className="crm-profile-header">
        <button type="button" className="button secondary" onClick={() => navigate('/crm/leads')}>
          <ArrowLeft size={16} /> Voltar
        </button>
        {whatsAppLink && (
          <a href={whatsAppLink} target="_blank" rel="noopener noreferrer" className="button primary">
            <MessageCircle size={16} /> Abrir WhatsApp
          </a>
        )}
      </div>

      <div className="crm-profile-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`crm-profile-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon && <tab.icon size={16} />}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="crm-profile-content">
        {activeTab === 'dados' && (
          <div className="crm-profile-dados">
            <dl className="crm-profile-dl">
              <dt>Nome</dt><dd>{lead.name || '—'}</dd>
              <dt>Telefone</dt><dd>{lead.phone || '—'}</dd>
              <dt>Origem</dt><dd>{LEAD_SOURCE_LABELS[lead.source] || lead.source || '—'}</dd>
              <dt>Interesse</dt><dd>{lead.interest || '—'}</dd>
              <dt>Estágio</dt><dd>{getStatusLabel(lead.stageKey) || '—'}</dd>
              <dt>Observações</dt><dd>{lead.notes || '—'}</dd>
            </dl>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="crm-profile-timeline">
            <LeadTimeline
              events={events}
              lead={lead}
              loading={false}
              phoneForEvent={phoneForEvent}
              onCreateFollowUp={handleCreateFollowUp}
              onOpenSchedule={() => setScheduleModalOpen(true)}
            />
          </div>
        )}

        {activeTab === 'tags' && (
          <div className="crm-profile-tags">
            <LeadTagsTab
              leadId={leadId}
              lead={lead}
              onUpdate={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        )}

        {activeTab === 'tarefas' && (
          <div className="crm-profile-tarefas">
            <LeadTasksTab
              leadId={leadId}
              lead={lead}
              user={user}
              onRefresh={() => setRefreshKey((k) => k + 1)}
              onOpenSchedule={(task) => {
                setScheduleFromTask(task);
                setScheduleModalOpen(true);
              }}
            />
          </div>
        )}

        {activeTab === 'orcamentos' && (
          <div className="crm-profile-orcamentos">
            {budgetLinks.length === 0 ? (
              <p className="muted">Nenhum orçamento vinculado.</p>
            ) : (
              <ul className="crm-budget-list">
                {budgetLinks.map((b) => (
                  <li key={b.id}>Orçamento {b.budgetId}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <ScheduleFromLeadModal
        open={scheduleModalOpen}
        onClose={() => { setScheduleModalOpen(false); setScheduleFromTask(null); }}
        lead={lead}
        user={user}
        taskId={scheduleFromTask?.id}
        onSuccess={(appointment) => {
          if (scheduleFromTask?.id && appointment?.id && user) {
            try {
              linkAppointmentAndComplete(user, scheduleFromTask.id, appointment.id);
            } catch (_) { /* fallback: apenas fechar e refresh */ }
          }
          setScheduleModalOpen(false);
          setScheduleFromTask(null);
          setRefreshKey((k) => k + 1);
        }}
      />
    </CrmLayout>
  );
}
