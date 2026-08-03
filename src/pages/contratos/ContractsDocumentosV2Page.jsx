/**
 * Área técnica de documentos/PDF v2 — Phase 10.7.
 * Somente fixtures + memory storage. Artefatos claramente marcados como demo.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getContractDocumentsV2Harness,
  mapContractDocumentsV2Error,
  setContractDocumentsV2HarnessForTests,
} from '../../services/contractDocumentsV2Service.js';
import { createDocumentsV2Harness } from '../../domain/contracts/artifacts/documents-v2.harness.ts';

export default function ContractsDocumentosV2Page() {
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [ready, setReady] = useState(false);
  const [renderModel, setRenderModel] = useState(null);
  const [htmlPreview, setHtmlPreview] = useState('');
  const [files, setFiles] = useState([]);
  const [effects, setEffects] = useState(null);
  const [hashes, setHashes] = useState({});
  const [lifecycle, setLifecycle] = useState([]);

  const push = (text) => setLifecycle((prev) => [...prev, { at: new Date().toISOString(), text }]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = useCallback((err) => {
    const mapped = mapContractDocumentsV2Error(err);
    setError(mapped.message);
    showToast(mapped.message, 'error');
  }, []);

  const ensure = useCallback(async () => {
    let h = getContractDocumentsV2Harness();
    if (!h) {
      h = await createDocumentsV2Harness();
      setContractDocumentsV2HarnessForTests(h);
    }
    setReady(true);
    return h;
  }, []);

  useEffect(() => {
    ensure().then(() => push('Harness documentos v2 inicializado (fixtures/memory).')).catch(handleError);
  }, [ensure, handleError]);

  const refreshFiles = async () => {
    const h = await ensure();
    const items = await h.storage.listByContract(h.tenantId, h.contract.id);
    setFiles(items);
  };

  const buildRender = async () => {
    try {
      const h = await ensure();
      const { createContractDocumentRenderModel } = await import(
        '../../domain/contracts/rendering/contract-document-render.model.ts'
      );
      const { createContractHtmlRenderer } = await import(
        '../../domain/contracts/rendering/contract-html.renderer.ts'
      );
      const model = createContractDocumentRenderModel(h.version, {
        clock: h.clock,
        contractNumber: h.contract.contractNumber,
        title: h.contract.title,
        documentType: h.contract.documentType,
      }, h.contract);
      const html = await createContractHtmlRenderer().render(model);
      setRenderModel(model);
      setHtmlPreview(html.html);
      setHashes((prev) => ({ ...prev, html: html.sha256, document: model.documentHash }));
      push('Render model + HTML gerados (demo)');
    } catch (err) {
      handleError(err);
    }
  };

  const generateUnsigned = async () => {
    try {
      const h = await ensure();
      const result = await h.pipeline.generateUnsignedArtifacts(
        h.tenantId,
        h.contract,
        h.version,
        h.actor,
      );
      setHashes((prev) => ({
        ...prev,
        html: result.html.sha256,
        unsignedPdf: result.pdf.artifact.sha256,
        file: result.file.sha256,
      }));
      setHtmlPreview(result.html.html);
      await refreshFiles();
      push(`PDF não assinado demo: ${result.file.id}`);
      showToast('PDF de teste gerado (não jurídico)');
    } catch (err) {
      handleError(err);
    }
  };

  const generateSigned = async () => {
    try {
      const h = await ensure();
      const completed = await h.createCompletedEnvelopeFixture();
      const result = await h.pipeline.generateSignedArtifacts(
        h.tenantId,
        h.contract,
        h.version,
        completed.envelope,
        completed.signers,
        completed.policy,
        completed.evidences,
        h.actor,
      );
      setEffects(result.effects);
      setHashes((prev) => ({
        ...prev,
        signedPdf: result.signedPdf.artifact.sha256,
        evidence: result.evidenceReport.reportHash,
        manifest: result.manifest.manifestHash,
      }));
      await refreshFiles();
      push('Artefatos assinados demo gerados; efeitos NÃO executados');
      showToast('Signed artifacts (demo técnico)');
    } catch (err) {
      handleError(err);
    }
  };

  const verifyAll = async () => {
    try {
      const h = await ensure();
      const items = await h.storage.listByContract(h.tenantId, h.contract.id);
      const results = [];
      for (const f of items) {
        results.push(await h.storage.verifyIntegrity(h.tenantId, f.id));
      }
      push(`Verificação: ${results.map((r) => `${r.fileId}:${r.state}`).join(', ')}`);
      await refreshFiles();
    } catch (err) {
      handleError(err);
    }
  };

  const simulateDownload = async (fileId) => {
    try {
      const h = await ensure();
      const dl = await h.storage.getAuthorizedDownload(h.tenantId, fileId, h.actor);
      push(`Download autorizado simulado: ${dl.generatedName} (${dl.sizeBytes} bytes) token=${dl.temporaryToken.slice(0, 12)}…`);
      showToast('Download autorizado (bytes em memória)');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="ctr-page space-y-4" data-testid="contracts-documentos-v2-page">
      <header>
        <h2 className="ctr-section-title">Documentos v2 (técnica)</h2>
        <p className="ctr-hint">
          Harness com fixtures e storage in-memory. Renderer determinístico de teste — sem valor jurídico.
          Flags OFF em produção. Sem bucket, upload ou PDF legado.
        </p>
      </header>

      {error ? (
        <div className="ctr-section" role="alert" data-testid="contracts-documentos-v2-error">{error}</div>
      ) : null}
      {toast ? (
        <div className={`ctr-toast ctr-toast-${toast.type}`} data-testid="contracts-documentos-v2-toast">
          {toast.message}
        </div>
      ) : null}

      <section className="ctr-section flex flex-wrap gap-2">
        <button type="button" className="ctr-btn" onClick={buildRender} data-testid="docs-v2-render">
          Render model + HTML
        </button>
        <button type="button" className="ctr-btn" onClick={generateUnsigned} disabled={!ready} data-testid="docs-v2-unsigned">
          Gerar PDF não assinado (demo)
        </button>
        <button type="button" className="ctr-btn" onClick={generateSigned} disabled={!ready} data-testid="docs-v2-signed">
          Gerar artefatos assinados (demo)
        </button>
        <button type="button" className="ctr-btn" onClick={verifyAll} disabled={!ready} data-testid="docs-v2-verify">
          Verificar integridade
        </button>
        <button type="button" className="ctr-btn" onClick={refreshFiles} disabled={!ready} data-testid="docs-v2-list">
          Listar arquivos
        </button>
      </section>

      {hashes.document || hashes.unsignedPdf ? (
        <section className="ctr-section" data-testid="docs-v2-hashes">
          <h3>Hashes</h3>
          <pre className="text-xs overflow-auto">{JSON.stringify(hashes, null, 2)}</pre>
        </section>
      ) : null}

      {renderModel ? (
        <section className="ctr-section" data-testid="docs-v2-model">
          <h3>Render model</h3>
          <p>{renderModel.contractNumber} · v{renderModel.versionNumber} · {renderModel.sections.length} seções</p>
        </section>
      ) : null}

      {htmlPreview ? (
        <section className="ctr-section" data-testid="docs-v2-html">
          <h3>HTML (preview sanitizado)</h3>
          <iframe
            title="html-preview-demo"
            sandbox=""
            srcDoc={htmlPreview}
            className="w-full h-64 border border-slate-300 bg-white"
          />
        </section>
      ) : null}

      <section className="ctr-section" data-testid="docs-v2-files">
        <h3>Arquivos (memory)</h3>
        {files.length === 0 ? <p className="ctr-hint">Nenhum arquivo.</p> : (
          <ul>
            {files.map((f) => (
              <li key={f.id}>
                {f.fileType} · {f.status} · {f.generatedName} · {f.sha256?.slice(0, 12)}…
                {' '}
                <button type="button" className="ctr-btn" onClick={() => simulateDownload(f.id)}>
                  Download autorizado
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {effects ? (
        <section className="ctr-section" data-testid="docs-v2-effects">
          <h3>Efeitos pendentes (não executados)</h3>
          <pre className="text-xs">{JSON.stringify(effects, null, 2)}</pre>
        </section>
      ) : null}

      <section className="ctr-section" data-testid="docs-v2-lifecycle">
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
