import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CalendarDays, Clock3, Plus, UserCheck, Users } from 'lucide-react';
import { createLead, listLeads, getPipelineStages } from '../../services/crmService.js';
import { useAuth } from '../../auth/useAuth.js';
import { loadDb } from '../../db/index.js';
import GradientButton from '../../components/GradientButton.jsx';
import { CaptacaoLeadForm } from '../../crm/ui/CaptacaoLeadForm.jsx';
import { CaptacaoLeadList } from '../../crm/ui/CaptacaoLeadList.jsx';
import { ConvertLeadToPatientModal } from '../../crm/ui/ConvertLeadToPatientModal.jsx';
import { useCrmTenantLabels } from '../../crm/hooks/useCrmTenantLabels.js';

const RECENT_LEADS_LIMIT = 12;
const TOAST_DURATION_MS = 4000;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Início da semana (segunda-feira, 00h). */
const startOfWeek = () => {
  const d = startOfToday();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
};

const buildKpis = (leads) => {
  const todayIso = startOfToday().toISOString();
  const weekIso = startOfWeek().toISOString();
  return {
    today: leads.filter((l) => (l.createdAt || '') >= todayIso).length,
    week: leads.filter((l) => (l.createdAt || '') >= weekIso).length,
    waiting: leads.filter((l) => l.stageKey === 'novo_lead' && !l.patientId).length,
    converted: leads.filter((l) => Boolean(l.patientId)).length,
  };
};

export default function CrmCaptacaoPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || user?.tenant_id || '';
  const { sourceLabels, interestLabels } = useCrmTenantLabels(user, tenantId);
  const [listVersion, setListVersion] = useState(0);
  const [toast, setToast] = useState(null);
  const [leadToConvert, setLeadToConvert] = useState(null);
  const nameInputRef = useRef(null);

  const users = useMemo(() => loadDb().users || [], []);
  const stages = useMemo(() => getPipelineStages(), []);
  const leads = useMemo(() => listLeads(), [listVersion]);
  const recentLeads = useMemo(() => leads.slice(0, RECENT_LEADS_LIMIT), [leads]);
  const kpis = useMemo(() => buildKpis(leads), [leads]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((type, message) => setToast({ type, message }), []);

  const focusForm = useCallback(() => {
    nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameInputRef.current?.focus({ preventScroll: true });
  }, []);

  const handleCreateLead = useCallback((payload) => {
    try {
      createLead(user, payload);
      setListVersion((v) => v + 1);
      showToast('success', 'Lead cadastrado com sucesso!');
      return true;
    } catch (err) {
      showToast('error', err?.message || 'Erro ao cadastrar lead.');
      return false;
    }
  }, [user, showToast]);

  const handleConverted = useCallback((patientName) => {
    setListVersion((v) => v + 1);
    showToast('success', `Lead convertido em paciente${patientName ? `: ${patientName}` : ''}.`);
  }, [showToast]);

  const kpiCards = [
    { id: 'today', label: 'Leads hoje', value: kpis.today, icon: Users, tone: 'primary' },
    { id: 'week', label: 'Leads da semana', value: kpis.week, icon: CalendarDays, tone: 'accent' },
    { id: 'waiting', label: 'Aguardando contato', value: kpis.waiting, icon: Clock3, tone: 'warning' },
    { id: 'converted', label: 'Convertidos em paciente', value: kpis.converted, icon: UserCheck, tone: 'success' },
  ];

  return (
    <div className="crm-captacao-page">
      <header className="crm-captacao-header">
        <div className="crm-captacao-header-text">
          <h1>Captação de Leads</h1>
          <p className="crm-captacao-subtitle">
            Cadastre, acompanhe e organize novos interessados antes de virarem pacientes.
          </p>
        </div>
        <GradientButton icon={Plus} onClick={focusForm} ariaLabel="Cadastrar novo lead">
          Novo lead
        </GradientButton>
      </header>

      <div className="crm-captacao-kpis">
        {kpiCards.map(({ id, label, value, icon: Icon, tone }) => (
          <div key={id} className={`crm-captacao-kpi-card crm-captacao-kpi-card--${tone}`}>
            <span className="crm-captacao-kpi-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <div className="crm-captacao-kpi-text">
              <strong className="crm-captacao-kpi-value">{value}</strong>
              <span className="crm-captacao-kpi-label">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="crm-captacao-layout">
        <CaptacaoLeadForm
          users={users}
          onCreate={handleCreateLead}
          nameInputRef={nameInputRef}
          sourceLabels={sourceLabels}
          interestLabels={interestLabels}
        />
        <CaptacaoLeadList
          leads={recentLeads}
          totalCount={leads.length}
          stages={stages}
          users={users}
          onConvert={setLeadToConvert}
          onRegisterFirst={focusForm}
        />
      </div>

      <ConvertLeadToPatientModal
        open={Boolean(leadToConvert)}
        onClose={() => setLeadToConvert(null)}
        lead={leadToConvert}
        user={user}
        onSuccess={handleConverted}
      />

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
