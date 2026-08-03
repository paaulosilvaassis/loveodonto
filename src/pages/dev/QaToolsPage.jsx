import { useCallback, useEffect, useMemo, useState } from 'react';
/** LEGACY_RC01: página QA Tools — remoção planejada RC-03. */
import Button from '../../components/Button.jsx';
import { useAuth } from '../../auth/useAuth.js';
import { isQaToolsRouteEnabled } from '../../config/qaToolsGuard.js';
import {
  clearRhQaToolsHistory,
  downloadRhQaReport,
  getRhQaToolsEnvironmentInfo,
  getRhQaToolsHistory,
  runRhHydrateIdbQa,
  runRhShadowQa,
  runRhUuidMirrorQa,
} from '../../services/rhQaToolsService.js';

function MetricCard({ label, value, tone = 'neutral' }) {
  const toneClass = tone === 'ok' ? 'on' : tone === 'warn' ? 'pending' : tone === 'bad' ? 'off' : 'pending';
  return (
    <div className="qa-tools-metric">
      <span className="qa-tools-metric__label">{label}</span>
      <span className={`access-badge ${toneClass} qa-tools-metric__value`}>{value}</span>
    </div>
  );
}

function EnvironmentPanel({ env }) {
  if (!env) return null;
  const modeClass = env.productionBlocked ? 'off' : env.mode === 'STAGING' ? 'pending' : 'on';
  return (
    <section className="qa-tools-panel">
      <h2 className="qa-tools-panel__title">Ambiente</h2>
      <div className="qa-tools-env-grid">
        <div>
          <span className="muted">Modo</span>
          <div><span className={`access-badge ${modeClass}`}>{env.mode}</span></div>
        </div>
        <div>
          <span className="muted">Projeto Supabase</span>
          <div><code>{env.supabaseProjectRef}</code></div>
        </div>
        <div>
          <span className="muted">Host</span>
          <div><code>{env.supabaseHost}</code></div>
        </div>
        <div>
          <span className="muted">Tenant</span>
          <div><code>{env.tenantId || '—'}</code></div>
        </div>
      </div>
      {env.productionBlocked ? (
        <p className="form-error" style={{ marginTop: '1rem' }}>
          Produção detectada — ferramentas QA bloqueadas.
        </p>
      ) : null}
    </section>
  );
}

function HydrateResult({ report }) {
  if (!report) return null;
  const ok = (report.errors?.length ?? 0) === 0 && (report.conflicts?.length ?? 0) === 0;
  return (
    <section className="qa-tools-panel">
      <h3 className="qa-tools-panel__title">RH Hydrate IDB from Supabase</h3>
      <div className="qa-tools-metrics">
        <MetricCard label="localCountBefore" value={report.localCountBefore ?? 0} />
        <MetricCard label="localCountAfter" value={report.localCountAfter ?? 0} tone={ok ? 'ok' : 'warn'} />
        <MetricCard label="remoteCount" value={report.remoteCount ?? 0} />
        <MetricCard label="inserted" value={report.inserted?.length ?? 0} tone={(report.inserted?.length ?? 0) > 0 ? 'ok' : 'neutral'} />
        <MetricCard label="updated" value={report.updated?.length ?? 0} />
        <MetricCard label="skipped" value={report.skipped?.length ?? 0} />
        <MetricCard label="conflicts" value={report.conflicts?.length ?? 0} tone={(report.conflicts?.length ?? 0) === 0 ? 'ok' : 'bad'} />
        <MetricCard label="errors" value={report.errors?.length ?? 0} tone={(report.errors?.length ?? 0) === 0 ? 'ok' : 'bad'} />
      </div>
      {(report.conflicts?.length ?? 0) > 0 && (
        <pre className="qa-tools-pre">{JSON.stringify(report.conflicts, null, 2)}</pre>
      )}
      {(report.errors?.length ?? 0) > 0 && (
        <pre className="qa-tools-pre">{JSON.stringify(report.errors, null, 2)}</pre>
      )}
    </section>
  );
}

