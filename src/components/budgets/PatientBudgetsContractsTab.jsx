import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Eye,
  Printer,
  FileSignature,
  DollarSign,
  Lock,
} from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import { can } from '../../permissions/permissions.js';
import { ClinicalBtn } from '../clinical/ClinicalStageShell.jsx';
import { BudgetStatusBadge } from '../clinical/budget/BudgetStatusBadge.jsx';
import { ContractTable, ContractStatusBadge, formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import { StartPatientBudgetModal } from './StartPatientBudgetModal.jsx';
import {
  getPatientBudgetOverview,
  startNewBudgetForPatient,
  InactiveClinicalSessionError,
} from '../../services/clinicalBudgetHubService.js';
import { getBudgetLockContext } from '../../services/clinicalBudgetLockService.js';
import { BUDGET_STATUS } from '../../services/clinicalBudgetConstants.js';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export default function PatientBudgetsContractsTab({ patientId, patientName = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canCreate = can(user, 'comercial:view') || can(user, 'prontuario_contratos:create') || user?.role === 'admin';
  const canViewFinance = can(user, 'financeiro_relatorios:view') || user?.role === 'financeiro';

  const overview = useMemo(
    () => getPatientBudgetOverview(patientId),
    [patientId, refreshKey],
  );

  const currentDraft = overview.history.find(
    (row) => !row.isHistorical && row.status === BUDGET_STATUS.RASCUNHO,
  );

  const historyRows = overview.history.filter((row) => row.isHistorical || row.status !== BUDGET_STATUS.RASCUNHO);
  const lockedRows = overview.history.filter((row) => {
    const lock = getBudgetLockContext(row.appointmentId);
    return lock.isLocked && row.id === lock.budget?.id;
  });

  const openClinical = (appointmentId, section = 'orcamento') => {
    navigate(`/atendimento-clinico/${appointmentId}`, { state: { section } });
  };

  const handleCreateConfirm = async ({ importProcedures }) => {
    if (!patientId || !user) return;
    setBusy(true);
    setError('');
    try {
      const result = startNewBudgetForPatient(user, patientId, { importProcedures });
      setCreateOpen(false);
      setRefreshKey((k) => k + 1);
      openClinical(result.appointmentId, result.section);
    } catch (err) {
      if (err instanceof InactiveClinicalSessionError || err.code === 'INACTIVE_SESSION') {
        setError(err.message);
        navigate('/gestao-comercial/jornada-do-paciente');
        return;
      }
      setError(err.message || 'Erro ao criar orçamento.');
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const budgetTableRows = overview.history.map((row) => ({
    ...row,
    number: row.budgetNumber,
    contract: row.contractStatus,
    value: formatCtrCurrency(row.totalValue),
    date: formatDate(row.archivedAt || row.createdAt),
  }));

  const contractRows = overview.contracts.map((c) => ({
    id: c.id,
    number: c.contractNumber || c.id,
    title: c.title || 'Contrato',
    status: c.status,
    value: formatCtrCurrency(c.totalValueSnapshot),
    date: formatDate(c.signedAt || c.generatedAt),
  }));

  return (
    <div className="tab-content patient-budgets-contracts-tab">
      {error ? <div className="clinical-inline-error">{error}</div> : null}

      <div className="patient-budgets-tab-header">
        <div>
          <h3>Orçamentos e Contratos</h3>
          <p className="text-sm text-[var(--color-text-muted)]">
            Histórico financeiro-comercial de {patientName || 'paciente'}, com acesso rápido a documentos e novos orçamentos.
          </p>
        </div>
        {canCreate ? (
          <ClinicalBtn variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
            Criar novo orçamento
          </ClinicalBtn>
        ) : null}
      </div>

      <section className="patient-budgets-section">
        <h4>Orçamento atual</h4>
        {currentDraft ? (
          <div className="patient-budget-current-card">
            <div>
              <strong>{currentDraft.budgetNumber}</strong>
              <BudgetStatusBadge status={currentDraft.status} />
              <p>Em elaboração — {formatCtrCurrency(currentDraft.totalValue)}</p>
            </div>
            <ClinicalBtn variant="secondary" icon={Eye} onClick={() => openClinical(currentDraft.appointmentId, 'planejamento')}>
              Continuar planejamento
            </ClinicalBtn>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            Nenhum orçamento em elaboração. Use o botão acima para iniciar um novo planejamento.
          </p>
        )}
      </section>

      <section className="patient-budgets-section">
        <h4>Histórico de orçamentos</h4>
        <ContractTable
          columns={[
            { key: 'number', label: 'Orçamento' },
            { key: 'status', label: 'Status', render: (r) => <BudgetStatusBadge status={r.status} /> },
            {
              key: 'contract',
              label: 'Contrato',
              render: (r) => (r.contract ? <ContractStatusBadge status={r.contract} /> : '—'),
            },
            { key: 'value', label: 'Valor' },
            { key: 'date', label: 'Data' },
            {
              key: 'actions',
              label: 'Ações',
              render: (r) => (
                <div className="budgets-hub-actions">
                  <button type="button" className="button ghost sm" onClick={() => openClinical(r.appointmentId, 'orcamento')}>
                    <Eye size={14} /> Ver
                  </button>
                  <button type="button" className="button ghost sm" onClick={() => openClinical(r.appointmentId, 'orcamento')}>
                    <Printer size={14} /> PDF
                  </button>
                  {r.contractId ? (
                    <button type="button" className="button ghost sm" onClick={() => openClinical(r.appointmentId, 'contratos')}>
                      <FileSignature size={14} /> Contrato
                    </button>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={budgetTableRows}
          emptyMessage="Nenhum orçamento registrado."
        />
      </section>

      {lockedRows.length > 0 ? (
        <section className="patient-budgets-section">
          <h4><Lock size={16} /> Registros bloqueados</h4>
          <p className="text-sm text-[var(--color-text-muted)] mb-2">
            Orçamentos aprovados ou com contrato gerado permanecem apenas para consulta e impressão.
          </p>
          <ul className="patient-budget-locked-list">
            {lockedRows.map((row) => (
              <li key={row.id}>
                <span>{row.budgetNumber}</span>
                <BudgetStatusBadge status={row.status} />
                <button type="button" className="button ghost sm" onClick={() => openClinical(row.appointmentId, 'orcamento')}>
                  Visualizar
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="patient-budgets-section">
        <h4>Contratos vinculados</h4>
        <ContractTable
          columns={[
            { key: 'number', label: 'Número' },
            { key: 'title', label: 'Documento' },
            { key: 'status', label: 'Status', render: (r) => <ContractStatusBadge status={r.status} /> },
            { key: 'value', label: 'Valor' },
            { key: 'date', label: 'Data' },
            {
              key: 'actions',
              label: 'Ações',
              render: (r) => (
                <button type="button" className="button ghost sm" onClick={() => openClinical(overview.history[0]?.appointmentId, 'contratos')}>
                  <FileSignature size={14} /> Abrir
                </button>
              ),
            },
          ]}
          rows={contractRows}
          emptyMessage="Nenhum contrato vinculado."
        />
      </section>

      {canViewFinance ? (
        <section className="patient-budgets-section">
          <h4>Financeiro vinculado</h4>
          <p className="text-sm text-[var(--color-text-muted)]">
            Consulte parcelas e recebíveis na área financeira quando o orçamento gerou financiamento ou contas a receber.
          </p>
          <ClinicalBtn variant="secondary" icon={DollarSign} onClick={() => navigate('/financeiro/contas-receber')}>
            Ver contas a receber
          </ClinicalBtn>
        </section>
      ) : null}

      <StartPatientBudgetModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={busy}
        patientId={patientId}
        patientName={patientName}
        onConfirm={handleCreateConfirm}
      />
    </div>
  );
}
