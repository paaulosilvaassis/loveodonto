import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Shield, Activity, RotateCcw } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import {
  canManageContractsOperationalMode,
  emergencyRollbackOperationalUx,
  enableOperationalUxMode,
  fetchContractsOperationalRolloutFromServer,
  getContractsOperationalModeState,
  getContractsRolloutAlerts,
  getContractsRolloutMetricsSummary,
  getGoLiveCriteriaStatus,
  getRolloutAuditLog,
  isProductionActivationUnlocked,
  isProductionRuntime,
  setProductionGlobalEnabled,
  setV1OnlyMode,
  updateProductionTenantAllowlist,
  CONTRACTS_OPERATIONAL_MODES,
} from '../../services/contractsOperationalRolloutService.js';

export default function ContractsRolloutPage() {
  const { user } = useAuth();
  const canManage = canManageContractsOperationalMode(user);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState('—');
  const [toast, setToast] = useState(null);
  const [allowlistText, setAllowlistText] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  const state = useMemo(() => getContractsOperationalModeState(), [tick]);
  const metrics = useMemo(() => getContractsRolloutMetricsSummary(), [tick]);
  const alerts = useMemo(() => getContractsRolloutAlerts(), [tick]);
  const audit = useMemo(() => getRolloutAuditLog(), [tick]);
  const goLive = useMemo(() => getGoLiveCriteriaStatus(), [tick]);
  const prodRuntime = isProductionRuntime();
  const unlock = isProductionActivationUnlocked();

  const refresh = () => setTick((t) => t + 1);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadFromServer = useCallback(async () => {
    setLoading(true);
    try {
      const remote = await fetchContractsOperationalRolloutFromServer(user);
      setSource('feature_flags (servidor)');
      setAllowlistText((remote.productionTenantAllowlist || []).join('\n'));
      refresh();
    } catch (e) {
      setSource('cache local (servidor indisponível)');
      showToast(e.message || 'Falha ao ler rollout do servidor', 'error');
      refresh();
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!canManage) return undefined;
    loadFromServer();
    return undefined;
  }, [canManage, loadFromServer]);

  const runServerAction = async (fn, successMessage, type = 'success') => {
    setSaving(true);
    try {
      await fn();
      await loadFromServer();
      showToast(successMessage, type);
    } catch (e) {
      showToast(e.message || 'Erro ao salvar no servidor', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="ctr-page">
        <section className="ctr-section">
          <h2 className="ctr-section-title">Modo operacional</h2>
          <p>Acesso restrito a administradores.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="ctr-page" data-testid="contracts-rollout-panel">
      {toast ? <div className={`toast ${toast.type}`} role="status">{toast.message}</div> : null}

      <section className="ctr-section">
        <h2 className="ctr-section-title">
          <Shield size={18} aria-hidden /> Modo operacional — Contracts UX
        </h2>
        <p className="ctr-muted">
          SSOT no servidor (`feature_flags`). Cache local apenas. Não desliga o V1.
          Não ativa Contracts V2 técnico. Produção global permanece OFF até confirmação explícita.
        </p>
        <dl className="ctr-config-row" style={{ display: 'grid', gap: 8 }}>
          <div><strong>Fonte:</strong> {loading ? 'carregando…' : source}</div>
          <div><strong>Modo atual:</strong> {state.mode}</div>
          <div><strong>Tenant enabled:</strong> {state.tenantEnabled ? 'ON' : 'OFF'}</div>
          <div><strong>Fase de rollout:</strong> {state.rolloutPhase}</div>
          <div><strong>Produção global:</strong> {state.productionGlobalEnabled ? 'ON' : 'OFF'}</div>
          <div><strong>Allowlist (derivada):</strong> {(state.productionTenantAllowlist || []).join(', ') || '—'}</div>
          <div><strong>Runtime produção:</strong> {prodRuntime ? 'sim' : 'não'}</div>
          <div><strong>Unlock de ativação:</strong> {unlock ? 'sim' : 'não'}</div>
          {state.rollbackReason ? (
            <div><strong>Último rollback:</strong> {state.rollbackReason}</div>
          ) : null}
        </dl>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <button
            type="button"
            className="button primary"
            disabled={saving || loading}
            onClick={() => runServerAction(
              () => enableOperationalUxMode(user, 'Reativado pelo painel'),
              'Tenant habilitado no servidor (UX operacional). Global permanece conforme flag.',
            )}
          >
            Habilitar UX operacional
          </button>
          <button
            type="button"
            className="button"
            disabled={saving || loading}
            onClick={() => runServerAction(
              () => setV1OnlyMode(user, 'Modo V1_ONLY pelo painel'),
              'Modo V1_ONLY salvo no servidor.',
            )}
          >
            Forçar V1_ONLY
          </button>
          <button
            type="button"
            className="button"
            disabled={saving || loading}
            onClick={() => loadFromServer()}
          >
            Recarregar do servidor
          </button>
        </div>
      </section>

      <section className="ctr-section" data-testid="contracts-rollout-emergency">
        <h2 className="ctr-section-title">
          <RotateCcw size={18} aria-hidden /> Rollback imediato
        </h2>
        <p>
          Desliga a UX deste tenant no servidor, zera o kill switch global e registra auditoria.
          Contratos V1 existentes continuam legíveis.
        </p>
        <label className="ctr-config-row">
          <span className="ctr-config-label">Motivo</span>
          <input
            className="ctr-input"
            value={rollbackReason}
            onChange={(e) => setRollbackReason(e.target.value)}
            placeholder="Ex.: taxa de assinatura pública abaixo do limiar"
          />
        </label>
        <button
          type="button"
          className="button"
          style={{ borderColor: '#b45309', color: '#92400e' }}
          disabled={saving || loading}
          onClick={() => runServerAction(
            () => emergencyRollbackOperationalUx(user, rollbackReason),
            'Rollback emergencial aplicado no servidor.',
            'error',
          )}
        >
          Executar rollback imediato
        </button>
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">Ativação do tenant atual (produção)</h2>
        <p>
          Persistido como `contracts_operational_ux_enabled` no tenant da sessão.
          Não aceita outros tenants (sem wildcard / cross-tenant). Não liga produção global.
        </p>
        <textarea
          className="ctr-input"
          rows={3}
          value={allowlistText}
          onChange={(e) => setAllowlistText(e.target.value)}
          placeholder={user?.tenantId || user?.tenant_id || 'tenant-uuid-da-sessao'}
        />
        <button
          type="button"
          className="button"
          style={{ marginTop: 8 }}
          disabled={saving || loading}
          onClick={() => {
            const ids = (allowlistText || '')
              .split(/[\n,]/)
              .map((s) => s.trim())
              .filter(Boolean);
            return runServerAction(
              () => updateProductionTenantAllowlist(user, ids),
              'Tenant enabled atualizado no servidor.',
            );
          }}
        >
          Salvar ativação do tenant
        </button>
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">
          <AlertTriangle size={18} aria-hidden /> Ativação global de produção
        </h2>
        <p>
          Kill switch server-side (`contracts_operational_ux_global_enabled`). Default OFF.
          Exige env unlock + frase. Esta fase NÃO ativa produção automaticamente.
        </p>
        <label className="ctr-config-row">
          <span className="ctr-config-label">Frase de confirmação</span>
          <input
            className="ctr-input"
            value={confirmPhrase}
            onChange={(e) => setConfirmPhrase(e.target.value)}
            placeholder="ATIVAR_PRODUCAO_OPERATIONAL_UX"
            autoComplete="off"
          />
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button"
            disabled={saving || loading || (prodRuntime && !unlock)}
            onClick={() => runServerAction(
              () => setProductionGlobalEnabled(user, true, confirmPhrase),
              'Produção global ON no servidor (após unlock + confirmação).',
            )}
          >
            Ligar produção global
          </button>
          <button
            type="button"
            className="button"
            disabled={saving || loading}
            onClick={() => runServerAction(
              () => setProductionGlobalEnabled(user, false, ''),
              'Produção global OFF no servidor.',
            )}
          >
            Desligar produção global
          </button>
        </div>
      </section>

      <section className="ctr-section" data-testid="contracts-rollout-metrics">
        <h2 className="ctr-section-title">
          <Activity size={18} aria-hidden /> Métricas e alertas
        </h2>
        <ul>
          <li>Wizards abertos: {metrics.wizardOpened}</li>
          <li>Wizards concluídos: {metrics.wizardCompleted} ({metrics.wizardCompletionRate ?? '—'}%)</li>
          <li>Links de assinatura: {metrics.signatureLinksGenerated}</li>
          <li>
            Assinatura pública aberta/concluída/falha:
            {' '}
            {metrics.publicSignOpened}
            /
            {metrics.publicSignCompleted}
            /
            {metrics.publicSignFailed}
          </li>
          <li>Rollbacks: {metrics.rollbacks}</li>
        </ul>
        <ul>
          {alerts.map((a) => (
            <li key={`${a.level}-${a.message}`}>
              [
              {a.level}
              ]
              {' '}
              {a.message}
            </li>
          ))}
        </ul>
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">Critérios de go-live</h2>
        <p>
          Gate:
          {' '}
          <strong>{goLive.gate}</strong>
          {' '}
          (
          {goLive.score}
          /
          {goLive.total}
          )
        </p>
        {goLive.missing.length ? (
          <ul>
            {goLive.missing.map((m) => <li key={m}>Pendente: {m}</li>)}
          </ul>
        ) : (
          <p>Todos os critérios objetivos atendidos no checklist desta fase.</p>
        )}
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">Auditoria recente (servidor)</h2>
        {audit.length === 0 ? <p>Sem eventos.</p> : (
          <ul>
            {audit.slice().reverse().slice(0, 15).map((e, idx) => (
              <li key={e.id || `${e.at}-${idx}`}>
                {e.at}
                {' '}
                —
                {' '}
                {e.action}
                {e.reason ? ` (${e.reason})` : ''}
              </li>
            ))}
          </ul>
        )}
        {state.mode === CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK ? (
          <p role="alert">Sistema em ROLLED_BACK — use “Habilitar UX operacional” após investigação.</p>
        ) : null}
      </section>
    </div>
  );
}
