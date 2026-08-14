import { useEffect, useState, useMemo, useRef, Component } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { loadDb } from '../db/index.js';
import { createId } from '../services/helpers.js';
import { getAppointmentDetails, APPOINTMENT_STATUS } from '../services/appointmentService.js';
import { 
  saveClinicalEvolution, 
  addProcedure, 
  addPlannedProcedure,
  updatePlannedProcedure,
  removePlannedProcedure,
  getClinicalData, 
  logClinicalEvent,
  getClinicalEvents,
  listClinicalEvolutions,
  updateClinicalEvolution,
  saveBudget,
  getBudget,
  updateBudgetStatus,
  BUDGET_STATUS
} from '../services/clinicalService.js';
// budgetsService / budgetItemsService quarantined (Phase 9.4A) — sem PostgREST até 9.4B.
import { listBudgets } from '../services/budgetsService.js';
import { listBudgetItemsByBudgetIds } from '../services/budgetItemsService.js';
import { supabase } from '../lib/supabaseClient.ts';
import { SectionCard } from '../components/SectionCard.jsx';
import { 
  FileText, 
  ClipboardList, 
  Calendar, 
  DollarSign, 
  FileCheck, 
  CreditCard,
  Stethoscope,
  Activity,
  X,
  Save,
  Plus,
  Download,
  Send,
  CheckCircle2,
  ArrowLeft,
  Edit,
  Trash2,
  FileText as FileTextIcon,
  FileSignature,
  Clock,
  History,
} from 'lucide-react';
import ProcedureSelectorModal from '../components/ProcedureSelectorModal.jsx';
import DocumentsSection from '../components/clinical/DocumentsSection.jsx';
import { ClinicalPlanningSection } from '../components/clinical/ClinicalPlanningSection.jsx';
import { ClinicalStepNav } from '../components/clinical/ClinicalStepNav.jsx';
import { ClinicalStageShell, ClinicalBlock, ClinicalBtn } from '../components/clinical/ClinicalStageShell.jsx';
import { ClinicalBudgetSection } from '../components/clinical/ClinicalBudgetSection.jsx';
import { ClinicalContractSection } from '../components/clinical/ClinicalContractSection.jsx';
import { ClinicalSignatureSection } from '../components/clinical/ClinicalSignatureSection.jsx';
import {
  CLINICAL_NAV_ITEMS,
  canAccessClinicalSection,
  sectionLockMessage,
  getClinicalWorkflowState,
} from '../components/clinical/clinicalAppointmentConfig.js';
import { findBudgetRecord, buildClinicalAppointmentUrl, resolveEffectiveViewBudgetId } from '../services/budgetNavigationService.js';
import { isSafeClinicalReturnUrl } from '../contracts/contractPrerequisitesResolution.js';
import { getGeneratedContract } from '../services/contractService.js';
import { createReceivablesFromApprovedBudget } from '../services/clinicalBudgetFinance.js';
import { getLeadById } from '../services/crmService.js';
import { RegisterPatientFromLeadModal } from '../components/agenda/RegisterPatientFromLeadModal.jsx';
import { listProcedures, getPriceTableForPatient, getDefaultPriceTable, PROCEDURE_STATUS } from '../services/priceBaseService.js';
import { formatBudgetEventLabel } from '../components/clinical/budget/budgetEventLabels.js';
import { formatContractEventLabel } from '../components/clinical/contract/contractEventLabels.js';