function MirrorResult({ report }) {
  if (!report) return null;
  const ok = (report.errors?.length ?? 0) === 0 && (report.conflicts?.length ?? 0) === 0;
  return (
    <section className="qa-tools-panel">
      <h3 className="qa-tools-panel__title">RH UUID Mirror</h3>
      <div className="qa-tools-metrics">
        <MetricCard label="updated" value={report.updated?.length ?? 0} tone={ok ? 'ok' : 'warn'} />
        <MetricCard label="skipped" value={report.skipped?.length ?? 0} />
        <MetricCard label="conflicts" value={report.conflicts?.length ?? 0} tone={(report.conflicts?.length ?? 0) === 0 ? 'ok' : 'bad'} />
        <MetricCard label="errors" value={report.errors?.length ?? 0} tone={(report.errors?.length ?? 0) === 0 ? 'ok' : 'bad'} />
      </div>
      {(report.conflicts?.length ?? 0) > 0 && (
        <pre className="qa-tools-pre">{JSON.stringify(report.conflicts, null, 2)}</pre>
      )}
      {(report.errors?.length ?? 0) > 0 && (
        <pre className="qa-tools-pre">{JSON.stringify(report.errors, null, 2)}</pre>
      )}
    </section>
  );
}

function ShadowResult({ report }) {
  if (!report) return null;
  const blocking = report.blockingDiffCount ?? 0;
  const transitional = report.transitionalDiffCount ?? 0;
  return (
    <section className="qa-tools-panel">
      <h3 className="qa-tools-panel__title">RH Shadow QA</h3>
      {report.error ? (
        <p className="form-error">{report.error}</p>
      ) : (
        <>
          <div className="qa-tools-metrics">
            <MetricCard label="localCount" value={report.localCount ?? 0} />
            <MetricCard label="remoteCount" value={report.remoteCount ?? 0} />
            <MetricCard label="matchPercent" value={`${report.matchPercent ?? 0}%`} />
            <MetricCard label="blockingDiffCount" value={blocking} tone={blocking === 0 ? 'ok' : 'bad'} />
            <MetricCard label="transitionalDiffCount" value={transitional} tone={transitional === 0 ? 'ok' : 'warn'} />
            <MetricCard label="informationalDiffCount" value={report.informationalDiffCount ?? 0} />
            <MetricCard
              label="canPromoteReadPrimary"
              value={report.canPromoteReadPrimary ? 'true' : 'false'}
              tone={report.canPromoteReadPrimary ? 'ok' : 'bad'}
            />
          </div>
          {(report.promotionBlockers?.length ?? 0) > 0 && (
            <pre className="qa-tools-pre">{JSON.stringify(report.promotionBlockers, null, 2)}</pre>
          )}
        </>
      )}
    </section>
  );
}

