/**
 * Área técnica de conclusão SIGNED / ledger v2 — Phase 10.8.
 * Somente fixtures + memory. Nenhum efeito externo executado.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getContractSigningCompletionV2Harness,
  mapContractSigningCompletionV2Error,
  setContractSigningCompletionV2HarnessForTests,
} from '../../services/contractSigningCompletionV2Service.js';
import { createSigningCompletionHarness } from '../../domain/contracts/completion/signing-completion.harness.ts';

export default function ContractsConclusaoV2Page() {
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [ready, setReady] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const [validation, setValidation] = useState(null);
  const [result, setResult] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [chain, setChain] = useState(null);
  const [effects, setEffects] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [lifecycle, setLifecycle] = useState([]);
  const [idempotencyKey, setIdempotencyKey] = useState('demo-complete-1');

  const push = (text) => setLifecycle((prev) => [...prev, { at: new Date().toISOString(), text }]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = useCallback((err) => {
    const mapped = mapContractSigningCompletionV2Error(err);
    setError(mapped.message);
    showToast(mapped.message, 'error');
  }, []);

  const ensure = useCallback(async () => {
    let h = getContractSigningCompletionV2Harness();
    if (!h) {
      h = await createSigningCompletionHarness();
      setContractSigningCompletionV2HarnessForTests(h);
    }
    setReady(true);
    return h;
  }, []);

  useEffect(() => {
    ensure().then(() => push('Harness conclusão v2 inicializado (fixtures/memory).')).catch(handleError);
  }, [ensure, handleError]);

  const prepare = async () => {
    try {
      const h = await ensure();
      const prep = await h.prepareSignedArtifacts();
      setPrepared(prep);
      push('Envelope COMPLETED + artefatos signed preparados (demo)');
      showToast('Artefatos preparados');
    } catch (err) {
      handleError(err);
    }
  };

  const buildInput = (h, prep) => ({
    contractId: h.contract.id,
    contractVersionId: h.version.id,
    envelopeId: prep.envelope.id,
    signedPdfFileId: prep.signedPdf.id,
    evidenceReportFileId: prep.evidenceReport.id,
    integrityManifestFileId: prep.integrityManifest.id,
    idempotencyKey,
  });

  const runValidate = async () => {
    try {
      const h = await ensure();
      if (!prepared) throw new Error('Prepare artefatos primeiro.');
      const v = await h.completion.validateCompletion(h.tenantId, buildInput(h, prepared));
      setValidation(v);
      push(`Validação final: ${v.valid ? 'OK' : 'FALHOU'} (${v.errors?.length || 0} erros)`);
    } catch (err) {
      handleError(err);
    }
  };

  const runComplete = async () => {
    try {
      const h = await ensure();
      if (!prepared) throw new Error('Prepare artefatos primeiro.');
      const r = await h.completion.completeSigning(
        h.tenantId,
        buildInput(h, prepared),
        h.actor,
      );
      setResult(r);
      setEffects(r.effects);
      setLedger(r.ledgerEntries || []);
      push(`Conclusão: status=${r.contract.status} replay=${r.idempotentReplay}`);
      showToast(r.idempotentReplay ? 'Replay idempotente' : 'Contrato SIGNED (demo)');
    } catch (err) {
      handleError(err);
    }
  };

  const runReplay = async () => {
    await runComplete();
  };

  const runVerifyChain = async () => {
    try {
      const h = await ensure();
      const v = await h.ledger.verifyChain(h.tenantId, h.contract.id);
      setChain(v);
      const entries = await h.ledger.listByContract(h.tenantId, h.contract.id);
      setLedger(entries);
      push(`Chain verify: valid=${v.valid} entries=${v.entryCount}`);
    } catch (err) {
      handleError(err);
    }
  };

  const runReconcile = async () => {
    try {
      const h = await ensure();
      const r = await h.reconciliation.inspect(h.tenantId, h.contract.id);
      setReconciliation(r);
      push(`Reconciliação: inconsistências=${r.inconsistencies.length}`);
    } catch (err) {
      handleError(err);
    }
  };

  const simulateRollback = async () => {
    try {
      const failing = await createSigningCompletionHarness({ failAfterLedgerAppends: 1 });
      const prep = await failing.prepareSignedArtifacts();
      try {
        await failing.completion.completeSigning(
          failing.tenantId,
          {
            contractId: failing.contract.id,
            contractVersionId: failing.version.id,
            envelopeId: prep.envelope.id,
            signedPdfFileId: prep.signedPdf.id,
            evidenceReportFileId: prep.evidenceReport.id,
            integrityManifestFileId: prep.integrityManifest.id,
            idempotencyKey: 'demo-fail-rollback',
          },
          failing.actor,
        );
        push('Rollback sim: inesperado sucesso');
      } catch {
        const c = await failing.contractRepo.findById(failing.tenantId, failing.contract.id);
        const entries = await failing.ledger.listByContract(failing.tenantId, failing.contract.id);
        push(`Rollback OK: status=${c.status} ledger=${entries.length}`);
        showToast('Rollback simulado OK', 'success');
      }
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="ctr-page space-y-4" data-testid="contracts-conclusao-v2-page">
      <header>
        <h2>Conclusão SIGNED v2 (técnico)</h2>
        <p className="ctr-hint">
          Fixtures apenas. Ledger em memória. Efeitos preparados com executed=false.
          Sem financeiro, prontuário, CRM, entrega ou event bus.
        </p>
      </header>

      {error ? (
        <div className="ctr-section" role="alert" data-testid="contracts-conclusao-v2-error">
          {error}
        </div>
      ) : null}
      {toast ? (
        <div className={`ctr-toast ctr-toast-${toast.type}`} data-testid="contracts-conclusao-v2-toast">
          {toast.message}
        </div>
      ) : null}

      <section className="ctr-section flex flex-wrap gap-2 items-center">
        <label className="text-sm">
          Idempotency key
          <input
            className="ctr-input ml-2"
            value={idempotencyKey}
            onChange={(e) => setIdempotencyKey(e.target.value)}
            data-testid="conclusao-v2-idempotency"
          />
        </label>
        <button type="button" className="ctr-btn" onClick={prepare} disabled={!ready} data-testid="conclusao-v2-prepare">
          Preparar fixture aprovada
        </button>
        <button type="button" className="ctr-btn" onClick={runValidate} disabled={!ready || !prepared} data-testid="conclusao-v2-validate">
          Validar conclusão
        </button>
        <button type="button" className="ctr-btn" onClick={runComplete} disabled={!ready || !prepared} data-testid="conclusao-v2-complete">
          Concluir assinatura
        </button>
        <button type="button" className="ctr-btn" onClick={runReplay} disabled={!ready || !prepared} data-testid="conclusao-v2-replay">
          Replay idempotente
        </button>
        <button type="button" className="ctr-btn" onClick={runVerifyChain} disabled={!ready} data-testid="conclusao-v2-chain">
          Verificar cadeia
        </button>
        <button type="button" className="ctr-btn" onClick={runReconcile} disabled={!ready} data-testid="conclusao-v2-reconcile">
          Reconciliar
        </button>
        <button type="button" className="ctr-btn" onClick={simulateRollback} disabled={!ready} data-testid="conclusao-v2-rollback">
          Simular rollback
        </button>
      </section>

      {prepared ? (
        <section className="ctr-section" data-testid="conclusao-v2-prepared">
          <h3>Fixture preparada</h3>
          <p>
            Envelope {prepared.envelope.status} · PDF {prepared.signedPdf.status}
            · Evidence {prepared.evidenceReport.status}
            · Manifest {prepared.integrityManifest.status}
          </p>
        </section>
      ) : null}

      {validation ? (
        <section className="ctr-section" data-testid="conclusao-v2-validation">
          <h3>Validação</h3>
          <pre className="text-xs overflow-auto">{JSON.stringify({
            valid: validation.valid,
            contractReady: validation.contractReady,
            versionReady: validation.versionReady,
            envelopeReady: validation.envelopeReady,
            evidenceReady: validation.evidenceReady,
            signedPdfReady: validation.signedPdfReady,
            manifestReady: validation.manifestReady,
            ledgerReady: validation.ledgerReady,
            errors: validation.errors?.map((e) => e.code),
          }, null, 2)}</pre>
        </section>
      ) : null}

      {result ? (
        <section className="ctr-section" data-testid="conclusao-v2-result">
          <h3>Resultado</h3>
          <pre className="text-xs overflow-auto">{JSON.stringify({
            status: result.contract?.status,
            completedAt: result.completedAt,
            idempotentReplay: result.idempotentReplay,
            events: result.events?.map((e) => e.eventType),
            domainEventBusNotified: false,
          }, null, 2)}</pre>
        </section>
      ) : null}

      {effects ? (
        <section className="ctr-section" data-testid="conclusao-v2-effects">
          <h3>Pending effects (executed=false)</h3>
          <pre className="text-xs overflow-auto">{JSON.stringify(effects, null, 2)}</pre>
        </section>
      ) : null}

      <section className="ctr-section" data-testid="conclusao-v2-ledger">
        <h3>Ledger</h3>
        {ledger.length === 0 ? <p className="ctr-hint">Vazio.</p> : (
          <ol>
            {ledger.map((e) => (
              <li key={e.id}>
                #{e.sequenceNumber} {e.eventType} · {e.entryHash?.slice(0, 12)}…
              </li>
            ))}
          </ol>
        )}
      </section>

      {chain ? (
        <section className="ctr-section" data-testid="conclusao-v2-chain-result">
          <h3>Chain verify</h3>
          <pre className="text-xs">{JSON.stringify(chain, null, 2)}</pre>
        </section>
      ) : null}

      {reconciliation ? (
        <section className="ctr-section" data-testid="conclusao-v2-reconciliation">
          <h3>Reconciliação</h3>
          <pre className="text-xs overflow-auto">{JSON.stringify({
            contractStatus: reconciliation.contractStatus,
            inconsistencies: reconciliation.inconsistencies,
            repairPlan: reconciliation.repairPlan,
          }, null, 2)}</pre>
        </section>
      ) : null}

      <section className="ctr-section" data-testid="conclusao-v2-lifecycle">
        <h3>Lifecycle</h3>
        <ul>
          {lifecycle.map((item, idx) => (
            <li key={`${item.at}-${idx}`}>{item.at}: {item.text}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
