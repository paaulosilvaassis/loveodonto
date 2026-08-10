import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from '../../components/contracts/SignatureCanvas.jsx';
import {
  getContractBySignToken,
  markContractViewed,
  signContractViaLink,
} from '../../services/contractModuleService.js';
import { ContractDocumentPreview } from '../../contracts/ui/ContractUi.jsx';
import { contractHtmlWithSignatures, downloadContractPdfFromElement } from '../../services/contractPdfService.js';
import {
  buildPublicSigningSummaryFromV1Contract,
  resetConsentAcceptanceMap,
} from '../../contracts/publicSigningSummary.js';
import {
  PublicSigningStepIndicator,
  PublicSigningTreatmentSection,
  PublicSigningFinancialSection,
  PublicSigningPrivacySection,
  PublicSigningDocumentCta,
} from '../../components/contracts/public/PublicSigningSummarySections.jsx';
import { UX_MESSAGES, formatUxMessage } from '../../contracts/operationalUxMessages.js';

export default function ContractSignPublicPage() {
  const { token } = useParams();
  const resolved = useMemo(() => (token ? getContractBySignToken(token) : null), [token]);
  const summary = useMemo(
    () => buildPublicSigningSummaryFromV1Contract(resolved?.contract),
    [resolved],
  );

  const [phase, setPhase] = useState('summary'); // summary | document | privacy | sign
  const [signerName, setSignerName] = useState('');
  const [signerCpf, setSignerCpf] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [consentMap, setConsentMap] = useState(() => resetConsentAcceptanceMap(summary.privacy));
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  if (!resolved) {
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-invalid">
        <h1>{UX_MESSAGES.LINK_INVALID.title}</h1>
        <p>{UX_MESSAGES.LINK_INVALID.body}</p>
      </div>
    );
  }

  if (resolved.expired) {
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-expired">
        <h1>{UX_MESSAGES.LINK_EXPIRED.title}</h1>
        <p>{UX_MESSAGES.LINK_EXPIRED.body}</p>
      </div>
    );
  }

  const { contract } = resolved;

  if (done) {
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-done">
        <h1>{UX_MESSAGES.SIGNATURE_COMPLETED.title}</h1>
        <p>{UX_MESSAGES.SIGNATURE_COMPLETED.body}</p>
      </div>
    );
  }

  const stepNumber = { summary: 1, document: 2, privacy: 3, sign: 4 }[phase] || 1;

  const requiredOk = (summary.privacy?.requiredConsents || []).every((c) => consentMap[c.id]);

  const handleOpenDocument = async () => {
    setShowPreview(true);
    setPhase('document');
    try {
      const el = document.getElementById('ctr-public-contract-print');
      if (el) {
        await downloadContractPdfFromElement(el, `${contract.contractNumber || 'contrato'}.pdf`);
      }
    } catch {
      // preview HTML já visível — PDF é best-effort
    }
  };

  const handleSign = () => {
    setError('');
    if (!requiredOk) {
      setError('Marque os consentimentos obrigatórios, incluindo o aviso de privacidade, para continuar.');
      setPhase('privacy');
      return;
    }
    try {
      markContractViewed({ id: 'public' }, contract.id);
      signContractViaLink(token, {
        signerName,
        signerCpf,
        signatureImageDataUrl: signatureData,
        consentAcceptances: consentMap,
      });
      setDone(true);
    } catch (e) {
      setError(e?.message || formatUxMessage('LOAD_FAILED'));
    }
  };

  return (
    <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-v1-page">
      <header className="ctr-public-sign-header">
        <h1>Assinatura de contrato</h1>
        <p>{summary.documentTitle}</p>
      </header>

      <PublicSigningStepIndicator current={stepNumber} total={4} />

      {phase === 'summary' ? (
        <>
          <PublicSigningTreatmentSection treatment={summary.treatment} />
          <PublicSigningFinancialSection financial={summary.financial} />
          <PublicSigningDocumentCta onOpenDocument={handleOpenDocument} />
          <button
            type="button"
            className="button primary"
            onClick={() => setPhase('privacy')}
          >
            Continuar
          </button>
        </>
      ) : null}

      {phase === 'document' || showPreview ? (
        <section className="ctr-public-summary-card" data-testid="public-sign-document-preview">
          <h2>Documento completo</h2>
          <p className="ctr-public-summary-note">
            Este é o PDF/documento autorizado do seu contrato. Relatórios técnicos de evidência não são exibidos aqui.
          </p>
          <div id="ctr-public-contract-print">
            <ContractDocumentPreview html={contractHtmlWithSignatures(contract.renderedHtml)} />
          </div>
          {phase === 'document' ? (
            <button type="button" className="button primary" onClick={() => setPhase('privacy')}>
              Entendi, continuar
            </button>
          ) : null}
        </section>
      ) : null}

      {phase === 'privacy' ? (
        <>
          <PublicSigningPrivacySection
            privacy={summary.privacy}
            acceptance={consentMap}
            onChange={(id, checked) => setConsentMap((prev) => ({ ...prev, [id]: checked }))}
          />
          <div className="ctr-public-sign-actions">
            <button type="button" className="button secondary" onClick={() => setPhase('summary')}>
              Voltar
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!requiredOk}
              onClick={() => setPhase('sign')}
            >
              Ir para assinatura
            </button>
          </div>
        </>
      ) : null}

      {phase === 'sign' ? (
        <div className="ctr-public-sign-form">
          {error && <p className="text-sm text-[var(--color-error)]" role="alert">{error}</p>}
          <label>
            Nome completo
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
          </label>
          <label>
            CPF
            <input value={signerCpf} onChange={(e) => setSignerCpf(e.target.value)} />
          </label>
          <SignatureCanvas onChange={setSignatureData} />
          <div className="ctr-public-sign-actions">
            <button type="button" className="button secondary" onClick={() => setPhase('privacy')}>
              Voltar
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!signerName.trim() || !signatureData || !requiredOk}
              onClick={handleSign}
            >
              Assinar documento
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
