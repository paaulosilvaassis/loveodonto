import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope,
  FileText,
  Plus,
  FileSignature,
  ClipboardList,
  Image,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
} from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import { ClinicalBtn } from '../clinical/ClinicalStageShell.jsx';
import { ContractStatusBadge } from '../../contracts/ui/ContractUi.jsx';
import PatientBudgetsContractsTab from '../budgets/PatientBudgetsContractsTab.jsx';
import { StartPatientBudgetModal } from '../budgets/StartPatientBudgetModal.jsx';
import { PatientDelinquencyBanner } from './PatientDelinquencyBanner.jsx';
import { ClinicalGuideModal } from '../clinical/guide/ClinicalGuideModal.jsx';
import { ClinicalGuideOpenButton } from '../clinical/guide/ClinicalGuideMatchBanner.jsx';
import { PatientCareFinancialTab } from './PatientCareFinancialTab.jsx';
import { PatientCareIntelligenceTimeline } from './PatientCareIntelligenceTimeline.jsx';
import { PatientCareExecutiveSidebar } from './PatientCareExecutiveSidebar.jsx';
import {
  InactiveClinicalSessionError,
  createNewBudget,
} from '../../services/clinicalBudgetHubService.js';
import {
  openExistingBudget,
  openExistingContract,
  resolveBudgetNavigationId,
} from '../../services/budgetNavigationService.js';
import {
  getPatientDelinquencyInfo,
  buildFinanceNavigationUrl,
} from '../../services/patientFinancialSummaryService.js';
import { listFiles } from '../../services/patientFilesService.js';
import { listPatientContracts } from '../../services/contractModuleService.js';
import { formatFriendlyContractNumber } from '../../utils/friendlyNumbers.js';
import { CLINICAL_BUDGET_UPDATED_EVENT } from '../../services/clinicalBudgetApprovedService.js';
import { shouldPreferPendingBudgetOverApproved } from '../../services/clinicalAppointmentCloseService.js';

function PatientAvatar({ name, photoUrl }) {
  if (photoUrl) {
    return <img src={photoUrl} alt="" className="care-central-avatar care-central-avatar--photo" />;
  }
  const initials = String(name || 'P')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return <div className="care-central-avatar">{initials || 'P'}</div>;
}