function ClinicalAppointmentPageContent() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rawViewBudgetId = searchParams.get('budgetId') || location.state?.budgetId || null;
  const forceHistoricalView = location.state?.viewMode === true;
  const viewContractId = searchParams.get('contractId') || location.state?.contractId || null;
  const sectionParam = searchParams.get('section') || location.state?.section || null;
  const docCategoryParam = searchParams.get('docCategory') || location.state?.docCategory || null;
  const docTemplateParam = searchParams.get('docTemplate') || location.state?.docTemplate || null;
  const returnToParam = searchParams.get('returnTo') || location.state?.returnTo || null;
  const revalidateParam = searchParams.get('revalidate') === '1';
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('planejamento');
  const [appointment, setAppointment] = useState(null);
  const [patient, setPatient] = useState(null);
  const [professional, setProfessional] = useState(null);
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showRegisterFromLead, setShowRegisterFromLead] = useState(false);
  const [sectionToast, setSectionToast] = useState(null);
  const [planningRefreshKey, setPlanningRefreshKey] = useState(0);
  const [workflowRefreshKey, setWorkflowRefreshKey] = useState(0);
  const [isHistoricalBudgetView, setIsHistoricalBudgetView] = useState(false);

  const viewBudgetId = useMemo(
    () => resolveEffectiveViewBudgetId(appointmentId, rawViewBudgetId, {
      forceHistorical: forceHistoricalView,
      appointmentStatus: appointment?.status,
    }),
    [appointmentId, rawViewBudgetId, forceHistoricalView, appointment?.status],
  );

  const bumpWorkflow = () => setWorkflowRefreshKey((key) => key + 1);

  const syncViewBudgetId = (nextBudgetId = null) => {
    const section = searchParams.get('section');
    const contractId = searchParams.get('contractId');
    const url = buildClinicalAppointmentUrl({
      appointmentId,
      budgetId: nextBudgetId,
      contractId,
      section,
    });
    navigate(url, {
      replace: true,
      state: {
        ...location.state,
        budgetId: nextBudgetId || undefined,
        section: section || location.state?.section,
      },
    });
    bumpWorkflow();
  };

  useEffect(() => {
    if (!appointmentId || !appointment) return;
    if (appointment.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO) return;
    if (forceHistoricalView) return;
    if (!rawViewBudgetId || rawViewBudgetId === viewBudgetId) return;
    syncViewBudgetId(viewBudgetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, appointment?.status, rawViewBudgetId, viewBudgetId, forceHistoricalView]);

  useEffect(() => {
    if (location.state?.section) {
      setActiveSection(location.state.section);
    }
  }, [location.state?.section]);

  useEffect(() => {
    if (!sectionParam) return;
    const normalized = sectionParam === 'contrato' ? 'contratos'
      : sectionParam === 'signature' ? 'assinatura'
        : sectionParam;
    setActiveSection(normalized);
  }, [sectionParam]);

  useEffect(() => {
    if (!revalidateParam || activeSection !== 'contratos') return;
    bumpWorkflow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revalidateParam, activeSection, appointmentId, viewBudgetId]);

  useEffect(() => {
    try {
      if (appointmentId) {
        loadAppointmentData();
      } else {
        setError('ID do atendimento não fornecido');
        setLoading(false);
      }
    } catch (err) {
      console.error('Erro no useEffect:', err);
      setError(err.message || 'Erro ao inicializar página');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId, viewBudgetId]);

  const loadAppointmentData = () => {
    try {
      const db = loadDb();
      if (!db) {
        throw new Error('Banco de dados não disponível');
      }

      const details = getAppointmentDetails(appointmentId);
      
      if (!details || !details.appointment) {
        setError('Atendimento não encontrado');
        setLoading(false);
        setTimeout(() => {
          navigate('/gestao-comercial/jornada-do-paciente');
        }, 2000);
        return;
      }

      const apt = details.appointment;
      const historicalBudgetRecord = viewBudgetId
        ? findBudgetRecord({ budgetId: viewBudgetId, appointmentId })
        : null;
      const contractRecord = viewContractId ? getGeneratedContract(viewContractId) : null;
      const allowHistoricalView = Boolean(historicalBudgetRecord?.budget?.id)
        || Boolean(contractRecord && contractRecord.quoteId === appointmentId);

      if (apt.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO && !allowHistoricalView) {
        setError('Atendimento não está em andamento');
        setLoading(false);
        setTimeout(() => {
          navigate('/gestao-comercial/jornada-do-paciente');
        }, 2000);
        return;
      }

      setIsHistoricalBudgetView(allowHistoricalView && apt.status !== APPOINTMENT_STATUS.EM_ATENDIMENTO);
      setAppointment(apt);
      
      // Usar dados já retornados por getAppointmentDetails
      const patientData = details.patient || null;
      setPatient(patientData);

      const professionalData = details.professional || null;
      setProfessional(professionalData);

      const roomData = details.room || null;
      setRoom(roomData);

      setLoading(false);
    } catch (err) {
      console.error('Erro ao carregar dados do atendimento:', err);
      setError(err.message || 'Erro ao carregar dados do atendimento');
      setLoading(false);
      // Navegar após um pequeno delay para evitar problemas de renderização
      setTimeout(() => {
        navigate('/gestao-comercial/jornada-do-paciente');
      }, 2000);
    }
  };

  const workflow = useMemo(
    () => getClinicalWorkflowState(appointmentId, viewBudgetId),
    [appointmentId, viewBudgetId, activeSection, sectionToast, workflowRefreshKey],
  );

  const handleNavClick = (sectionId) => {
    if (!canAccessClinicalSection(sectionId, workflow)) {
      setSectionToast({
        type: 'error',
        message: sectionLockMessage(sectionId, workflow) || 'Etapa bloqueada.',
      });
      setTimeout(() => setSectionToast(null), 4000);
      return;
    }
    setActiveSection(sectionId);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '2rem' }}>
        <div style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>Erro: {error}</div>
        <button 
          type="button" 
          className="button primary"
          onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}
        >
          Voltar para Jornada do Paciente
        </button>
      </div>
    );
  }

  if (!appointment) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando dados do atendimento...</div>
      </div>
    );
  }

  const isLeadWithoutPatient = Boolean(appointment.leadId && !appointment.patientId);
  const leadForRegister = appointment.leadId ? getLeadById(appointment.leadId) : null;

  if (!patient && isLeadWithoutPatient && leadForRegister) {
    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '2rem', maxWidth: 480, margin: '0 auto' }}>
          <div
            role="alert"
            style={{
              marginBottom: '1.5rem',
              padding: '1rem 1.25rem',
              borderRadius: '0.5rem',
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              color: '#92400e',
              fontSize: '0.9375rem',
              lineHeight: 1.5,
              width: '100%',
            }}
          >
            <strong>Paciente não cadastrado</strong>
            <br />
            Este atendimento veio do Pipeline (CRM) e o lead ainda não está vinculado ao cadastro. Cadastre o paciente para continuar o atendimento.
          </div>
          <button
            type="button"
            className="button primary"
            onClick={() => setShowRegisterFromLead(true)}
            style={{ marginBottom: '1rem' }}
          >
            Cadastrar paciente
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}
          >
            Voltar para Jornada do Paciente
          </button>
        </div>
        <RegisterPatientFromLeadModal
          open={showRegisterFromLead}
          onClose={() => setShowRegisterFromLead(false)}
          lead={leadForRegister}
          appointmentId={appointment.id}
          user={user}
          onSuccess={() => {
            setShowRegisterFromLead(false);
            loadAppointmentData();
          }}
        />
      </>
    );
  }

  if (!patient) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Carregando dados do atendimento...</div>
      </div>
    );
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Data não disponível';
    try {
      const date = new Date(dateStr + 'T00:00:00');
      if (isNaN(date.getTime())) return 'Data inválida';
      return date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (err) {
      return 'Data inválida';
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return 'Horário não disponível';
    try {
      return timeStr.slice(0, 5);
    } catch (err) {
      return 'Horário inválido';
    }
  };

  
  // Renderização simplificada para debug
  
  const formatDateShort = (dateStr) => {
    if (!dateStr) return 'â€”';
    try {
      const date = new Date(`${dateStr}T00:00:00`);
      if (Number.isNaN(date.getTime())) return 'â€”';
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return 'â€”';
    }
  };

  return (
    <div className="clinical-appointment-page">
      <header className="clinical-appointment-header">
        <div className="clinical-appointment-header-content">
          <button
            type="button"
            className="clinical-appointment-back-btn"
            onClick={() => navigate(`/atendimento-clinico/${appointmentId}/central`)}
            aria-label="Voltar para Central de Atendimento"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="clinical-appointment-header-info">
            <h1 className="clinical-appointment-header-title">
              {patient?.full_name || patient?.nickname || patient?.social_name || 'Paciente'}
            </h1>
            <div className="clinical-appointment-header-meta">
              <span className="clinical-header-chip">
                Dr(a). {professional?.nomeCompleto || professional?.name || 'Profissional'}
              </span>
              <span className="clinical-header-chip">
                {formatDateShort(appointment?.date)} Â· {appointment?.startTime ? formatTime(appointment.startTime) : 'â€”'}
              </span>
              {room ? <span className="clinical-header-chip">{room.name}</span> : null}
            </div>
          </div>

          <div className="clinical-appointment-header-status-badge">
            <Activity size={14} />
            <span>Em atendimento</span>
          </div>
        </div>
      </header>

      <div className="clinical-appointment-container">
        <main className="clinical-appointment-main">
          <ClinicalStepNav
            items={CLINICAL_NAV_ITEMS}
            activeSection={activeSection}
            workflow={workflow}
            onSelect={handleNavClick}
            getLockMessage={(id) => sectionLockMessage(id, workflow)}
          />

          <div className="clinical-appointment-content">
          {sectionToast && (
            <div className={`toast ${sectionToast.type}`} role="status">
              {sectionToast.message}
            </div>
          )}
          {activeSection === 'planejamento' && (
            <ClinicalPlanningSection
              key={planningRefreshKey}
              appointmentId={appointmentId}
              viewBudgetId={viewBudgetId}
              user={user}
              appointment={appointment}
              patient={patient}
              onNavigateToOrcamento={() => setActiveSection('orcamento')}
              onShowToast={(message) => {
                setSectionToast({ message, type: 'success' });
                setTimeout(() => setSectionToast(null), 3000);
              }}
            />
          )}
          {activeSection === 'orcamento' && (
            canAccessClinicalSection('orcamento', workflow) ? (
              <ClinicalBudgetSection
                appointmentId={appointmentId}
                viewBudgetId={viewBudgetId}
                user={user}
                appointment={appointment}
                patient={patient}
                onNavigateToContract={() => setActiveSection('contratos')}
                onNavigateToPlanning={() => {
                  setPlanningRefreshKey((k) => k + 1);
                  setActiveSection('planejamento');
                }}
                onWorkflowRefresh={bumpWorkflow}
                onActiveBudgetChange={syncViewBudgetId}
                onAppointmentClosed={() => navigate('/gestao-comercial/jornada-do-paciente')}
              />
            ) : (
              <ClinicalSectionLocked message={sectionLockMessage('orcamento', workflow)} onGo={() => setActiveSection('planejamento')} />
            )
          )}
          {activeSection === 'contratos' && (
            canAccessClinicalSection('contratos', workflow) ? (
              <ClinicalContractSection
                appointmentId={appointmentId}
                viewBudgetId={viewBudgetId}
                viewContractId={viewContractId}
                patientId={patient?.id}
                user={user}
                contractAccessible={workflow.contractAccessible}
                budget={workflow.budget}
                appointment={appointment}
                professional={professional}
                onWorkflowRefresh={bumpWorkflow}
              />
            ) : (
              <ClinicalSectionLocked message={sectionLockMessage('contratos', workflow)} onGo={() => setActiveSection('orcamento')} />
            )
          )}
          {activeSection === 'documentos' && patient && (
            canAccessClinicalSection('documentos', workflow) ? (
              <DocumentsSection
                key={`docs-${docCategoryParam || 'default'}-${docTemplateParam || 'none'}`}
                appointmentId={appointmentId}
                patient={patient}
                appointment={appointment}
                professional={professional}
                budgetId={viewBudgetId}
                initialCategory={docCategoryParam}
                initialTemplateKey={docTemplateParam}
                returnToContractHref={returnToParam || (viewBudgetId
                  ? buildClinicalAppointmentUrl({
                    appointmentId,
                    budgetId: viewBudgetId,
                    section: 'contratos',
                  })
                  : null)}
                onReturnToContract={() => {
                  const href = isSafeClinicalReturnUrl(returnToParam)
                    ? returnToParam
                    : buildClinicalAppointmentUrl({
                      appointmentId,
                      budgetId: viewBudgetId,
                      section: 'contratos',
                    });
                  navigate(`${href}${href.includes('?') ? '&' : '?'}revalidate=1`);
                }}
              />
            ) : (
              <ClinicalSectionLocked message={sectionLockMessage('documentos', workflow)} onGo={() => setActiveSection('orcamento')} />
            )
          )}
          {activeSection === 'assinatura' && (
            canAccessClinicalSection('assinatura', workflow) ? (
              <ClinicalSignatureSection
                appointmentId={appointmentId}
                patientId={patient?.id}
                budgetId={viewBudgetId || workflow.budget?.id || null}
                user={user}
                professional={professional}
                onNavigate={setActiveSection}
                onWorkflowRefresh={bumpWorkflow}
              />
            ) : (
              <ClinicalSectionLocked message={sectionLockMessage('assinatura', workflow)} onGo={() => setActiveSection('documentos')} />
            )
          )}
          {activeSection === 'observacoes' && (
            <DesenvolvimentoClinicoSection appointmentId={appointmentId} user={user} patient={patient} />
          )}
          {activeSection === 'convenios' && patient && (
            <ConveniosSection patient={patient} />
          )}
          {activeSection === 'dados-clinicos' && patient && (
            <DadosClinicosSection appointmentId={appointmentId} patientId={patient.id} />
          )}
          </div>
        </main>
      </div>
    </div>
  );
}

