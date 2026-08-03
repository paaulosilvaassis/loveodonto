import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Search } from 'lucide-react';
import { formatCurrencyBRL } from '../../utils/currency.js';
import {
  getPatientFinancialSummary,
  buildFinanceNavigationUrl,
} from '../../services/patientFinancialSummaryService.js';

const STATUS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Em aberto' },
  { id: 'overdue', label: 'Vencidos' },
  { id: 'paid', label: 'Pagos' },
  { id: 'canceled', label: 'Cancelados' },
];

const SORT_OPTIONS = [
  { id: 'due_asc', label: 'Vencimento (próximas)' },
  { id: 'due_desc', label: 'Vencimento (mais recentes)' },
  { id: 'overdue_first', label: 'Vencidas primeiro' },
];

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function statusTone(category) {
  if (category === 'overdue') return 'danger';
  if (category === 'paid') return 'success';
  if (category === 'canceled') return 'muted';
  return 'warning';
}

function sortItems(items, sortBy) {
  const copy = [...items];
  if (sortBy === 'due_desc') {
    return copy.sort((a, b) => String(b.dueDate || '').localeCompare(String(a.dueDate || '')));
  }
  if (sortBy === 'overdue_first') {
    return copy.sort((a, b) => {
      if (a.statusCategory === 'overdue' && b.statusCategory !== 'overdue') return -1;
      if (b.statusCategory === 'overdue' && a.statusCategory !== 'overdue') return 1;
      return String(a.dueDate || '').localeCompare(String(b.dueDate || ''));
    });
  }
  return copy.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
}

