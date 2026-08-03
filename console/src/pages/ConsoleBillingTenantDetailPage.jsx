import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  applyInvoiceDiscount,
  blockTenantForBilling,
  getTenantBillingDetail,
  markInvoicePaid,
  unblockTenantBilling,
  updateInvoiceDueDate,
  updateSubscriptionPlanBilling,
} from '../services/platformConsoleService.js';
import { PLAN_CATALOG, formatPlanPrice, getPlanLabel } from '../services/platformConsoleConstants.js';
import FinancialStatusBadge from '../components/billing/FinancialStatusBadge.jsx';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  parseAmountToCents,
} from '../components/billing/billingUtils.js';

const TABS = [
  { id: 'geral', label: 'Geral' },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'faturas', label: 'Faturas' },
  { id: 'notificacoes', label: 'Notificações' },
  { id: 'auditoria', label: 'Auditoria' },
];

const PAYMENT_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'cartao', label: 'Cartão' },
  { value: 'transferencia', label: 'Transferência' },
  { value: 'outro', label: 'Outro' },
];

export default function ConsoleBillingTenantDetailPage() {
  const { tenantId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState('');
  const [tab, setTab] = useState('geral');
  const [paymentForm, setPaymentForm] = useState({
    amountCents: '',
    paidAt: new Date().toISOString().slice(0, 10),
    paymentMethod: 'pix',
    notes: '',
    nextDueRule: 'from_payment',
  });
  const [dueDateForm, setDueDateForm] = useState('');
  const [planForm, setPlanForm] = useState('');
  const [discountForm, setDiscountForm] = useState({ amount: '', notes: '' });

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getTenantBillingDetail(tenantId);
      setDetail(data);
      const openInvoice = (data?.invoices || []).find((row) => ['open', 'due_today', 'overdue'].includes(row.status));
      if (openInvoice) {
        setPaymentForm((prev) => ({
          ...prev,
          amountCents: String((openInvoice.amount_cents || 0) / 100).replace('.', ','),
        }));
        setDueDateForm(openInvoice.due_date || '');
      }
      setPlanForm(data?.subscription?.plan_code || data?.tenant?.plan_code || 'Start');
    } catch (e) {
      setError(e?.message || 'Erro ao carregar detalhes.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const tenant = detail?.tenant;
  const subscription = detail?.subscription;
  const openInvoice = useMemo(
    () => (detail?.invoices || []).find((row) => ['open', 'due_today', 'overdue'].includes(row.status)) || null,
    [detail],
  );
  const isBlocked = tenant?.status === 'billing_blocked' || tenant?.status === 'blocked';

  const runAction = async (key, fn) => {
    try {
      setSaving(key);
      setError('');
      setSuccess('');
      await fn();
      await loadDetail();
      setSuccess('Alteração salva com sucesso.');
    } catch (e) {
      setError(e?.message || 'Falha na operação.');
    } finally {
      setSaving('');
    }
  };

  if (loading) {
    return (
      <div className="rc-page">
        <Link to="/billing" className="rc-link">← Revenue Center</Link>
        <p className="rc-loading">Carregando clínica…</p>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="rc-page">
        <Link to="/billing" className="rc-link">← Revenue Center</Link>
        <p className="pc-error">{error || 'Clínica não encontrada.'}</p>
      </div>
    );
  }

  return (
    <div className="rc-page">
      <Link to="/billing" className="rc-link">← Revenue Center</Link>

      <header className="rc-detail-hero">
        <div>
          <h1>{tenant.trade_name || tenant.legal_name}</h1>
          <p>{getPlanLabel(subscription?.plan_code || tenant.plan_code)} · {formatPlanPrice(subscription?.plan_code || tenant.plan_code)}/mês</p>
        </div>
        <div className="rc-detail-hero__meta">
          <FinancialStatusBadge status={detail?.financialStatus} />
          <div className="rc-detail-hero__actions">
            {!isBlocked ? (
              <button type="button" className="rc-btn rc-btn--danger" disabled={!!saving} onClick={() => runAction('block', () => blockTenantForBilling(tenantId))}>
                Bloquear
              </button>
            ) : (
              <button type="button" className="rc-btn rc-btn--primary" disabled={!!saving} onClick={() => runAction('unblock', () => unblockTenantBilling(tenantId))}>
                Desbloquear
              </button>
            )}
          </div>
        </div>
      </header>

      {error ? <p className="pc-error">{error}</p> : null}
      {success ? <p className="pc-success">{success}</p> : null}

      <nav className="rc-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rc-tabs__item${tab === item.id ? ' rc-tabs__item--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'geral' ? (
        <div className="rc-detail-grid">
          <section className="rc-panel">
            <h2>Informações da clínica</h2>
            <dl className="rc-dl">
              <div><dt>CNPJ / ID</dt><dd>{tenant.id.slice(0, 8)}…</dd></div>
              <div><dt>Status operacional</dt><dd>{tenant.status}</dd></div>
              <div><dt>Cobrança</dt><dd>{tenant.billing_status || '—'}</dd></div>
              <div><dt>Trial até</dt><dd>{formatDateTime(subscription?.trial_ends_at)}</dd></div>
              <div><dt>Próximo vencimento</dt><dd>{formatDate(subscription?.next_due_date)}</dd></div>
              {tenant.billing_blocked_at ? (
                <div><dt>Bloqueada em</dt><dd>{formatDateTime(tenant.billing_blocked_at)}</dd></div>
              ) : null}
            </dl>
          </section>
          <section className="rc-panel">
            <h2>Contato financeiro</h2>
            <dl className="rc-dl">
              <div><dt>Responsável</dt><dd>{detail?.billingContact?.billing_contact_name || '—'}</dd></div>
              <div><dt>E-mail</dt><dd>{detail?.billingContact?.billing_contact_email || tenant.owner_email || '—'}</dd></div>
              <div><dt>Telefone</dt><dd>{detail?.billingContact?.billing_contact_phone || '—'}</dd></div>
            </dl>
          </section>
        </div>
      ) : null}

      {tab === 'financeiro' ? (
        <div className="rc-stack">
          <section className="rc-panel">
            <h2>Alterar plano</h2>
            <div className="rc-form-row">
              <select className="rc-input" value={planForm} onChange={(e) => setPlanForm(e.target.value)}>
                {PLAN_CATALOG.map((code) => (
                  <option key={code} value={code}>{getPlanLabel(code)}</option>
                ))}
              </select>
              <button type="button" className="rc-btn rc-btn--primary" disabled={saving === 'plan'} onClick={() => runAction('plan', () => updateSubscriptionPlanBilling(tenantId, planForm))}>
                Salvar plano
              </button>
            </div>
          </section>

          {openInvoice ? (
            <>
              <section className="rc-panel">
                <h2>Alterar vencimento</h2>
                <div className="rc-form-row">
                  <input type="date" className="rc-input" value={dueDateForm} onChange={(e) => setDueDateForm(e.target.value)} />
                  <button type="button" className="rc-btn rc-btn--ghost" disabled={saving === 'due'} onClick={() => runAction('due', () => updateInvoiceDueDate(tenantId, openInvoice.id, dueDateForm))}>
                    Atualizar vencimento
                  </button>
                </div>
              </section>

              <section className="rc-panel">
                <h2>Conceder desconto</h2>
                <div className="rc-form-grid">
                  <label>
                    Valor do desconto (R$)
                    <input className="rc-input" value={discountForm.amount} onChange={(e) => setDiscountForm((p) => ({ ...p, amount: e.target.value }))} />
                  </label>
                  <label>
                    Observação
                    <input className="rc-input" value={discountForm.notes} onChange={(e) => setDiscountForm((p) => ({ ...p, notes: e.target.value }))} />
                  </label>
                </div>
                <button
                  type="button"
                  className="rc-btn rc-btn--ghost"
                  disabled={saving === 'discount'}
                  onClick={() => {
                    const discountCents = parseAmountToCents(discountForm.amount);
                    if (discountCents == null) { setError('Informe um desconto válido.'); return; }
                    runAction('discount', () => applyInvoiceDiscount(tenantId, openInvoice.id, { discountCents, notes: discountForm.notes }));
                  }}
                >
                  Aplicar desconto
                </button>
              </section>

              <section className="rc-panel">
                <h2>Registrar pagamento manual</h2>
                <div className="rc-form-grid">
                  <label>Valor (R$)<input className="rc-input" value={paymentForm.amountCents} onChange={(e) => setPaymentForm((p) => ({ ...p, amountCents: e.target.value }))} /></label>
                  <label>Data<input className="rc-input" type="date" value={paymentForm.paidAt} onChange={(e) => setPaymentForm((p) => ({ ...p, paidAt: e.target.value }))} /></label>
                  <label>
                    Método
                    <select className="rc-input" value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm((p) => ({ ...p, paymentMethod: e.target.value }))}>
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Próximo vencimento
                    <select className="rc-input" value={paymentForm.nextDueRule} onChange={(e) => setPaymentForm((p) => ({ ...p, nextDueRule: e.target.value }))}>
                      <option value="from_payment">30 dias após pagamento</option>
                      <option value="from_previous_due">30 dias após vencimento anterior</option>
                    </select>
                  </label>
                  <label className="rc-form-grid__full">Observação<textarea className="rc-input" rows={2} value={paymentForm.notes} onChange={(e) => setPaymentForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                </div>
                <button
                  type="button"
                  className="rc-btn rc-btn--primary"
                  disabled={saving === 'pay'}
                  onClick={() => {
                    const amountCents = parseAmountToCents(paymentForm.amountCents);
                    if (!amountCents) { setError('Informe um valor válido.'); return; }
                    runAction('pay', () => markInvoicePaid(tenantId, openInvoice.id, { ...paymentForm, amountCents }));
                  }}
                >
                  Registrar pagamento
                </button>
              </section>
            </>
          ) : (
            <section className="rc-panel"><p className="rc-muted">Nenhuma fatura em aberto.</p></section>
          )}
        </div>
      ) : null}

      {tab === 'faturas' ? (
        <section className="rc-panel">
          <div className="rc-table-wrap">
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th>Pago em</th>
                  <th>Método</th>
                </tr>
              </thead>
              <tbody>
                {(detail?.invoices || []).map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.due_date}</td>
                    <td><FinancialStatusBadge status={inv.status === 'paid' ? 'active' : inv.status === 'overdue' ? 'overdue' : inv.status} /></td>
                    <td>{formatCurrency(inv.amount_cents)}</td>
                    <td>{inv.paid_at ? formatDateTime(inv.paid_at) : '—'}</td>
                    <td>{inv.payment_method || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'notificacoes' ? (
        <section className="rc-panel">
          {(detail?.alerts || []).length === 0 ? (
            <p className="rc-muted">Nenhum alerta pendente.</p>
          ) : (
            <ul className="rc-timeline">
              {(detail.alerts || []).map((alert) => (
                <li key={alert.id}>
                  <FinancialStatusBadge status={alert.alert_type} />
                  <strong>{alert.title}</strong>
                  <p>{alert.description}</p>
                  <small>{formatDateTime(alert.created_at)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'auditoria' ? (
        <div className="rc-detail-grid">
          <section className="rc-panel">
            <h2>Eventos de cobrança</h2>
            <ul className="rc-timeline">
              {(detail?.events || []).map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.event_type}</strong>
                  <p>{ev.message}</p>
                  <small>{formatDateTime(ev.created_at)}</small>
                </li>
              ))}
            </ul>
          </section>
          <section className="rc-panel">
            <h2>Auditoria da plataforma</h2>
            <ul className="rc-timeline">
              {(detail?.auditLogs || []).map((log) => (
                <li key={log.id}>
                  <strong>{log.action}</strong>
                  <p>{log.target_type} · {log.target_id}</p>
                  <small>{formatDateTime(log.created_at)}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