function HistoryPanel({ history, onClear }) {
  if (!history?.length) {
    return (
      <section className="qa-tools-panel">
        <h3 className="qa-tools-panel__title">Histórico</h3>
        <p className="muted">Nenhuma execução registrada neste navegador.</p>
      </section>
    );
  }

  return (
    <section className="qa-tools-panel">
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="qa-tools-panel__title" style={{ margin: 0 }}>Histórico</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>Limpar</Button>
      </div>
      <div className="table-wrapper" style={{ marginTop: '1rem' }}>
        <table className="access-list-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Tipo</th>
              <th>Tenant</th>
              <th>Resumo</th>
              <th>OK</th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.at).toLocaleString('pt-BR')}</td>
                <td>{item.type}</td>
                <td><code>{item.tenantId?.slice(0, 8)}…</code></td>
                <td><code>{JSON.stringify(item.summary)}</code></td>
                <td><span className={`access-badge ${item.ok ? 'on' : 'off'}`}>{item.ok ? 'sim' : 'não'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function QaToolsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId || '';
  const [env, setEnv] = useState(null);
  const [history, setHistory] = useState([]);
  const [hydrateReport, setHydrateReport] = useState(null);
  const [mirrorReport, setMirrorReport] = useState(null);
  const [shadowReport, setShadowReport] = useState(null);
  const [lastExport, setLastExport] = useState(null);
  const [loading, setLoading] = useState({ hydrate: false, mirror: false, shadow: false });
  const [toast, setToast] = useState(null);

  const allowed = useMemo(() => isQaToolsRouteEnabled(), []);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const refreshMeta = useCallback(() => {
    if (!allowed) return;
    setEnv(getRhQaToolsEnvironmentInfo(tenantId));
    setHistory(getRhQaToolsHistory());
  }, [allowed, tenantId]);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  if (!allowed) {
    return (
      <div className="qa-tools-page">
        <div className="dev-db-card">
          <h2>Ferramentas QA indisponíveis</h2>
          <p className="muted">Esta tela existe apenas em DEV ou ambiente staging (Supabase não produção).</p>
        </div>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="qa-tools-page">
        <div className="dev-db-card">
          <h2>Sem tenant ativo</h2>
          <p className="muted">Faça login em uma clínica staging para usar as ferramentas QA.</p>
        </div>
      </div>
    );
  }

  const handleHydrate = async () => {
    setLoading((s) => ({ ...s, hydrate: true }));
    try {
      const report = await runRhHydrateIdbQa(tenantId);
      setHydrateReport(report);
      setLastExport(report);
      refreshMeta();
      showToast('Hidratação IDB concluída.');
    } catch (err) {
      showToast(err?.message || 'Falha na hidratação IDB.', 'error');
    } finally {
      setLoading((s) => ({ ...s, hydrate: false }));
    }
  };

  const handleMirror = async () => {
    setLoading((s) => ({ ...s, mirror: true }));
    try {
      const report = await runRhUuidMirrorQa(tenantId);
      setMirrorReport(report);
      setLastExport(report);
      refreshMeta();
      showToast('UUID Mirror concluído.');
    } catch (err) {
      showToast(err?.message || 'Falha no UUID Mirror.', 'error');
    } finally {
      setLoading((s) => ({ ...s, mirror: false }));
    }
  };

  const handleShadow = async () => {
    setLoading((s) => ({ ...s, shadow: true }));
    try {
      const report = await runRhShadowQa(tenantId);
      setShadowReport(report);
      setLastExport(report);
      refreshMeta();
      showToast('Shadow QA concluído.');
    } catch (err) {
      showToast(err?.message || 'Falha no Shadow QA.', 'error');
    } finally {
      setLoading((s) => ({ ...s, shadow: false }));
    }
  };

  const isBusy = loading.hydrate || loading.mirror || loading.shadow;

  const handleExport = () => {
    if (!lastExport) {
      showToast('Execute Mirror ou Shadow QA antes de exportar.', 'error');
      return;
    }
    const filename = downloadRhQaReport(lastExport);
    showToast(`Relatório baixado: ${filename}`);
  };

  const handleClearHistory = () => {
    clearRhQaToolsHistory();
    refreshMeta();
    showToast('Histórico limpo.');
  };

  return (
    <div className="qa-tools-page stack">
      <header className="qa-tools-header">
        <div>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>Developer Tools</p>
          <h1 style={{ margin: '0.25rem 0 0' }}>QA Tools — RH</h1>
          <p className="muted" style={{ margin: '0.5rem 0 0', maxWidth: '42rem' }}>
            Ferramentas internas RC-01. Hidratação IDB, espelhamento UUID e Shadow Read QA.
            Leitura Supabase autenticada; escrita somente no IndexedDB local.
          </p>
        </div>
      </header>

      <EnvironmentPanel env={env} />

      <section className="qa-tools-panel">
        <h2 className="qa-tools-panel__title">Ações</h2>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
          <Button
            type="button"
            variant="primary"
            loading={loading.hydrate}
            disabled={isBusy && !loading.hydrate}
            onClick={handleHydrate}
          >
            RH Hydrate IDB from Supabase
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={loading.mirror}
            disabled={isBusy && !loading.mirror}
            onClick={handleMirror}
          >
            RH UUID Mirror
          </Button>
          <Button
            type="button"
            variant="secondary"
            loading={loading.shadow}
            disabled={isBusy && !loading.shadow}
            onClick={handleShadow}
          >
            RH Shadow QA
          </Button>
          <Button type="button" variant="ghost" onClick={handleExport} disabled={!lastExport}>
            Exportar relatório JSON
          </Button>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
          Sequência recomendada: Hydrate → UUID Mirror → Shadow QA.
        </p>
      </section>

      <HydrateResult report={hydrateReport} />
      <MirrorResult report={mirrorReport} />
      <ShadowResult report={shadowReport} />
      <HistoryPanel history={history} onClear={handleClearHistory} />

      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}
    </div>
  );
}
