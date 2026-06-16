import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope,
  FileText,
  Plus,
  FileSignature,
  ClipboardList,
  Image,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import { ClinicalBtn } from '../clinical/ClinicalStageShell.jsx';
import { ContractStatusBadge } from '../../contracts/ui/ContractUi.jsx';
import PatientBudgetsContractsTab from '../budgets/PatientBudgetsContractsTab.jsx';
import { StartPatientBudgetModal } from '../budgets/StartPatientBudgetModal.jsx';
import { PatientDelinquencyBanner } from './PatientDelinquencyBanner.jsx';
import { PatientCareFinancialTab } from './PatientCareFinancialTab.jsx';
import { PatientCareIntelligenceTimeline } from './PatientCareIntelligenceTimeline.jsx';
import { PatientCareExecutiveSidebar } from './PatientCareExecutiveSidebar.jsx';
import {
  startNewBudgetForPatient,
  InactiveClinicalSessionError,
} from '../../services/clinicalBudgetHubService.js';
import {
  getPatientDelinquencyInfo,
  buildFinanceNavigationUrl,
} from '../../services/patientFinancialSummaryService.js';
import { listFiles } from '../../services/patientFilesService.js';
import { listPatientContracts } from '../../services/contractModuleService.js';

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

function AlertCard({ alert }) {
  return (
    <div className={`care-central-alert tone-${alert.tone || 'info'}`}>
      <AlertTriangle size={16} aria-hidden />
      <span>{alert.text}</span>
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

  useEffect(() => {
    if (focusTab) {
      setActiveTab(focusTab);
      onFocusTabConsumed?.();
    }
  }, [focusTab, onFocusTabConsumed]);

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

  const handleTimelineAction = (item, actionKey) => {
    if (actionKey === 'budget' || actionKey === 'budget_print') openClinical('orcamento');
    else if (actionKey === 'contract' || actionKey === 'contract_pdf') openClinical('contratos');
    else if (actionKey === 'finance' || actionKey === 'finance_installments') setActiveTab('financeiro');
    else if (actionKey === 'chart') navigate(`/prontuario/${patientId}`);
    else if (actionKey === 'file' || actionKey === 'exam') setActiveTab('exames');
    else if (actionKey === 'open') openClinical('planejamento');
    else openClinical('planejamento');
  };

  const openFinanceTab = () => setActiveTab('financeiro');

  const openNegotiation = () => {
    navigate(buildFinanceNavigationUrl(patientId, { tab: 'financing' }));
  };

  const handleCreateBudget = async ({ importProcedures }) => {
    setBusy(true);
    try {
      const result = startNewBudgetForPatient(user, patientId, { importProcedures });
      setCreateOpen(false);
      onRefresh?.();
      navigate(`/atendimento-clinico/${result.appointmentId}`, { state: { section: result.section } });
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
            <AlertCard key={`${alert.type}-${index}`} alert={alert} />
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
          <ClinicalBtn variant="secondary" icon={FileText} onClick={() => openClinical('orcamento')}>
            Abrir orçamento
          </ClinicalBtn>
        ) : null}
        {actions.showCreateNewBudget ? (
          <ClinicalBtn variant="secondary" icon={Plus} onClick={() => setCreateOpen(true)}>
            Criar novo orçamento
          </ClinicalBtn>
        ) : null}
        {actions.showViewContract ? (
          <ClinicalBtn variant="secondary" icon={FileSignature} onClick={() => openClinical('contratos')}>
            Abrir contrato
          </ClinicalBtn>
        ) : null}
        <ClinicalBtn variant="secondary" icon={DollarSign} onClick={openFinanceTab}>
          Abrir financeiro
        </ClinicalBtn>
        <ClinicalBtn variant="secondary" icon={Image} onClick={() => setActiveTab('exames')}>
          Abrir exames
        </ClinicalBtn>
      </section>

      <div className="care-central-body">
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
              {contracts.length ? contracts.map((contract) => (
                <article key={contract.id} className="care-central-list-card">
                  <div>
                    <strong>{contract.contractNumber || contract.id}</strong>
                    <ContractStatusBadge status={contract.status} />
                    <p>{contract.title || 'Contrato'}</p>
                  </div>
                  <div className="care-central-list-actions">
                    <button type="button" className="button ghost sm" onClick={() => openClinical('contratos')}>
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
          onOpenBudget={() => openClinical('orcamento')}
          onOpenContract={() => openClinical('contratos')}
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
    </div>
  );
}
