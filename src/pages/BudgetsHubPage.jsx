import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { can } from '../permissions/permissions.js';
import { ClinicalBtn } from '../components/clinical/ClinicalStageShell.jsx';
const StartPatientBudgetModal = lazy(() =>
  import('../components/budgets/StartPatientBudgetModal.jsx').then((m) => ({
    default: m.StartPatientBudgetModal,
  })),
);
import { BudgetHubKpis } from '../components/budgets/BudgetHubKpis.jsx';
import { BudgetHubFilters } from '../components/budgets/BudgetHubFilters.jsx';
import { BudgetHubCard } from '../components/budgets/BudgetHubCard.jsx';
import { BudgetHubListView } from '../components/budgets/BudgetHubListView.jsx';
const OperationalContractWizard = lazy(() =>
  import('../components/contracts/operational/OperationalContractWizard.jsx'),
);
import LocalOperationalUxTestBanner from '../components/contracts/operational/LocalOperationalUxTestBanner.jsx';
import {
  listClinicalBudgetHubBaseData,
  listBudgetHubRowsFromBaseData,
  resolveRowPatientId,
  resolveRowPatientName,
  createNewBudget,
} from '../services/clinicalBudgetHubService.js';
import { openExistingBudget } from '../services/budgetNavigationService.js';
import { buildFinanceNavigationUrl } from '../services/patientFinancialSummaryService.js';
import { validateBudgetContractGeneration } from '../services/operationalContractWizardService.js';
import { formatUxMessage } from '../contracts/operationalUxMessages.js';
import {
  fetchContractsOperationalRolloutFromServer,
  getServerOperationalUxSnapshot,
  isLocalOperationalUxTestModeActive,
  isOperationalContractsUxEnabledForCurrentClinic,
  recordContractsRolloutMetric,
} from '../services/contractsOperationalRolloutService.js';

const DEFAULT_FILTERS = {
  query: '',
  budgetQuery: '',
  status: '',
  professionalId: '',
  dateFrom: '',
  dateTo: '',
  minValue: '',
  maxValue: '',
  sortBy: 'recent',
};

