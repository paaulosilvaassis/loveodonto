import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.js';
import {
  listOperationalContractQueue,
  listQueueProfessionals,
  QUEUE_SHORTCUTS,
} from '../../services/operationalContractQueueService.js';
import {
  OPERATIONAL_UX_STATUS,
  OPERATIONAL_UX_STATUS_LABELS,
  OPERATIONAL_UX_STATUS_VARIANT,
} from '../../contracts/operationalContractUi.js';
import { formatCtrCurrency } from '../../contracts/ui/ContractUi.jsx';
import ContractDetailModal from '../../components/contracts/ContractDetailModal.jsx';
import { buildContractViewIdentity } from '../../contracts/contractViewIdentity.js';
import {
  sendContractForSignature,
  finalizeGeneratedContract,
} from '../../services/contractModuleService.js';
import {
  UX_MESSAGES,
  formatUxMessage,
  resolvePendencyFixHint,
} from '../../contracts/operationalUxMessages.js';
import LocalOperationalUxTestBanner from '../../components/contracts/operational/LocalOperationalUxTestBanner.jsx';
import {
  getServerOperationalUxSnapshot,
  recordContractsRolloutMetric,
} from '../../services/contractsOperationalRolloutService.js';

const DEFAULT_FILTERS = {
  query: '',
  shortcut: 'all',
  status: '',
  professional: '',
  unit: '',
  documentType: '',
  origin: '',
  pendingSignature: '',
  dateFrom: '',
  dateTo: '',
};

function StatusPill({ uxStatus, label }) {
  const variant = OPERATIONAL_UX_STATUS_VARIANT[uxStatus] || 'muted';
  return <span className={`ctr-badge ctr-badge--${variant}`}>{label}</span>;
}

