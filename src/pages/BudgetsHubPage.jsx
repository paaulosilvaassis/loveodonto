import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Receipt } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { can } from '../permissions/permissions.js';
import { ClinicalBtn } from '../components/clinical/ClinicalStageShell.jsx';
import { StartPatientBudgetModal } from '../components/budgets/StartPatientBudgetModal.jsx';
import { BudgetHubKpis } from '../components/budgets/BudgetHubKpis.jsx';
import { BudgetHubFilters } from '../components/budgets/BudgetHubFilters.jsx';
import { BudgetHubCard } from '../components/budgets/BudgetHubCard.jsx';
import { BudgetHubListView } from '../components/budgets/BudgetHubListView.jsx';
import OperationalContractWizard from '../components/contracts/operational/OperationalContractWizard.jsx';
import {
  listAllClinicalBudgetRows,
  listBudgetHubProfessionals,
  computeBudgetHubKpis,
  resolveRowPatientId,
  resolveRowPatientName,
  InactiveClinicalSessionError,
  createNewBudget,
} from '../services/clinicalBudgetHubService.js';
import { openExistingBudget } from '../services/budgetNavigationService.js';
import { buildFinanceNavigationUrl } from '../services/patientFinancialSummaryService.js';
import { validateBudgetContractGeneration } from '../services/operationalContractWizardService.js';
import { formatUxMessage } from '../contracts/operationalUxMessages.js';

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

  const allRows = useMemo(
    () => listAllClinicalBudgetRows({}),
    [refreshKey],
  );

  const rows = useMemo(
    () => listAllClinicalBudgetRows(filters),
    [filters, refreshKey],
  );

  const kpis = useMemo(() => computeBudgetHubKpis(allRows), [allRows]);
  const professionals = useMemo(() => listBudgetHubProfessionals(), [refreshKey]);

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
      if (error instanceof InactiveClinicalSessionError || error.code === 'INACTIVE_SESSION') {
        showToast(error.message, 'error');
        navigate('/gestao-comercial/jornada-do-paciente');
        return;
      }
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
  };

  return (
    <div className="bhub-page">
      <header className="bhub-page-header">
        <div>
          <p className="bhub-page-eyebrow">Comercial · CRM Odontológico</p>
          <h1>
            <Receipt size={24} aria-hidden />
            Central de Orçamentos
          </h1>
          <p>
            Visualize negociações, acompanhe conversões e avance tratamentos com clareza comercial.
            Orçamento aprovado? Use <strong>Gerar contrato</strong> no card — o assistente guia até a assinatura.
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

      <OperationalContractWizard
        open={Boolean(wizardRow)}
        onOpenChange={(open) => {
          if (!open) setWizardRow(null);
        }}
        user={user}
        row={wizardRow}
        onGoToQueue={() => {
          setWizardRow(null);
          navigate('/gestao/contratos/fila');
        }}
        onSuccess={() => {
          setRefreshKey((k) => k + 1);
          showToast('Pacote documental atualizado. Se estiver pronto, envie pela Fila de contratos.');
        }}
      />

      {toast ? (
        <div className={`toast ${toast.type}`} role="status">{toast.message}</div>
      ) : null}
    </div>
  );
}
