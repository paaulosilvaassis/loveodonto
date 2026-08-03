/**
 * Área técnica de instâncias contratuais v2 — Phase 10.5.
 * Somente fixtures. Rota montada apenas com flags ON.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/useAuth.js';
import {
  getContractsV2Service,
  mapContractsV2Error,
} from '../../services/contractsV2Service.js';
import {
  createDemoGenerationContext,
  createDemoPublishedTemplate,
  DEMO_TENANT_ID,
  demoPatient,
} from '../../domain/contracts/fixtures/contract-v2.fixtures.ts';

const ALL_PERMS = [
  'contracts:view',
  'contracts:create',
  'contracts:update_draft',
  'contracts:review',
  'contracts:approve',
  'contracts:cancel',
  'contracts:view_audit',
];

export default function ContractsInstanciasV2Page() {
  const { user } = useAuth();
  const service = useMemo(() => getContractsV2Service(), []);
  const tenantId = user?.tenantId || user?.activeTenantId || DEMO_TENANT_ID;

  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [hash, setHash] = useState('');
  const [readiness, setReadiness] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const actor = useMemo(() => ({
    userId: user?.id || 'tech_user',
    displayName: user?.name || 'Técnico',
    permissions: user?.permissions?.length ? user.permissions : ALL_PERMS,
  }), [user]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = useCallback((err) => {
    const mapped = mapContractsV2Error(err);
    setError(mapped.message);
    showToast(mapped.message, 'error');
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await service.listContracts(tenantId, {}, actor);
      setItems(result.items || []);
    } catch (err) {
      handleError(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [service, tenantId, actor, handleError]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createDemo = async () => {
    setLoading(true);
    try {
      const { template, version } = createDemoPublishedTemplate(tenantId);
      const created = await service.createDraft(tenantId, {
        documentType: 'SERVICE_CONTRACT',
        title: 'Contrato Demo Ortodontia',
        patientId: demoPatient.patientId,
        budgetId: 'budget_demo_001',
        templateId: template.id,
        templateVersionId: version.id,
        origin: 'MANUAL',
        requirements: template.requirements,
      }, actor);
      showToast(`Draft criado: ${created.contract.contractNumber}`);
      setTimeline((t) => [...t, { at: new Date().toISOString(), text: 'Draft criado (fixture)' }]);
      await refresh();
      await openDetails(created.contract.id);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const openDetails = async (contractId) => {
    setLoading(true);
    try {
      const details = await service.getContract(tenantId, contractId, actor);
      setSelected(details);
      setPreviewHtml(details?.currentVersion?.renderedHtmlSnapshot || '');
      setHash(details?.currentVersion?.documentHash || '');
      setReadiness(null);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const generateVersion = async () => {
    if (!selected?.contract) return;
    setLoading(true);
    try {
      const ctx = createDemoGenerationContext(selected.contract, {
        actor,
        generatedAt: new Date().toISOString(),
      });
      // Garante template lookup injetado no service de teste
      const result = await service.createVersion(tenantId, selected.contract.id, {
        context: ctx,
        idempotencyKey: `gen-${selected.contract.id}-v${(selected.versions?.length || 0) + 1}`,
      }, actor);
      setPreviewHtml(result.version.renderedHtmlSnapshot || '');
      setHash(result.version.documentHash || '');
      setTimeline((t) => [...t, {
        at: new Date().toISOString(),
        text: `Versão ${result.version.versionNumber} gerada · hash ${String(result.version.documentHash || '').slice(0, 12)}…`,
      }]);
      showToast('Versão gerada com fixtures.');
      await openDetails(selected.contract.id);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const lockCurrent = async () => {
    if (!selected?.contract || !selected.currentVersion) return;
    try {
      await service.lockVersion(
        tenantId,
        selected.contract.id,
        selected.currentVersion.id,
        actor,
      );
      setTimeline((t) => [...t, { at: new Date().toISOString(), text: 'Versão bloqueada' }]);
      showToast('Versão bloqueada.');
      await openDetails(selected.contract.id);
    } catch (err) {
      handleError(err);
    }
  };

  const checkReadiness = async (target) => {
    if (!selected?.contract) return;
    try {
      const result = await service.validateReadiness(
        tenantId,
        selected.contract.id,
        target,
        actor,
      );
      setReadiness(result);
    } catch (err) {
      handleError(err);
    }
  };

  const transition = async (toStatus) => {
    if (!selected?.contract) return;
    try {
      await service.transitionStatus(tenantId, selected.contract.id, { toStatus }, actor);
      setTimeline((t) => [...t, { at: new Date().toISOString(), text: `Status → ${toStatus}` }]);
      showToast(`Transicionado para ${toStatus}.`);
      await openDetails(selected.contract.id);
      await refresh();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="ctr-page space-y-4" data-testid="contracts-instancias-v2-page">
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}

      <header className="ctr-section">
        <h2 className="ctr-section-title">Instâncias v2 (técnico)</h2>
        <p className="ctr-hint">
          Área isolada com fixtures. Sem paciente/orçamento/PDF/assinatura reais.
          Flags controlam o acesso.
        </p>
      </header>

      {error && (
        <div className="ctr-section" role="alert" data-testid="contracts-instancias-v2-error">
          <p style={{ color: '#b91c1c' }}>{error}</p>
        </div>
      )}

      <section className="ctr-section space-y-3">
        <div className="ctr-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="button" onClick={createDemo} disabled={loading}>
            Criar contrato demo
          </button>
          <button type="button" className="button secondary" onClick={refresh} disabled={loading}>
            Atualizar lista
          </button>
        </div>

        {loading && <p className="ctr-hint">Carregando…</p>}
        {!loading && items.length === 0 && !error && (
          <p className="ctr-hint" data-testid="contracts-instancias-v2-empty">Nenhum contrato v2.</p>
        )}

        <ul className="ctr-template-list" aria-label="Contratos v2">
          {items.map((item) => (
            <li key={item.id} className="ctr-template-item">
              <div>
                <strong>{item.contractNumber}</strong>
                <span className="ctr-template-meta">
                  {item.title} · {item.status} · paciente fixture
                </span>
              </div>
              <button type="button" className="button small" onClick={() => openDetails(item.id)}>
                Abrir
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="ctr-section space-y-3" data-testid="contracts-instancias-v2-detail">
          <h3 className="ctr-section-title" style={{ fontSize: '1.1rem' }}>
            {selected.contract.contractNumber} — {selected.contract.status}
          </h3>
          <div className="ctr-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="button" onClick={generateVersion}>Gerar versão (fixture)</button>
            <button type="button" className="button secondary" onClick={lockCurrent}>Bloquear versão</button>
            <button type="button" className="button secondary" onClick={() => checkReadiness('READY_FOR_REVIEW')}>Readiness review</button>
            <button type="button" className="button secondary" onClick={() => checkReadiness('PENDING_INTERNAL_APPROVAL')}>Readiness approval</button>
            <button type="button" className="button secondary" onClick={() => transition('READY_FOR_REVIEW')}>→ READY_FOR_REVIEW</button>
            <button type="button" className="button secondary" onClick={() => transition('PENDING_INTERNAL_APPROVAL')}>→ PENDING_INTERNAL_APPROVAL</button>
            <button type="button" className="button secondary" onClick={() => transition('APPROVED')}>→ APPROVED</button>
          </div>

          {hash && (
            <p className="ctr-hint" data-testid="contracts-instancias-v2-hash">
              Hash: <code>{hash}</code>
            </p>
          )}

          {readiness && (
            <div data-testid="contracts-instancias-v2-readiness">
              <p>
                <strong>Readiness {readiness.targetStatus}:</strong>
                {' '}
                {readiness.valid ? 'OK' : 'Bloqueado'}
              </p>
              <ul>
                {readiness.errors.map((e) => (
                  <li key={`${e.code}-${e.message}`} style={{ color: '#b91c1c' }}>{e.message}</li>
                ))}
                {readiness.warnings.map((w) => (
                  <li key={`${w.code}-${w.message}`}>{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4>Preview (sanitizado)</h4>
            <div
              data-testid="contracts-instancias-v2-preview"
              style={{ border: '1px solid #e4e4e7', padding: '1rem', minHeight: 200 }}
              dangerouslySetInnerHTML={{ __html: previewHtml || '<p class="ctr-hint">Sem conteúdo gerado.</p>' }}
            />
          </div>

          <div>
            <h4>Snapshots (mascarados)</h4>
            <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: 180 }}>
              {JSON.stringify({
                patient: selected.currentVersion?.patientSnapshot || demoPatient,
                clinic: selected.currentVersion?.clinicSnapshot,
                budgetNumber: selected.currentVersion?.budgetSnapshot?.budgetNumber,
              }, null, 2)}
            </pre>
          </div>

          <div>
            <h4>Timeline (memória)</h4>
            <ul>
              {timeline.map((entry) => (
                <li key={`${entry.at}-${entry.text}`}>{entry.at} — {entry.text}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