function FinanceRowActionsMenu({ item, onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      return () => document.removeEventListener('mousedown', handleOutside);
    }
  }, [open]);

  const canPay = item.statusCategory === 'open' || item.statusCategory === 'overdue';
  const canCancel = item.statusCategory !== 'paid' && item.statusCategory !== 'canceled';

  return (
    <div className="care-central-finance-actions-menu" ref={ref}>
      <button
        type="button"
        className="care-central-finance-actions-trigger"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Ações"
      >
        <MoreVertical size={16} />
        <span>Ações</span>
      </button>
      {open ? (
        <div className="care-central-finance-actions-dropdown">
          <button type="button" onClick={() => { onAction('view', item); setOpen(false); }}>
            Visualizar
          </button>
          {canPay ? (
            <button type="button" onClick={() => { onAction('pay', item); setOpen(false); }}>
              Registrar pagamento
            </button>
          ) : null}
          {item.statusCategory === 'paid' ? (
            <button type="button" onClick={() => { onAction('receipt', item); setOpen(false); }}>
              Baixar recibo
            </button>
          ) : null}
          {item.boletoUrl ? (
            <button type="button" onClick={() => { onAction('boleto', item); setOpen(false); }}>
              Baixar boleto
            </button>
          ) : null}
          {item.financingId ? (
            <button type="button" onClick={() => { onAction('renegotiate', item); setOpen(false); }}>
              Renegociar
            </button>
          ) : null}
          {canCancel ? (
            <button type="button" className="is-danger" onClick={() => { onAction('cancel', item); setOpen(false); }}>
              Cancelar parcela
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FinanceInstallmentRow({ item, onAction }) {
  return (
    <tr>
      <td className="col-due">{formatDate(item.dueDate)}</td>
      <td className="col-desc" title={item.installmentLabel}>{item.installmentLabel}</td>
      <td className="col-origin" title={item.originDetail}>{item.originDetail}</td>
      <td className="col-value">{formatCurrencyBRL(item.remaining ?? item.amount)}</td>
      <td className="col-status">
        <span className={`care-central-finance-badge tone-${statusTone(item.statusCategory)}`}>
          {item.statusLabel}
        </span>
      </td>
      <td className="col-method">{item.paymentMethod}</td>
      <td className="col-actions">
        <FinanceRowActionsMenu item={item} onAction={onAction} />
      </td>
    </tr>
  );
}

function FinanceInstallmentCard({ item, onAction }) {
  return (
    <article className="care-central-finance-card">
      <div className="care-central-finance-card-top">
        <strong>{item.installmentLabel}</strong>
        <span className={`care-central-finance-badge tone-${statusTone(item.statusCategory)}`}>
          {item.statusLabel}
        </span>
      </div>
      <p className="care-central-finance-card-origin">{item.originDetail}</p>
      <div className="care-central-finance-card-meta">
        <span>Vencimento: {formatDate(item.dueDate)}</span>
        <span>{formatCurrencyBRL(item.remaining ?? item.amount)}</span>
        <span>{item.paymentMethod}</span>
      </div>
      <FinanceRowActionsMenu item={item} onAction={onAction} />
    </article>
  );
}

export function PatientCareFinancialTab({ patientId }) {
  const navigate = useNavigate();
  const data = useMemo(() => getPatientFinancialSummary(patientId), [patientId]);
  const { summary } = data;

  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('due_asc');

  const filteredItems = useMemo(() => {
    let items = data.items;
    if (statusFilter !== 'all') {
      items = items.filter((item) => item.statusCategory === statusFilter);
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      items = items.filter((item) => item.searchText.includes(query));
    }
    return sortItems(items, sortBy);
  }, [data.items, statusFilter, searchQuery, sortBy]);

  const openFinance = (opts = {}) => {
    navigate(buildFinanceNavigationUrl(patientId, opts));
  };

  const handleAction = (action, item) => {
    const receivableId = item.kind === 'receivable' ? item.id : item.receivableId;
    if (action === 'view') openFinance({ receivableId });
    else if (action === 'pay') openFinance({ receivableId });
    else if (action === 'receipt') openFinance({ receivableId });
    else if (action === 'boleto' && item.boletoUrl) window.open(item.boletoUrl, '_blank', 'noopener,noreferrer');
    else if (action === 'renegotiate') openFinance({ tab: 'financing' });
    else if (action === 'cancel') openFinance({ receivableId });
  };

  return (
    <div className="care-central-finance">
      <div className="care-central-finance-kpis">
        <article className="care-central-finance-kpi">
          <span>Total em aberto</span>
          <strong>{formatCurrencyBRL(summary.totalOpen)}</strong>
        </article>
        <article className="care-central-finance-kpi tone-danger">
          <span>Total vencido</span>
          <strong>{formatCurrencyBRL(summary.totalOverdue)}</strong>
        </article>
        <article className="care-central-finance-kpi tone-success">
          <span>Total pago</span>
          <strong>{formatCurrencyBRL(summary.totalPaid)}</strong>
        </article>
        <article className="care-central-finance-kpi">
          <span>Próximo vencimento</span>
          <strong>{formatDate(summary.nextDueDate)}</strong>
        </article>
        <article className="care-central-finance-kpi">
          <span>Quantidade de parcelas</span>
          <strong>{summary.totalInstallmentsCount}</strong>
        </article>
        <article className="care-central-finance-kpi">
          <span>Parcelas em aberto</span>
          <strong>{summary.openInstallmentsCount}</strong>
        </article>
      </div>

      <div className="care-central-finance-controls">
        <div className="care-central-finance-filters">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`care-central-filter-chip${statusFilter === filter.id ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="care-central-finance-controls-row">
          <label className="care-central-finance-search">
            <Search size={16} aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por orçamento, contrato ou forma de pagamento"
            />
          </label>
          <select
            className="care-central-finance-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Ordenação"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="care-central-finance-toolbar">
        <button type="button" className="button secondary sm" onClick={() => openFinance()}>
          Abrir Contas a Receber
        </button>
        <button type="button" className="button ghost sm" onClick={() => openFinance({ tab: 'boletos' })}>
          Ver boletos
        </button>
        <button type="button" className="button ghost sm" onClick={() => openFinance({ tab: 'financing' })}>
          Ver financiamentos
        </button>
      </div>

      <div className="care-central-finance-table-wrap care-central-finance-table-wrap--desktop">
        <table className="care-central-finance-table">
          <thead>
            <tr>
              <th className="col-due">Vencimento</th>
              <th className="col-desc">Descrição</th>
              <th className="col-origin">Origem</th>
              <th className="col-value">Valor</th>
              <th className="col-status">Status</th>
              <th className="col-method">Forma</th>
              <th className="col-actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length ? filteredItems.map((item) => (
              <FinanceInstallmentRow
                key={`${item.kind}-${item.id}`}
                item={item}
                onAction={handleAction}
              />
            )) : (
              <tr>
                <td colSpan={7} className="care-central-muted">Nenhuma parcela encontrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="care-central-finance-cards care-central-finance-cards--mobile">
        {filteredItems.length ? filteredItems.map((item) => (
          <FinanceInstallmentCard
            key={`${item.kind}-${item.id}-card`}
            item={item}
            onAction={handleAction}
          />
        )) : (
          <p className="care-central-muted">Nenhuma parcela encontrada.</p>
        )}
      </div>
    </div>
  );
}