export default function BudgetsHubPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState('cards');
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefillPatient, setPrefillPatient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [wizardRow, setWizardRow] = useState(null);

  const canCreate = can(user, 'comercial:view') || can(user, 'prontuario_contratos:create') || user?.role === 'admin';
  const canViewFinance = can(user, 'financeiro_relatorios:view') || user?.role === 'financeiro';
  const [rolloutTick, setRolloutTick] = useState(0);
  const operationalUxEnabled = useMemo(
    () => isOperationalContractsUxEnabledForCurrentClinic(user),
    [user, rolloutTick],
  );
  const serverSnap = useMemo(() => getServerOperationalUxSnapshot(user), [user, rolloutTick]);
  const localTestMode = useMemo(() => isLocalOperationalUxTestModeActive(), [rolloutTick]);

  useEffect(() => {
    let cancelled = false;
    fetchContractsOperationalRolloutFromServer(user)
      .then(() => {
        if (!cancelled) setRolloutTick((t) => t + 1);
      })
      .catch(() => {
        /* cache local permanece; hub segue com V1 se OFF */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const baseData = useMemo(() => {
    // 1 scan canônico para evitar leituras completas duplicadas.
    return listClinicalBudgetHubBaseData();
  }, [refreshKey]);

  const rows = useMemo(
    () => listBudgetHubRowsFromBaseData(baseData.rawRows, filters),
    [baseData.rawRows, filters],
  );

  const kpis = baseData.kpis;
  const professionals = baseData.professionals;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const openExistingBudgetRow = (row, section = 'orcamento') => {
    openExistingBudget(navigate, {
      budgetId: row.id,
      patientId: resolveRowPatientId(row),
      appointmentId: row.appointmentId,
      section,
    });
  };

  const handleCreateConfirm = async ({ patientId, importProcedures }) => {
    if (!patientId || !user) return;
    setBusy(true);
    try {
      createNewBudget(navigate, user, patientId, { importProcedures });
      setCreateOpen(false);
      setPrefillPatient(null);
      setRefreshKey((k) => k + 1);
    } catch (error) {
      // Mantém o usuário no hub com feedback claro (sem redirect forçado).
      showToast(error.message || 'Erro ao criar orçamento.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRowCreateNew = (row) => {
    const currentPatientId = resolveRowPatientId(row);
    if (!currentPatientId) {
      showToast('Paciente não identificado.', 'error');
      return;
    }
    setPrefillPatient({ id: currentPatientId, name: resolveRowPatientName(row) });
    setCreateOpen(true);
  };

  const handleFinance = (row) => {
    const currentPatientId = resolveRowPatientId(row);
    if (!currentPatientId) {
      showToast('Paciente não identificado.', 'error');
      return;
    }
    if (row.financingId) {
      navigate(`/financeiro/financiamento?highlight=${row.financingId}`);
      return;
    }
    navigate(buildFinanceNavigationUrl(currentPatientId));
  };

  const handleGenerateContract = (row) => {
    if (!operationalUxEnabled) {
      openExistingBudgetRow(row, 'contratos');
      return;
    }
    const patientId = resolveRowPatientId(row);
    const check = validateBudgetContractGeneration({
      patientId,
      budgetId: row.id,
      appointmentId: row.appointmentId,
      allowExisting: Boolean(row.contractId),
    });
    if (check.duplicateBlocked && !row.contractId) {
      showToast(check.errors[0] || formatUxMessage('CONTRACT_ALREADY_EXISTS'), 'error');
      return;
    }
    if (!row.contractId && !check.ok) {
      showToast(check.errors[0] || formatUxMessage('BUDGET_INCOMPLETE'), 'error');
      return;
    }
    recordContractsRolloutMetric(
      row.contractId ? 'contract_continue_clicked' : 'contract_generate_clicked',
      user,
    );
    recordContractsRolloutMetric('wizard_opened', user);
    setWizardRow(row);
  };

  const cardHandlers = {
    onOpen: (row) => openExistingBudgetRow(row, 'orcamento'),
    onPrint: (row) => openExistingBudgetRow(row, 'orcamento'),
    onHistory: (row) => openExistingBudgetRow(row, 'planejamento'),
    onContract: (row) => openExistingBudgetRow(row, 'contratos'),
    onGenerateContract: handleGenerateContract,
    onFinance: handleFinance,
    onCreateNew: handleRowCreateNew,
    operationalUxEnabled,
  };

  return (
    <div className="bhub-page">
      <LocalOperationalUxTestBanner
        serverGlobalEnabled={serverSnap.productionGlobalEnabled}
        serverTenantEnabled={serverSnap.tenantEnabled}
        serverUxEnabled={serverSnap.operationalUxEnabled}
      />
      <header className="bhub-page-header">
        <div>
          <p className="bhub-page-eyebrow">Comercial · CRM Odontológico</p>
          <h1>
            <Receipt size={24} aria-hidden />
            Central de Orçamentos
          </h1>
          <p>
            Visualize negociações, acompanhe conversões e avance tratamentos com clareza comercial.
            {operationalUxEnabled
              ? <>Orçamento aprovado? Use <strong>Gerar contrato</strong> no card — o assistente guia até a assinatura.</>
              : <>Modo clássico (V1). Abra o orçamento e use a seção Contratos. UX operacional desligada neste tenant.</>}
            {localTestMode ? (
              <> {' '}Servidor OFF · <strong>Teste local: ON</strong>.</>
            ) : null}
          </p>
        </div>
        {canCreate ? (
          <ClinicalBtn variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
            Criar novo orçamento
          </ClinicalBtn>
        ) : null}
      </header>

      <BudgetHubKpis kpis={kpis} />

      <BudgetHubFilters
        filters={filters}
        onChange={setFilters}
        professionals={professionals}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        resultCount={rows.length}
      />

      {rows.length === 0 ? (
        <div className="bhub-empty">
          <Receipt size={40} aria-hidden />
          <h3>Nenhum orçamento encontrado</h3>
          <p>Ajuste os filtros ou crie um novo orçamento para iniciar uma negociação.</p>
          {canCreate ? (
            <ClinicalBtn variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Criar novo orçamento
            </ClinicalBtn>
          ) : null}
        </div>
      ) : viewMode === 'cards' ? (
        <div className="bhub-cards-grid">
          {rows.map((row) => (
            <BudgetHubCard
              key={`${row.id}-${row.archivedAt || 'current'}`}
              row={row}
              canCreate={canCreate}
              canViewFinance={canViewFinance}
              {...cardHandlers}
            />
          ))}
        </div>
      ) : (
        <BudgetHubListView
          rows={rows}
          canCreate={canCreate}
          canViewFinance={canViewFinance}
          {...cardHandlers}
        />
      )}

      {createOpen ? (
        <Suspense fallback={null}>
          <StartPatientBudgetModal
            open={createOpen}
            onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) setPrefillPatient(null);
            }}
            busy={busy}
            patientId={prefillPatient?.id}
            patientName={prefillPatient?.name}
            onConfirm={handleCreateConfirm}
          />
        </Suspense>
      ) : null}

      {wizardRow ? (
        <Suspense fallback={null}>
          <OperationalContractWizard
            open
            onOpenChange={(open) => {
              if (!open) setWizardRow(null);
            }}
            user={user}
            row={wizardRow}
            onGoToQueue={() => {
              recordContractsRolloutMetric('wizard_go_to_queue', user);
              setWizardRow(null);
              navigate('/gestao/contratos/fila');
            }}
            onSuccess={() => {
              recordContractsRolloutMetric('wizard_completed', user);
              setRefreshKey((k) => k + 1);
              showToast('Pacote documental atualizado. Se estiver pronto, envie pela Fila de contratos.');
            }}
          />
        </Suspense>
      ) : null}

      {toast ? (
        <div className={`toast ${toast.type}`} role="status">{toast.message}</div>
      ) : null}
    </div>
  );
}
