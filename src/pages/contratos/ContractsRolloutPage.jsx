import { useMemo, useState } from 'react';
import { AlertTriangle, Shield, Activity, RotateCcw } from 'lucide-react';
import { useAuth } from '../../auth/useAuth.js';
import {
  canManageContractsOperationalMode,
  emergencyRollbackOperationalUx,
  enableOperationalUxMode,
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
  const [toast, setToast] = useState(null);
  const [allowlistText, setAllowlistText] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  const state = useMemo(() => {
    const s = getContractsOperationalModeState();
    return s;
  }, [tick]);

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
          Painel interno de rollout gradual. Não desliga o V1. Não ativa Contracts V2 técnico.
          Produção global permanece OFF até ativação humana explícita.
        </p>
        <dl className="ctr-config-row" style={{ display: 'grid', gap: 8 }}>
          <div><strong>Modo atual:</strong> {state.mode}</div>
          <div><strong>Fase de rollout:</strong> {state.rolloutPhase}</div>
          <div><strong>Produção global:</strong> {state.productionGlobalEnabled ? 'ON' : 'OFF'}</div>
          <div><strong>Allowlist (tenants):</strong> {(state.productionTenantAllowlist || []).join(', ') || '—'}</div>
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
            onClick={() => {
              try {
                enableOperationalUxMode(user, 'Reativado pelo painel');
                refresh();
                showToast('UX operacional habilitada (neste ambiente / conforme regras).');
              } catch (e) {
                showToast(e.message || 'Erro', 'error');
              }
            }}
          >
            Habilitar UX operacional
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              try {
                setV1OnlyMode(user, 'Modo V1_ONLY pelo painel');
                refresh();
                showToast('Modo V1_ONLY ativo. Wizard do hub desligado.');
              } catch (e) {
                showToast(e.message || 'Erro', 'error');
              }
            }}
          >
            Forçar V1_ONLY
          </button>
        </div>
      </section>

      <section className="ctr-section" data-testid="contracts-rollout-emergency">
        <h2 className="ctr-section-title">
          <RotateCcw size={18} aria-hidden /> Rollback imediato
        </h2>
        <p>Desliga a UX operacional, zera produção global e registra auditoria. Contratos V1 existentes continuam legíveis.</p>
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
          onClick={() => {
            try {
              emergencyRollbackOperationalUx(user, rollbackReason);
              refresh();
              showToast('Rollback emergencial aplicado.', 'error');
            } catch (e) {
              showToast(e.message || 'Erro no rollback', 'error');
            }
          }}
        >
          Executar rollback imediato
        </button>
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">Allowlist tenant-by-tenant (produção)</h2>
        <p>
          Incluir um tenant por linha. Não liga produção global automaticamente.
          Em produção, UX só ativa se global ON + tenant na lista.
        </p>
        <textarea
          className="ctr-input"
          rows={4}
          value={allowlistText || (state.productionTenantAllowlist || []).join('\n')}
          onChange={(e) => setAllowlistText(e.target.value)}
          placeholder="tenant-uuid-1&#10;tenant-uuid-2"
        />
        <button
          type="button"
          className="button"
          style={{ marginTop: 8 }}
          onClick={() => {
            try {
              const ids = (allowlistText || (state.productionTenantAllowlist || []).join('\n'))
                .split(/[\n,]/)
                .map((s) => s.trim())
                .filter(Boolean);
              updateProductionTenantAllowlist(user, ids);
              refresh();
              showToast(`Allowlist atualizada (${ids.length} tenant(s)).`);
            } catch (e) {
              showToast(e.message || 'Erro', 'error');
            }
          }}
        >
          Salvar allowlist
        </button>
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">
          <AlertTriangle size={18} aria-hidden /> Ativação global de produção
        </h2>
        <p>
          Bloqueada por default. Exige env unlock + frase de confirmação.
          Esta fase NÃO ativa produção automaticamente.
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
            disabled={prodRuntime && !unlock}
            onClick={() => {
              try {
                setProductionGlobalEnabled(user, true, confirmPhrase);
                refresh();
                showToast('Produção global ON (somente após unlock + confirmação).');
              } catch (e) {
                showToast(e.message || 'Bloqueado', 'error');
              }
            }}
          >
            Ligar produção global
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              try {
                setProductionGlobalEnabled(user, false, '');
                refresh();
                showToast('Produção global OFF.');
              } catch (e) {
                showToast(e.message || 'Erro', 'error');
              }
            }}
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
          <li>Assinatura pública aberta/concluída/falha: {metrics.publicSignOpened}/{metrics.publicSignCompleted}/{metrics.publicSignFailed}</li>
          <li>Rollbacks: {metrics.rollbacks}</li>
        </ul>
        <ul>
          {alerts.map((a) => (
            <li key={`${a.level}-${a.message}`}>[{a.level}] {a.message}</li>
          ))}
        </ul>
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">Critérios de go-live</h2>
        <p>
          Gate: <strong>{goLive.gate}</strong> ({goLive.score}/{goLive.total})
        </p>
        {goLive.missing.length ? (
          <ul>
            {goLive.missing.map((m) => <li key={m}>Pendente: {m}</li>)}
          </ul>
        ) : (
          <p>Todos os critérios objetivos atendidos no checklist desta fase.</p>
        )}
        <p className="ctr-muted">
          Docs: TRAINING_10_MIN.md · LEGAL_CHECKLIST.md · EMERGENCY_ROLLBACK.md · PHASE_10_20_PRODUCTION_READINESS.md
        </p>
      </section>

      <section className="ctr-section">
        <h2 className="ctr-section-title">Auditoria recente</h2>
        {audit.length === 0 ? <p>Sem eventos.</p> : (
          <ul>
            {audit.slice().reverse().slice(0, 15).map((e) => (
              <li key={e.id}>
                {e.at} — {e.action}
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