export default function ContractsFilaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [refresh, setRefresh] = useState(0);
  const [selectedView, setSelectedView] = useState(null);
  const [toast, setToast] = useState(null);

  const rows = useMemo(() => {
    void refresh;
    return listOperationalContractQueue(filters);
  }, [filters, refresh]);

  const professionals = useMemo(() => listQueueProfessionals(), [refresh]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const runCta = (row) => {
    const key = row.cta?.key;
    try {
      if (key === 'send') {
        sendContractForSignature(user, row.id);
        recordContractsRolloutMetric('signature_link_generated', user);
        setRefresh((x) => x + 1);
        showToast('Link de assinatura gerado. Envie ao paciente pelo canal da clínica (simulação em staging).');
        return;
      }
      if (key === 'continue' || key === 'review' || key === 'resolve') {
        if (row.quoteSource === 'clinical_budget' && row.quoteId) {
          navigate(`/atendimento-clinico/${row.quoteId}?section=contratos`);
          return;
        }
        setSelectedView(buildContractViewIdentity(row));
        return;
      }
      if (key === 'download' || key === 'view' || key === 'view_signature') {
        setSelectedView(buildContractViewIdentity(row));
        return;
      }
      if (row.status === 'draft') {
        finalizeGeneratedContract(user, row.id);
        setRefresh((x) => x + 1);
        showToast('Contrato finalizado.');
        return;
      }
      setSelectedView(buildContractViewIdentity(row));
    } catch (e) {
      const msg = String(e?.message || '');
      if (/permiss/i.test(msg)) showToast(formatUxMessage('PERMISSION_DENIED'), 'error');
      else if (/contato|e-mail|email|telefone/i.test(msg)) showToast(formatUxMessage('SIGNER_WITHOUT_CONTACT'), 'error');
      else showToast(msg || formatUxMessage('LOAD_FAILED'), 'error');
    }
  };

  const serverSnap = getServerOperationalUxSnapshot(user);

  return (
    <div className="ctr-page ctr-fila" data-testid="contracts-queue-page">
      {toast ? <div className={`toast ${toast.type}`} role="status">{toast.message}</div> : null}
      <LocalOperationalUxTestBanner
        serverGlobalEnabled={serverSnap.productionGlobalEnabled}
        serverTenantEnabled={serverSnap.tenantEnabled}
        serverUxEnabled={serverSnap.operationalUxEnabled}
      />

      <header className="ctr-fila-header">
        <div>
          <h2>Fila de contratos</h2>
          <p>Busca, filtros e próxima ação em uma única superfície operacional.</p>
        </div>
      </header>

      <div className="ctr-fila-shortcuts" role="tablist" aria-label="Atalhos de status">
        {QUEUE_SHORTCUTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={filters.shortcut === s.id}
            className={`ctr-fila-chip${filters.shortcut === s.id ? ' is-active' : ''}`}
            onClick={() => setFilters((f) => ({ ...f, shortcut: s.id }))}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="ctr-fila-filters">
        <label className="ctr-fila-search">
          Buscar
          <input
            data-testid="contracts-queue-search"
            placeholder="Paciente, número, orçamento, telefone, profissional"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
          />
        </label>
        <label>
          Status
          <select
            data-testid="contracts-queue-status"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="">Todos</option>
            {Object.entries(OPERATIONAL_UX_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Profissional
          <select
            value={filters.professional}
            onChange={(e) => setFilters((f) => ({ ...f, professional: e.target.value }))}
          >
            <option value="">Todos</option>
            {professionals.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <input
            value={filters.unit}
            onChange={(e) => setFilters((f) => ({ ...f, unit: e.target.value }))}
            placeholder="Unidade"
          />
        </label>
        <label>
          Tipo de documento
          <select
            value={filters.documentType}
            onChange={(e) => setFilters((f) => ({ ...f, documentType: e.target.value }))}
          >
            <option value="">Todos</option>
            <option value="servicos">Contrato de serviços</option>
            <option value="consentimento">Consentimento</option>
            <option value="lgpd">LGPD</option>
          </select>
        </label>
        <label>
          Origem
          <select
            value={filters.origin}
            onChange={(e) => setFilters((f) => ({ ...f, origin: e.target.value }))}
          >
            <option value="">Todas</option>
            <option value="clinical_budget">Clínico</option>
            <option value="crm_budget">CRM</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label>
          Pendência de assinatura
          <select
            value={filters.pendingSignature}
            onChange={(e) => setFilters((f) => ({ ...f, pendingSignature: e.target.value }))}
          >
            <option value="">Todas</option>
            <option value="yes">Com pendência</option>
            <option value="no">Sem pendência</option>
          </select>
        </label>
        <label>
          De
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
          />
        </label>
      </div>

      <p className="ctr-fila-count">{rows.length} contrato(s)</p>

      <div className="ctr-fila-list">
        {rows.length === 0 ? (
          <div className="ctr-fila-empty" data-testid="contracts-queue-empty">
            <strong>{UX_MESSAGES.QUEUE_EMPTY.title}</strong>
            <p>{UX_MESSAGES.QUEUE_EMPTY.body}</p>
          </div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="ctr-fila-card" data-testid="contracts-queue-row">
              <header>
                <div>
                  <strong>{row.patientName}</strong>
                  <span className="ctr-fila-meta">{row.contractNumber}</span>
                </div>
                <StatusPill uxStatus={row.uxStatus} label={row.uxStatusLabel} />
              </header>
              <p className="ctr-fila-treatment">{row.treatmentSummary}</p>
              <div className="ctr-fila-grid">
                <span><em>Quanto:</em> {formatCtrCurrency(row.totalValue)}</span>
                <span><em>Profissional:</em> {row.professionalName}</span>
                <span>
                  <em>Atualizado:</em>{' '}
                  {row.updatedAt ? new Date(row.updatedAt).toLocaleString('pt-BR') : '—'}
                </span>
                <span><em>O que fazer agora:</em> {row.nextAction}</span>
              </div>
              {row.whoSigned || row.whoPending ? (
                <div className="ctr-fila-signers" data-testid="contracts-queue-signers">
                  {row.whoSigned ? <span>Já assinou: {row.whoSigned}</span> : null}
                  {row.whoPending ? <span>Falta assinar: {row.whoPending}</span> : null}
                </div>
              ) : null}
              {row.uxStatus === OPERATIONAL_UX_STATUS.WITH_PENDING && row.pendencyReasons?.length ? (
                <div className="ctr-fila-pendency-box" data-testid="contracts-queue-pendency">
                  <ul className="ctr-fila-pendencies">
                    {row.pendencyReasons.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                  {(() => {
                    const hint = resolvePendencyFixHint(row.pendencyReasons[0]);
                    return (
                      <p className="ctr-fila-fix-hint">
                        <strong>{hint.title}:</strong> {hint.body}
                      </p>
                    );
                  })()}
                </div>
              ) : null}
              <footer>
                <button
                  type="button"
                  className="button small primary"
                  data-testid="contracts-queue-cta"
                  onClick={() => runCta(row)}
                >
                  {row.cta?.label || 'Abrir'}
                </button>
                <button type="button" className="button small secondary" onClick={() => setSelectedView(buildContractViewIdentity(row))}>
                  Detalhes
                </button>
              </footer>
            </article>
          ))
        )}
      </div>

      <ContractDetailModal
        open={Boolean(selectedView?.contractId)}
        contractId={selectedView?.contractId}
        expectedIdentity={selectedView}
        onOpenChange={(o) => { if (!o) setSelectedView(null); }}
      />
    </div>
  );
}