function AlertCard({ alert, onAction }) {
  const Icon = alert.tone === 'success' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`care-central-alert tone-${alert.tone || 'info'}`}>
      <Icon size={16} aria-hidden />
      <div className="care-central-alert-body">
        <span className="care-central-alert-text">{alert.text}</span>
        {alert.detail ? (
          <span className="care-central-alert-detail muted">{alert.detail}</span>
        ) : null}
        {alert.actionLabel && onAction ? (
          <button
            type="button"
            className="button secondary"
            style={{ marginTop: '0.5rem' }}
            onClick={() => onAction(alert)}
          >
            {alert.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function PatientCareCentralPanel({
  context,
  onRefresh,
  embedded = false,
  focusTab = null,
  onFocusTabConsumed,
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const financeSectionRef = useRef(null);
  const shouldScrollToFinanceRef = useRef(false);

  useEffect(() => {
    if (focusTab) {
      shouldScrollToFinanceRef.current = focusTab === 'financeiro';
      setActiveTab(focusTab);
      onFocusTabConsumed?.();
    }
  }, [focusTab, onFocusTabConsumed]);

  useEffect(() => {
    if (activeTab !== 'financeiro' || !shouldScrollToFinanceRef.current) return undefined;
    shouldScrollToFinanceRef.current = false;
    const frame = requestAnimationFrame(() => {
      financeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab]);

  useEffect(() => {
    if (!context?.patientId || !onRefresh) return undefined;

    const handleBudgetUpdated = (event) => {
      const updatedPatientId = event.detail?.patientId;
      if (!updatedPatientId || updatedPatientId === context.patientId) {
        onRefresh();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') onRefresh();
    };

    window.addEventListener(CLINICAL_BUDGET_UPDATED_EVENT, handleBudgetUpdated);
    window.addEventListener('focus', onRefresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener(CLINICAL_BUDGET_UPDATED_EVENT, handleBudgetUpdated);
      window.removeEventListener('focus', onRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [context?.patientId, onRefresh]);

  const delinquency = useMemo(
    () => (context?.patientId ? getPatientDelinquencyInfo(context.patientId) : null),
    [context?.patientId],
  );

  if (!context) {
    return (
      <div className="care-central-empty">
        <p>{embedded ? 'Nenhum dado disponível para este paciente.' : 'Nenhum atendimento ativo encontrado para este paciente.'}</p>
        {!embedded ? (
          <ClinicalBtn variant="secondary" onClick={() => navigate('/gestao-comercial/jornada-do-paciente')}>
            Ir para Jornada do Paciente
          </ClinicalBtn>
        ) : null}
      </div>
    );
  }

  const {
    appointmentId,
    patientId,
    header,
    alerts,
    actions,
    timeline = [],
    intelligenceAlerts = [],
    executiveSummary,
    hasActiveSession = false,
  } = context;

  const files = listFiles(patientId);
  const contracts = listPatientContracts(patientId);
  const examFiles = files.filter((f) => /exame|radio|panor|tomograf|foto/i.test(String(f.category || f.file_name || '')));
  const docFiles = files.filter((f) => !/exame|radio|panor|tomograf|foto/i.test(String(f.category || f.file_name || '')));

  const openClinical = (section = 'planejamento') => {
    if (!appointmentId) {
      setToast({ message: 'Nenhum atendimento ativo. Inicie o atendimento pela Jornada do Paciente.', type: 'error' });
      return;
    }
    navigate(`/atendimento-clinico/${appointmentId}`, { state: { section } });
  };

  /**
   * Central do Paciente → atendimento clínico.
   * "Ver orçamento" envia budgetId interno (budget.id); label ORC-XXX é só exibição.
   * "Abrir contrato" envia contractId interno (contract.id); CTR-XXX é só exibição.
   * Números amigáveis são convertidos em ids reais por budgetNavigationService.
   */
  const resolveBudgetOpenTarget = (budgetRef = null) => {
    const defaultRef = actions?.pendingDecisionBudget
      && shouldPreferPendingBudgetOverApproved(actions.pendingDecisionBudget)
      ? actions.pendingDecisionBudget
      : (executiveSummary?.activeBudget || actions?.latestApprovedBudget || null);
    const ref = budgetRef || defaultRef;
    return {
      budgetId: resolveBudgetNavigationId({
        budgetId: ref?.budgetId || ref?.id || actions?.primaryBudgetId || null,
        budgetNumber: ref?.budgetNumber || ref?.label || null,
        patientId,
        appointmentId: ref?.appointmentId || actions?.primaryBudgetAppointmentId || appointmentId,
      }),
      appointmentId: ref?.appointmentId || actions?.primaryBudgetAppointmentId || appointmentId,
    };
  };

  const resolveContractOpenTarget = (contractRef = null) => {
    const budgetRef = (actions?.pendingDecisionBudget
      && shouldPreferPendingBudgetOverApproved(actions.pendingDecisionBudget)
      ? actions.pendingDecisionBudget
      : null)
      || executiveSummary?.activeBudget
      || actions?.latestApprovedBudget
      || null;
    const ref = contractRef
      || executiveSummary?.activeContract
      || (budgetRef?.contractId ? { contractId: budgetRef.contractId } : null);

    const contractId = ref?.contractId || ref?.id || null;
    const targetAppointmentId = ref?.appointmentId
      || ref?.quoteId
      || budgetRef?.appointmentId
      || actions?.primaryBudgetAppointmentId
      || appointmentId;

    return {
      contractId,
      budgetId: resolveBudgetNavigationId({
        budgetId: ref?.budgetId || budgetRef?.budgetId || budgetRef?.id || actions?.primaryBudgetId || null,
        budgetNumber: budgetRef?.budgetNumber || budgetRef?.label || null,
        patientId,
        appointmentId: targetAppointmentId,
      }),
      appointmentId: targetAppointmentId,
    };
  };

  const openExistingContractSafe = (contractRef = null) => {
    const target = resolveContractOpenTarget(contractRef);

    if (target.contractId) {
      try {
        openExistingContract(navigate, {
          contractId: target.contractId,
          budgetId: target.budgetId,
          patientId,
          appointmentId: target.appointmentId,
        });
      } catch (error) {
        setToast({ message: error.message || 'Erro ao abrir contrato.', type: 'error' });
      }
      return;
    }

    if (target.budgetId) {
      openExistingBudgetSafe({
        budgetId: target.budgetId,
        appointmentId: target.appointmentId,
      }, 'contratos');
      return;
    }

    setToast({
      message: 'Não foi possível localizar este contrato. Verifique o vínculo no histórico do paciente.',
      type: 'error',
    });
  };

  const openExistingBudgetSafe = (budgetRefOrId, section = 'orcamento', itemAppointmentId = null, { mode = null } = {}) => {
    const ref = typeof budgetRefOrId === 'object' && budgetRefOrId !== null
      ? budgetRefOrId
      : {
        budgetId: budgetRefOrId,
        appointmentId: itemAppointmentId,
      };

    const budgetId = resolveBudgetNavigationId({
      budgetId: ref.budgetId || ref.id || actions?.primaryBudgetId || null,
      budgetNumber: ref.budgetNumber || ref.label || null,
      patientId,
      appointmentId: ref.appointmentId || itemAppointmentId || appointmentId,
    });

    if (!budgetId) {
      setToast({
        message: 'Não foi possível localizar este orçamento. Verifique o vínculo no histórico do paciente.',
        type: 'error',
      });
      return;
    }
    try {
      openExistingBudget(navigate, {
        budgetId,
        patientId,
        appointmentId: ref.appointmentId || itemAppointmentId || appointmentId,
        section,
        mode,
      });
    } catch (error) {
      setToast({ message: error.message || 'Erro ao abrir orçamento.', type: 'error' });
    }
  };

  const handleTimelineAction = (item, actionKey) => {
    if (actionKey === 'budget' || actionKey === 'budget_print') {
      openExistingBudgetSafe({
        budgetId: item.meta?.budgetId,
        budgetNumber: item.meta?.budgetNumber,
        appointmentId: item.meta?.appointmentId,
      }, 'orcamento');
      return;
    }
    if (actionKey === 'contract' || actionKey === 'contract_pdf') {
      openExistingContractSafe({
        contractId: item.meta?.contractId,
        budgetId: item.meta?.budgetId,
        appointmentId: item.meta?.appointmentId,
      });
      return;
    }
    else if (actionKey === 'finance' || actionKey === 'finance_installments') openFinanceTab();
    else if (actionKey === 'chart') navigate(`/prontuario/${patientId}`);
    else if (actionKey === 'file' || actionKey === 'exam') setActiveTab('exames');
    else if (actionKey === 'open') openClinical('planejamento');
    else openClinical('planejamento');
  };

  const handleAlertAction = (alert) => {
    if (alert.id === 'pending-budget-decision') {
      openExistingBudgetSafe({
        budgetId: alert.budgetId,
        appointmentId: alert.appointmentId,
      }, 'orcamento', null, { mode: 'edit' });
      return;
    }
    if (alert.budgetId) {
      openExistingBudgetSafe({
        budgetId: alert.budgetId,
        appointmentId: alert.appointmentId,
      }, 'orcamento');
    }
  };

  const openFinanceTab = () => {
    shouldScrollToFinanceRef.current = true;
    setActiveTab('financeiro');
  };

  const openNegotiation = () => {
    navigate(buildFinanceNavigationUrl(patientId, { tab: 'financing' }));
  };

  const handleCreateBudget = async ({ importProcedures }) => {
    setBusy(true);
    try {
      createNewBudget(navigate, user, patientId, { importProcedures });
      setCreateOpen(false);
      onRefresh?.();
    } catch (error) {
      if (error instanceof InactiveClinicalSessionError) {
        setToast({ message: 'Inicie o atendimento na Jornada do Paciente antes de criar um orçamento.', type: 'error' });
        return;
      }
      setToast({ message: error.message || 'Erro ao criar orçamento.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`care-central-page${embedded ? ' care-central-page--embedded' : ''}`}>
      <PatientDelinquencyBanner
        delinquency={delinquency}
        onViewFinance={openFinanceTab}
        onNegotiate={openNegotiation}
      />

      <header className="care-central-header">
        <PatientAvatar name={header.patientName} photoUrl={header.photoUrl} />
        <div className="care-central-header-main">
          <h1>{header.patientName}</h1>
          <p className="care-central-header-meta">
            {header.age != null ? `${header.age} anos` : 'Idade não informada'}
            {' · '}
            {header.phone}
          </p>
          <div className="care-central-header-grid">
            <span><strong>Dentista:</strong> {header.professionalName}</span>
            <span><strong>Consultório:</strong> {header.roomName}</span>
            <span><strong>Horário:</strong> {header.scheduledDate ? new Date(`${header.scheduledDate}T12:00:00`).toLocaleDateString('pt-BR') : '—'} — {header.scheduledTime}</span>
            <span className="care-central-status-pill">{header.statusLabel}</span>
          </div>
        </div>
      </header>

      <section className="care-central-alerts">
        <h2>Resumo rápido para o dentista</h2>
        <div className="care-central-alerts-grid">
          {alerts.length ? alerts.map((alert, index) => (
            <AlertCard
              key={`${alert.id || alert.type}-${index}`}
              alert={alert}
              onAction={alert.actionLabel ? handleAlertAction : undefined}
            />
          )) : (
            <p className="care-central-muted">Nenhum alerta clínico ou financeiro registrado.</p>
          )}
        </div>
      </section>

      <section className="care-central-actions pci-quick-actions">
        {hasActiveSession ? (
          <ClinicalBtn variant="primary" icon={Stethoscope} onClick={() => openClinical('planejamento')}>
            Abrir atendimento
          </ClinicalBtn>
        ) : null}
        <ClinicalBtn variant="secondary" icon={ClipboardList} onClick={() => navigate(`/prontuario/${patientId}`)}>
          Abrir prontuário
        </ClinicalBtn>
        {actions.showOpenExistingBudget ? (
          <ClinicalBtn
            variant="secondary"
            icon={FileText}
            onClick={() => openExistingBudgetSafe(resolveBudgetOpenTarget())}
          >
            Abrir orçamento
          </ClinicalBtn>
        ) : null}
        {actions.showCreateNewBudget ? (
          <ClinicalBtn variant="secondary" icon={Plus} onClick={() => setCreateOpen(true)}>
            Criar novo orçamento
          </ClinicalBtn>
        ) : null}
        {actions.showViewContract ? (
          <ClinicalBtn variant="secondary" icon={FileSignature} onClick={() => openExistingContractSafe()}>
            Abrir contrato
          </ClinicalBtn>
        ) : null}
        <ClinicalBtn variant="secondary" icon={DollarSign} onClick={openFinanceTab}>
          Abrir financeiro
        </ClinicalBtn>
        <ClinicalBtn variant="secondary" icon={Image} onClick={() => setActiveTab('exames')}>
          Abrir exames
        </ClinicalBtn>
        <ClinicalGuideOpenButton onClick={() => setGuideModalOpen(true)} />
      </section>

      <div className="care-central-body" ref={financeSectionRef}>
        <div className="care-central-main">
          <div className="care-central-tabs">
            {[
              { id: 'overview', label: 'Histórico' },
              { id: 'orcamentos', label: 'Orçamentos' },
              { id: 'contratos', label: 'Contratos' },
              { id: 'exames', label: 'Exames' },
              { id: 'documentos', label: 'Documentos' },
              { id: 'financeiro', label: 'Financeiro' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`care-central-tab${activeTab === tab.id ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <PatientCareIntelligenceTimeline
              events={timeline}
              intelligenceAlerts={intelligenceAlerts}
              onAction={handleTimelineAction}
            />
          ) : null}

          {activeTab === 'orcamentos' ? (
            <PatientBudgetsContractsTab patientId={patientId} patientName={header.patientName} />
          ) : null}

          {activeTab === 'contratos' ? (
            <div className="care-central-list-section">
              {contracts.length ? contracts.map((contract, index) => (
                <article key={contract.id} className="care-central-list-card">
                  <div>
                    <strong>{formatFriendlyContractNumber(contract.contractNumber, index + 1)}</strong>
                    <ContractStatusBadge status={contract.status} />
                    <p>{contract.title || 'Contrato'}</p>
                  </div>
                  <div className="care-central-list-actions">
                    <button
                      type="button"
                      className="button ghost sm"
                      onClick={() => openExistingContractSafe({
                        contractId: contract.id,
                        budgetId: contract.budgetId,
                        appointmentId: contract.quoteId,
                      })}
                    >
                      Visualizar
                    </button>
                    <button type="button" className="button ghost sm" onClick={() => navigate('/financeiro/contas-receber')}>
                      Financeiro
                    </button>
                  </div>
                </article>
              )) : <p className="care-central-muted">Nenhum contrato vinculado.</p>}
            </div>
          ) : null}

          {activeTab === 'exames' ? (
            <div className="care-central-list-section">
              {examFiles.length ? examFiles.map((file) => (
                <article key={file.id} className="care-central-list-card">
                  <div>
                    <strong>{file.file_name}</strong>
                    <p>{file.category || 'Exame'}</p>
                  </div>
                  <button type="button" className="button ghost sm" onClick={() => navigate(`/prontuario/${patientId}?tab=files`)}>
                    Visualizar
                  </button>
                </article>
              )) : <p className="care-central-muted">Nenhum exame anexado.</p>}
            </div>
          ) : null}

          {activeTab === 'documentos' ? (
            <div className="care-central-list-section">
              {docFiles.length ? docFiles.map((file) => (
                <article key={file.id} className="care-central-list-card">
                  <div>
                    <strong>{file.file_name}</strong>
                    <p>{file.category || 'Documento'}</p>
                  </div>
                  <button type="button" className="button ghost sm" onClick={() => navigate(`/prontuario/${patientId}?tab=files`)}>
                    Visualizar
                  </button>
                </article>
              )) : <p className="care-central-muted">Nenhum documento anexado.</p>}
            </div>
          ) : null}

          {activeTab === 'financeiro' ? (
            <PatientCareFinancialTab patientId={patientId} />
          ) : null}
        </div>

        <PatientCareExecutiveSidebar
          summary={executiveSummary}
          onOpenBudget={() => openExistingBudgetSafe(executiveSummary?.activeBudget)}
          onOpenContract={() => openExistingContractSafe(executiveSummary?.activeContract)}
          onOpenFinance={openFinanceTab}
        />
      </div>

      <StartPatientBudgetModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={busy}
        patientId={patientId}
        patientName={header.patientName}
        onConfirm={handleCreateBudget}
      />

      {toast ? <div className={`toast ${toast.type}`} role="status">{toast.message}</div> : null}

      <ClinicalGuideModal
        open={guideModalOpen}
        onOpenChange={setGuideModalOpen}
        user={user}
      />
    </div>
  );
}