function ClinicalSectionLocked({ message, onGo }) {
  return (
    <ClinicalStageShell title="Etapa bloqueada" description={message}>
      <div className="clinical-locked-card">
        <FileCheck size={40} strokeWidth={1.25} />
        <p>{message}</p>
        {onGo && (
          <ClinicalBtn variant="secondary" onClick={onGo}>
            Voltar à etapa anterior
          </ClinicalBtn>
        )}
      </div>
    </ClinicalStageShell>
  );
}

// Seção: Observações clínicas do atendimento
function DesenvolvimentoClinicoSection({ appointmentId, user, patient }) {
  const [evolution, setEvolution] = useState('');
  const [saving, setSaving] = useState(false);
  const [evolutions, setEvolutions] = useState([]);
  const [loadingEvolutions, setLoadingEvolutions] = useState(true);
  const [showAllEvolutions, setShowAllEvolutions] = useState(false);
  const [editingEvolutionId, setEditingEvolutionId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadEvolutions();
  }, [appointmentId, patient]);

  const loadEvolutions = () => {
    setLoadingEvolutions(true);
    try {
      const patientId = patient?.id || null;
      const allEvolutions = listClinicalEvolutions(patientId, appointmentId);
      setEvolutions(allEvolutions);
    } catch (error) {
      console.error('Erro ao carregar observações:', error);
      setEvolutions([]);
    } finally {
      setLoadingEvolutions(false);
    }
  };

  const handleSave = async () => {
    const trimmed = (evolution || '').trim();
    if (!user || !trimmed) return;
    setSaving(true);
    try {
      const patientId = patient?.id || null;
      const budget = getBudget(appointmentId);
      const budgetId = budget?.id || null;
      saveClinicalEvolution(user, appointmentId, trimmed, patientId, budgetId);
      logClinicalEvent(appointmentId, 'evolution_saved', { budgetId: budgetId || undefined }, user.id);
      setEvolution('');
      loadEvolutions();
    } catch (error) {
      console.error('Erro ao salvar observação:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getProfessionalName = (professionalId) => {
    if (!professionalId) return 'Profissional não identificado';
    try {
      const db = loadDb();
      const professional = db.collaborators?.find((c) => c.id === professionalId);
      return professional?.nomeCompleto || professional?.name || 'Profissional não identificado';
    } catch {
      return 'Profissional não identificado';
    }
  };

  const handleStartEdit = (evo) => {
    if (!isAdmin) return;
    setEditingEvolutionId(evo.id);
    setEditingContent(evo.content);
  };

  const handleCancelEdit = () => {
    setEditingEvolutionId(null);
    setEditingContent('');
  };

  const handleSaveEdit = async () => {
    if (!isAdmin || !editingEvolutionId) return;
    setSavingEdit(true);
    try {
      updateClinicalEvolution(user, editingEvolutionId, editingContent);
      logClinicalEvent(appointmentId, 'evolution_edited', { evolutionId: editingEvolutionId }, user.id);
      setEditingEvolutionId(null);
      setEditingContent('');
      loadEvolutions(); // Recarregar histórico
      setSavingEdit(false);
    } catch (error) {
      console.error('Erro ao editar evolução:', error);
      alert(error.message || 'Erro ao editar evolução');
      setSavingEdit(false);
    }
  };

  const displayedEvolutions = showAllEvolutions ? evolutions : evolutions.slice(0, 5);
  const hasMoreEvolutions = evolutions.length > 5;

  return (
    <ClinicalStageShell
      title="Observações"
      description="Evoluções e anotações clínicas deste atendimento."
      primaryAction={
        <ClinicalBtn variant="primary" icon={Save} onClick={handleSave} disabled={saving || !(evolution || '').trim()}>
          {saving ? 'Salvando...' : 'Salvar'}
        </ClinicalBtn>
      }
    >
      <ClinicalBlock title="Nova observação">
        <textarea
          className="clinical-evolution-textarea clinical-textarea-compact"
          placeholder="Descreva evolução clínica, cuidados ou orientações..."
          value={evolution}
          onChange={(e) => setEvolution(e.target.value)}
          rows={4}
        />
      </ClinicalBlock>

      {/* Histórico de observações (mais recente primeiro) */}
      <div className="clinical-evolutions-history">
        <h3 className="clinical-evolutions-history-title">Histórico de observações</h3>

        {loadingEvolutions ? (
          <div className="clinical-evolutions-loading">Carregando histórico...</div>
        ) : evolutions.length === 0 ? (
          <div className="clinical-evolutions-empty">
            Nenhuma observação registrada ainda.
          </div>
        ) : (
          <>
            <div className="clinical-evolutions-list">
              {displayedEvolutions.map((evo) => (
                <div key={evo.id} className="clinical-evolution-item">
                  <div className="clinical-evolution-header">
                    <div className="clinical-evolution-header-left">
                      <span className="clinical-evolution-date">
                        {formatDateTime(evo.createdAt)}
                      </span>
                      {evo.updatedAt && (
                        <span className="clinical-evolution-edited">
                          (Editado em {formatDateTime(evo.updatedAt)})
                        </span>
                      )}
                      <span className="clinical-evolution-professional" title="Usuário que registrou">
                        {getProfessionalName(evo.professionalId)}
                      </span>
                    </div>
                    {isAdmin && editingEvolutionId !== evo.id && (
                      <button
                        type="button"
                        className="button-icon clinical-evolution-edit-btn"
                        onClick={() => handleStartEdit(evo)}
                        title="Editar observação"
                      >
                        <Edit size={16} />
                      </button>
                    )}
                  </div>
                  {editingEvolutionId === evo.id ? (
                    <div className="clinical-evolution-edit-mode">
                      <textarea
                        className="clinical-evolution-edit-textarea"
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={6}
                      />
                      <div className="clinical-evolution-edit-actions">
                        <button
                          type="button"
                          className="button secondary"
                          onClick={handleCancelEdit}
                          disabled={savingEdit}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="button primary"
                          onClick={handleSaveEdit}
                          disabled={savingEdit || !editingContent.trim()}
                        >
                          <Save size={16} />
                          {savingEdit ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="clinical-evolution-content">
                      {evo.content.split('\n').map((line, idx) => (
                        <div key={idx}>{line || '\u00A0'}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {hasMoreEvolutions && (
              <button
                type="button"
                className="button secondary clinical-evolutions-show-more"
                onClick={() => setShowAllEvolutions(!showAllEvolutions)}
              >
                {showAllEvolutions ? 'Ver menos' : `Ver mais (${evolutions.length - 5} anteriores)`}
              </button>
            )}
          </>
        )}
      </div>
    </ClinicalStageShell>
  );
}

// Seção: Procedimentos a Realizar
function ProcedimentosSection({ appointmentId, user, appointment, patient }) {
  const [procedures, setProcedures] = useState([]);
  const [showProcedureSelector, setShowProcedureSelector] = useState(false);

  useEffect(() => {
    const run = async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const blockedStatuses = new Set(['CANCELADO', 'SUSPENSO', 'REPROVADO', 'EXPIRADO']);

      try {
        const budgets = await listBudgets();
        const filteredBudgets = budgets.filter((budget) => {
          const status = budget?.status || '';
          if (blockedStatuses.has(status)) return false;
          if (status === 'AGUARDANDO_INICIO' || status === 'EM_ANDAMENTO') return true;
          if (status === 'CONCLUIDO') {
            const finishedAt = budget?.finished_at || budget?.updated_at || '';
            if (!finishedAt) return false;
            return new Date(finishedAt) >= cutoffDate;
          }
          return false;
        });

        const budgetIds = filteredBudgets.map((budget) => budget.id);
        const items = await listBudgetItemsByBudgetIds(budgetIds);

        const mappedProcedures = items.map((item) => ({
          id: item.id || createId('budget_item'),
          name: item.name || item.procedure_name || item.title || 'Procedimento',
          tooth: item.tooth || item.dente || '',
          region: item.region || item.regiao || '',
          value: Number(item.unit_price ?? item.value ?? item.price ?? 0),
          quantity: Number(item.quantity ?? 1),
          observations: item.notes || item.observations || '',
          status: item.status || 'pending',
        }));



        setProcedures(mappedProcedures);
      } catch (error) {
        console.error('Erro ao carregar procedimentos do orçamento:', error);
        setProcedures([]);
      }
    };

    run();
  }, [appointmentId]);

  const handleSelectProcedure = (procedureData) => {
    if (!user) return;
    // Adaptar estrutura para o formato esperado pelo serviço
    const adaptedProcedure = {
      name: procedureData.title,
      tooth: procedureData.tooth,
      region: procedureData.region,
      value: procedureData.unitValue,
      quantity: procedureData.quantity,
      observations: procedureData.observations,
      procedureCatalogId: procedureData.procedureCatalogId,
      source: 'price_base',
    };
    addProcedure(user, appointmentId, adaptedProcedure);
    setProcedures([...procedures, adaptedProcedure]);
    setShowProcedureSelector(false);
  };

  return (
    <>
      <SectionCard
        title="Procedimentos a Realizar"
        description="Gerencie os procedimentos realizados durante o atendimento"
        actions={
          <button 
            type="button" 
            className="button primary"
            onClick={() => setShowProcedureSelector(true)}
          >
            <Plus size={16} />
            Adicionar Procedimento
          </button>
        }
      >
        <div className="clinical-section-filter-label">
          Exibindo: aguardando início, em andamento e concluídos (últimos 30 dias)
        </div>
        {procedures.length === 0 ? (
          <div className="clinical-empty-state">
            <ClipboardList size={48} />
            <p>Nenhum procedimento encontrado para o filtro atual.</p>
            <p className="clinical-empty-hint">São exibidos apenas contratos aguardando início, em andamento ou concluídos nos últimos 30 dias.</p>
          </div>
        ) : (
          <div className="clinical-procedures-list">
            {procedures.map((proc, index) => (
              <div key={index} className="clinical-procedure-card">
                <div className="clinical-procedure-info">
                  <h3>{proc.name}</h3>
                  <p>{proc.tooth || proc.region}</p>
                  <span className="clinical-procedure-value">R$ {proc.value?.toFixed(2) || '0,00'}</span>
                </div>
                <span className={`clinical-procedure-status clinical-procedure-status--${proc.status || 'pending'}`}>
                  {proc.status === 'completed' ? 'Concluído' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      {showProcedureSelector && (
        <ProcedureSelectorModal
          open={showProcedureSelector}
          onClose={() => setShowProcedureSelector(false)}
          onSelect={handleSelectProcedure}
          onSelectMultiple={(items) => {
            items.forEach((item) => handleSelectProcedure(item));
          }}
          patient={patient}
          appointmentId={appointmentId}
        />
      )}
    </>
  );
}

// Seção: Planejamento (estrutura clínica; sem valores; precificação na aba Orçamento)
function PlanejamentoSection({ appointmentId, user, appointment, patient, onNavigateToOrcamento, onShowToast }) {
  const [plannedProcedures, setPlannedProcedures] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addName, setAddName] = useState('');
  const [addToothOrRegion, setAddToothOrRegion] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editToothOrRegion, setEditToothOrRegion] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [procedureOptions, setProcedureOptions] = useState([]);
  const [procedureDropdownOpen, setProcedureDropdownOpen] = useState(false);
  const [editProcedureDropdownOpen, setEditProcedureDropdownOpen] = useState(false);
  const procedureDropdownRef = useRef(null);
  const editProcedureDropdownRef = useRef(null);

  const loadPlanned = () => {
    const clinicalData = getClinicalData(appointmentId);
    const list = clinicalData?.plannedProcedures || [];
    const sorted = [...list].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    setPlannedProcedures(sorted);
  };

  useEffect(() => {
    loadPlanned();
  }, [appointmentId]);

  // Carregar procedimentos cadastrados (Base de Preço) quando o form de adicionar ou edição estiver ativo
  useEffect(() => {
    if (!showAddForm && !editingId) return;
    const priceTable = patient ? getPriceTableForPatient(patient) : getDefaultPriceTable();
    const priceTableId = priceTable?.id || null;
    if (!priceTableId) {
      setProcedureOptions([]);
      return;
    }
    const list = listProcedures({
      priceTableId,
      status: PROCEDURE_STATUS.ATIVO,
      sortBy: 'name',
    });
    setProcedureOptions(list.map((p) => ({ id: p.id, title: p.title || p.name || '' })).filter((p) => p.title));
  }, [showAddForm, editingId, patient]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e) => {
      const addEl = procedureDropdownRef.current;
      const editEl = editProcedureDropdownRef.current;
      if (addEl && !addEl.contains(e.target) && (!editEl || !editEl.contains(e.target))) {
        setProcedureDropdownOpen(false);
      }
      if (editEl && !editEl.contains(e.target) && (!addEl || !addEl.contains(e.target))) {
        setEditProcedureDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddProcedure = () => {
    setError('');
    const name = (addName || '').trim();
    const toothRegion = (addToothOrRegion || '').trim();
    if (!name) {
      setError('Procedimento é obrigatório.');
      return;
    }
    if (!toothRegion) {
      setError('Dente / Região é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      addPlannedProcedure(user, appointmentId, {
        name,
        tooth: toothRegion,
        region: toothRegion,
        notes: (addNotes || '').trim(),
      });
      loadPlanned();
      setAddName('');
      setAddToothOrRegion('');
      setAddNotes('');
      setShowAddForm(false);
    } catch (err) {
      setError(err?.message || 'Erro ao salvar no planejamento.');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (proc) => {
    setEditingId(proc.id);
    setEditName(proc.name || '');
    setEditToothOrRegion(proc.tooth || proc.region || '');
    setEditNotes(proc.notes || '');
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditToothOrRegion('');
    setEditNotes('');
  };

  const handleSaveEdit = () => {
    const name = (editName || '').trim();
    const toothRegion = (editToothOrRegion || '').trim();
    if (!name || !toothRegion) {
      setError('Procedimento e Dente/Região são obrigatórios.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      updatePlannedProcedure(user, appointmentId, editingId, {
        name,
        tooth: toothRegion,
        region: toothRegion,
        notes: (editNotes || '').trim(),
      });
      loadPlanned();
      cancelEdit();
    } catch (err) {
      setError(err?.message || 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (plannedId) => {
    if (!window.confirm('Remover este item do planejamento?')) return;
    setSaving(true);
    setError('');
    try {
      removePlannedProcedure(user, appointmentId, plannedId);
      loadPlanned();
      if (editingId === plannedId) cancelEdit();
    } catch (err) {
      setError(err?.message || 'Erro ao remover.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateBudgetFromPlan = () => {
    if (!user || plannedProcedures.length === 0) return;
    setError('');
    try {
      const procedures = plannedProcedures.map((proc) => ({
        id: proc.id || createId('proc'),
        name: proc.name,
        tooth: proc.tooth || '',
        region: proc.region || '',
        quantity: 1,
        unitValue: 0,
        totalValue: 0,
        observations: proc.notes || '',
      }));
      saveBudget(user, appointmentId, {
        status: BUDGET_STATUS.RASCUNHO,
        planName: '',
        procedures,
        paymentType: 'a_vista',
        downPayment: 0,
        installments: 1,
        installmentValue: 0,
        paymentMethod: 'dinheiro',
        discount: 0,
        interest: 0,
        validityDate: '',
        professionalId: appointment?.professionalId || null,
        createdAt: new Date().toISOString(),
        createdBy: user.id,
      });
      logClinicalEvent(appointmentId, 'budget_generated', {
        plannedProceduresCount: plannedProcedures.length,
      }, user.id);
      if (onNavigateToOrcamento) onNavigateToOrcamento();
      if (onShowToast) onShowToast('Orçamento gerado a partir do planejamento.');
    } catch (err) {
      setError(err?.message || 'Erro ao gerar orçamento.');
    }
  };

  return (
    <SectionCard
      title="Planejamento do Tratamento"
      description="Defina as etapas e procedimentos do tratamento"
      actions={
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary"
            onClick={() => { setShowAddForm((v) => !v); setError(''); cancelEdit(); }}
          >
            <Plus size={16} />
            {showAddForm ? 'Cancelar' : 'Adicionar procedimento'}
          </button>
          {plannedProcedures.length > 0 && (
            <button
              type="button"
              className="button primary"
              onClick={handleGenerateBudgetFromPlan}
            >
              <DollarSign size={16} />
              Gerar Orçamento a partir do Planejamento
            </button>
          )}
        </div>
      }
    >
      {error ? (
        <div className="clinical-planned-error" style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.5rem', background: '#fef2f2', color: '#991b1b', fontSize: '0.875rem' }}>
          {error}
        </div>
      ) : null}
      {showAddForm && (
        <div className="clinical-planned-add-form" style={{ marginBottom: '1.5rem', padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Procedimento</span>
            <div ref={procedureDropdownRef} style={{ position: 'relative' }}>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onFocus={() => setProcedureDropdownOpen(true)}
                placeholder="Clique para ver procedimentos cadastrados"
                style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', width: '100%', boxSizing: 'border-box' }}
              />
              {procedureDropdownOpen && procedureOptions.length > 0 && (
                <ul
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    margin: 0,
                    padding: 0,
                    listStyle: 'none',
                    maxHeight: '12rem',
                    overflowY: 'auto',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    background: '#fff',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    zIndex: 10,
                  }}
                >
                  {procedureOptions
                    .filter((p) => !addName.trim() || p.title.toLowerCase().includes(addName.toLowerCase()))
                    .map((p) => (
                      <li
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && (setAddName(p.title), setProcedureDropdownOpen(false))}
                        onClick={() => { setAddName(p.title); setProcedureDropdownOpen(false); }}
                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #f1f5f9' }}
                      >
                        {p.title}
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Dente / Região</span>
            <input
              type="text"
              value={addToothOrRegion}
              onChange={(e) => setAddToothOrRegion(e.target.value)}
              placeholder="Ex.: 18, superior direita"
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
            <span>Observações clínicas (opcional)</span>
            <textarea
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              placeholder="Observações"
              rows={2}
              style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', resize: 'vertical' }}
            />
          </label>
          <button
            type="button"
            className="button primary"
            disabled={saving || !addName.trim() || !addToothOrRegion.trim()}
            onClick={handleAddProcedure}
          >
            {saving ? 'Salvando...' : 'Salvar no Planejamento'}
          </button>
        </div>
      )}
      {plannedProcedures.length === 0 && !showAddForm ? (
        <div className="clinical-empty-state">
          <Calendar size={48} />
          <p>Nenhum procedimento planejado ainda.</p>
          <button
            type="button"
            className="button primary"
            onClick={() => setShowAddForm(true)}
            style={{ marginTop: '1rem' }}
          >
            <Plus size={16} />
            Adicionar procedimento
          </button>
        </div>
      ) : (
        <div className="clinical-planned-list">
          {plannedProcedures.map((proc) => (
            <div key={proc.id} className="clinical-planned-item" style={{ border: '1px solid #e2e8f0', borderRadius: '0.5rem', padding: '1rem', marginBottom: '0.75rem' }}>
              {editingId === proc.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div ref={editProcedureDropdownRef} style={{ position: 'relative' }}>
                    <label style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem', display: 'block' }}>Procedimento</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onFocus={() => setEditProcedureDropdownOpen(true)}
                      placeholder="Clique para ver procedimentos cadastrados"
                      style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', width: '100%', boxSizing: 'border-box' }}
                    />
                    {editProcedureDropdownOpen && procedureOptions.length > 0 && (
                      <ul
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          margin: 0,
                          padding: 0,
                          listStyle: 'none',
                          maxHeight: '12rem',
                          overflowY: 'auto',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          background: '#fff',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                          zIndex: 10,
                        }}
                      >
                        {procedureOptions
                          .filter((p) => !editName.trim() || p.title.toLowerCase().includes(editName.toLowerCase()))
                          .map((p) => (
                            <li
                              key={p.id}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && (setEditName(p.title), setEditProcedureDropdownOpen(false))}
                              onClick={() => { setEditName(p.title); setEditProcedureDropdownOpen(false); }}
                              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', borderBottom: '1px solid #f1f5f9' }}
                            >
                              {p.title}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                  <input
                    type="text"
                    value={editToothOrRegion}
                    onChange={(e) => setEditToothOrRegion(e.target.value)}
                    placeholder="Dente / Região"
                    style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem' }}
                  />
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Observações"
                    rows={2}
                    style={{ padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '0.5rem', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="button primary" disabled={saving} onClick={handleSaveEdit}>
                      Salvar
                    </button>
                    <button type="button" className="button secondary" onClick={cancelEdit}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{proc.name}</h3>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#64748b' }}>
                      {proc.tooth || proc.region || 'â€”'}
                    </p>
                    {proc.notes ? (
                      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: '#475569' }}>{proc.notes}</p>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button type="button" className="button-link" onClick={() => startEdit(proc)}>
                      Editar
                    </button>
                    <button type="button" className="button-link" style={{ color: '#dc2626' }} onClick={() => handleRemove(proc.id)}>
                      Remover
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// Seção: Convênios
function ConveniosSection({ patient }) {
  if (!patient) {
    return (
      <SectionCard
        title="Convênios"
        description="Informações sobre o convênio do paciente"
      >
        <div className="clinical-empty-state">
          <Activity size={48} />
          <p>Dados do paciente não disponíveis.</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Convênios"
      description="Informações sobre o convênio do paciente"
    >
      {patient.insurance_provider ? (
        <div className="clinical-insurance-info">
          <h3>{patient.insurance_provider}</h3>
          {patient.insurance_number && <p>Número: {patient.insurance_number}</p>}
          {patient.insurance_plan && <p>Plano: {patient.insurance_plan}</p>}
        </div>
      ) : (
        <div className="clinical-empty-state">
          <CreditCard size={48} />
          <p>Paciente não possui convênio cadastrado.</p>
        </div>
      )}
    </SectionCard>
  );
}

// Seção: Dados Clínicos
function DadosClinicosSection({ appointmentId, patientId }) {
  const [activeSubmenu, setActiveSubmenu] = useState('odontograma');
  const navigate = useNavigate();

  const submenuItems = [
    { id: 'odontograma', label: 'Odontograma' },
    { id: 'situacao-bucal', label: 'Situação Bucal' },
    { id: 'situacao-facial', label: 'Situação Facial' },
    { id: 'situacao-fisica', label: 'Situação Física' },
    { id: 'historico-eventos', label: 'Histórico de Eventos' },
  ];

  return (
    <SectionCard
      title="Dados Clínicos"
      description="Acesse odontograma, histórico e informações clínicas do paciente"
    >
      <div className="clinical-submenu">
        {submenuItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`clinical-submenu-item ${activeSubmenu === item.id ? 'active' : ''}`}
            onClick={() => {
              setActiveSubmenu(item.id);
              if (item.id === 'odontograma') {
                navigate(`/pacientes/${patientId}/odontograma`);
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="clinical-submenu-content">
        {activeSubmenu === 'historico-eventos' && (
          <HistoricoEventos appointmentId={appointmentId} />
        )}
        {activeSubmenu !== 'historico-eventos' && (
          <div className="clinical-empty-state">
            <Activity size={48} />
            <p>Conteúdo em desenvolvimento.</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// Mapeamento estático de fallback para tipos não cobertos pelos formatters específicos
const STATIC_EVENT_LABELS = {
  clinical_appointment_opened: 'Atendimento clínico iniciado',
  evolution_saved: 'Evolução clínica registrada',
  evolution_edited: 'Evolução clínica editada',
  procedure_added: 'Procedimento adicionado',
  procedure_planned: 'Procedimento planejado',
  planning_procedure_removed: 'Procedimento removido do planejamento',
  budget_generated: 'Orçamento gerado a partir do planejamento',
  budget_created: 'Orçamento criado',
  budget_updated: 'Orçamento atualizado',
  budget_sent: 'Orçamento enviado ao paciente',
  budget_approved: 'Orçamento aprovado',
  budget_rejected: 'Orçamento reprovado',
  budget_cancelled: 'Orçamento cancelado',
  budget_pdf_generated: 'PDF do orçamento gerado',
  budget_payment_presented: 'Condição de pagamento apresentada ao paciente',
  budget_payment_chosen: 'Paciente escolheu forma de pagamento',
  budget_status_changed: 'Status do orçamento alterado',
  contract_pdf_generated: 'PDF do contrato gerado',
  contract_canceled: 'Contrato cancelado',
  appointment_finished: 'Atendimento encerrado',
};

function resolveEventLabel(event) {
  if (!event?.type) return 'Evento';
  // Tenta formatters específicos com dados enriquecidos
  const fromBudget = formatBudgetEventLabel(event);
  if (fromBudget) return fromBudget;
  const fromContract = formatContractEventLabel(event);
  if (fromContract) return fromContract;
  // Fallback para mapa estático
  return STATIC_EVENT_LABELS[event.type] || event.type;
}

function resolveEventDetail(event) {
  const d = event?.data;
  if (!d) return null;
  if (d.procedureName) return `Procedimento: ${d.procedureName}`;
  if (d.plannedProceduresCount) return `Procedimentos planejados: ${d.plannedProceduresCount}`;
  if (d.totalValue != null) return `Valor total: R$ ${Number(d.totalValue).toFixed(2)}`;
  if (d.status) return `Status: ${d.status}`;
  if (d.reasonLabel) return d.reasonLabel;
  return null;
}

// Componente: Histórico de Eventos
function HistoricoEventos({ appointmentId }) {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    setEvents(getClinicalEvents(appointmentId));
  }, [appointmentId]);

  return (
    <div className="clinical-events-list">
      {events.length === 0 ? (
        <div className="clinical-empty-state">
          <Activity size={48} />
          <p>Nenhum evento registrado ainda.</p>
        </div>
      ) : (
        events.map((event) => {
          const detail = resolveEventDetail(event);
          return (
            <div key={event.id} className="clinical-event-item">
              <div className="clinical-event-time">
                {new Date(event.timestamp).toLocaleString('pt-BR')}
              </div>
              <div className="clinical-event-content">
                <strong>{resolveEventLabel(event)}</strong>
                {detail && <p>{detail}</p>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// Modal: Adicionar Procedimento
function AddProcedureModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [tooth, setTooth] = useState('');
  const [region, setRegion] = useState('');
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({
      name,
      tooth: tooth || null,
      region: region || null,
      value: parseFloat(value) || 0,
      status: 'pending',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Adicionar Procedimento</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Nome do Procedimento</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Dente</label>
            <input
              type="text"
              value={tooth}
              onChange={(e) => setTooth(e.target.value)}
              placeholder="Ex: 16, 21, etc."
            />
          </div>
          <div className="form-group">
            <label>Região</label>
            <input
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Ex: Superior direito, etc."
            />
          </div>
          <div className="form-group">
            <label>Valor</label>
            <input
              type="number"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="button primary">
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Error Boundary Component
class ClinicalAppointmentErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erro capturado pelo Error Boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', padding: '2rem' }}>
          <div style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>
            Erro ao carregar página: {this.state.error?.message || 'Erro desconhecido'}
          </div>
          <button 
            type="button" 
            className="button primary"
            onClick={() => window.location.href = '/gestao-comercial/jornada-do-paciente'}
          >
            Voltar para Jornada do Paciente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Export direto - renderização normal sem portal
export default function ClinicalAppointmentPage() {
  
  return <ClinicalAppointmentPageContent />;
}
