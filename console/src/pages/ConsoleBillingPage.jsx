import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, TrendingUp } from 'lucide-react';
import {
  evaluateBillingStatus,
  getBillingOverview,
} from '../services/platformConsoleService.js';
import RevenueKpiGrid from '../components/billing/RevenueKpiGrid.jsx';
import RevenueFunnel from '../components/billing/RevenueFunnel.jsx';
import RevenueCharts from '../components/billing/RevenueCharts.jsx';
import RevenueClinicsTable from '../components/billing/RevenueClinicsTable.jsx';

export default function ConsoleBillingPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [search, setSearch] = useState('');

  const loadOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getBillingOverview();
      setOverview(data);
      return data;
    } catch (e) {
      setError(e?.message || 'Erro ao carregar Revenue Center.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleEvaluate = async () => {
    try {
      setEvaluating(true);
      setError('');
      setSuccess('');
      const result = await evaluateBillingStatus();
      const data = await loadOverview();
      const summary = result?.summary || {};
      const parts = [
        `${summary.evaluated ?? 0} fatura(s)`,
        `${summary.updated ?? 0} atualizada(s)`,
        `${summary.alertsCreated ?? 0} alerta(s)`,
      ];
      if (data?.backfill?.backfilled > 0) parts.push(`${data.backfill.backfilled} clínica(s) provisionada(s)`);
      setSuccess(`Sincronização concluída: ${parts.join(' · ')}.`);
      if (!data) setSuccess('');
    } catch (e) {
      setSuccess('');
      setError(e?.message || 'Falha ao sincronizar cobranças.');
    } finally {
      setEvaluating(false);
    }
  };

  return (
    <div className="rc-page">
      <header className="rc-hero">
        <div className="rc-hero__content">
          <div className="rc-hero__eyebrow">
            <TrendingUp size={16} />
            <span>Revenue Center</span>
          </div>
          <h1>Gestão financeira SaaS</h1>
          <p>
            Painel executivo de receita recorrente, inadimplência e ciclo de vida das clínicas —
            padrão Stripe Billing / Asaas Manager.
          </p>
        </div>
        <div className="rc-hero__actions">
          <button type="button" className="rc-btn rc-btn--primary" onClick={handleEvaluate} disabled={evaluating}>
            <RefreshCw size={15} className={evaluating ? 'rc-spin' : ''} />
            {evaluating ? 'Sincronizando…' : 'Sincronizar status'}
          </button>
        </div>
      </header>

      {error ? <p className="pc-error">{error}</p> : null}
      {success ? <p className="pc-success">{success}</p> : null}
      {!loading && overview?.dataWarning ? <p className="pc-error">{overview.dataWarning}</p> : null}

      {loading ? (
        <div className="rc-loading">
          <RefreshCw size={20} className="rc-spin" />
          <span>Carregando métricas…</span>
        </div>
      ) : (
        <>
          <RevenueKpiGrid metrics={overview?.metrics} />
          <RevenueFunnel funnel={overview?.funnel} />
          <RevenueCharts charts={overview?.charts} />

          <section className="rc-panel">
            <header className="rc-panel__header">
              <div>
                <h2>Carteira de clínicas</h2>
                <p>{overview?.clinics?.length || 0} clínicas · visão operacional completa</p>
              </div>
              <div className="rc-search">
                <Search size={16} />
                <input
                  type="search"
                  placeholder="Buscar clínica, responsável ou plano…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </header>
            <RevenueClinicsTable clinics={overview?.clinics} search={search} />
          </section>
        </>
      )}
    </div>
  );
}
