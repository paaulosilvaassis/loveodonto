import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import SignatureCanvas from '../../components/contracts/SignatureCanvas.jsx';
import {
  getContractBySignToken,
  markContractViewed,
  recordSignLinkFirstView,
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
import { PublicPackageManifestDocuments } from '../../components/contracts/public/PublicPackageManifestDocuments.jsx';
import { UX_MESSAGES, formatUxMessage } from '../../contracts/operationalUxMessages.js';
import { recordContractsRolloutMetric } from '../../services/contractsOperationalRolloutService.js';
import { isStagingTestModeEnabled } from '../../domain/contracts/staging/staging-browser-test-mode.ts';
import {
  evaluateStagingPackageSignGate,
  getStagingPublicPackageByToken,
  recordStagingPackageAcceptance,
} from '../../domain/contracts/staging/stagingClinicalPackageManifestBridge.js';
import { withDb } from '../../db/index.js';
import { fetchSigningClientContext } from '../../services/signingClientContextService.js';
import { collectPresentedConsents } from '../../contracts/remoteSignatureEvidence.js';
import { getPatient } from '../../services/patientService.js';
import {
  describePublicSigningAccessFailure,
  PUBLIC_SIGNING_FAILURE_COPY,
} from '../../contracts/lifecycle/publicSigningUi.js';

export default function ContractSignPublicPage() {
  const { token } = useParams();
  const resolved = useMemo(() => (token ? getContractBySignToken(token) : null), [token]);
  const publicFailure = useMemo(() => {
    if (resolved?.expired) return { kind: 'expired' };
    if (resolved?.replay) return { kind: 'replay' };
    if (resolved) return null;
    return describePublicSigningAccessFailure(token);
  }, [token, resolved]);
  const summary = useMemo(
    () => buildPublicSigningSummaryFromV1Contract(resolved?.contract),
    [resolved],
  );
  const [stagingPackage, setStagingPackage] = useState(null);
  const [signGate, setSignGate] = useState({ canSign: true, hasManifest: false });
  const hasPackage = Boolean(stagingPackage?.publicDocs?.length);

  useEffect(() => {
    if (token && resolved && !resolved.expired) {
      recordContractsRolloutMetric('public_sign_opened');
    }
  }, [token, resolved]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !isStagingTestModeEnabled()) {
        setStagingPackage(null);
        return;
      }
      try {
        const { initDb } = await import('../../db/index.js');
        await initDb();
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      const pkg = getStagingPublicPackageByToken(token);
      setStagingPackage(pkg);
      if (pkg?.publicDocs?.length) {
        setSignGate(evaluateStagingPackageSignGate(token));
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const [phase, setPhase] = useState('summary'); // summary | document | privacy | package | sign
  const [signerName, setSignerName] = useState('');
  const [signerCpf, setSignerCpf] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [consentMap, setConsentMap] = useState(() => resetConsentAcceptanceMap(summary.privacy));
  const [packageState, setPackageState] = useState({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [evidenceHtml, setEvidenceHtml] = useState('');
  const [consentTimes, setConsentTimes] = useState({});
  const [clientContext, setClientContext] = useState(null);

  useEffect(() => {
    if (!token || !resolved || resolved.expired || resolved.replay) return;
    recordSignLinkFirstView(token, {
      human: true,
      visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'visible',
      webdriver: typeof navigator !== 'undefined' ? Boolean(navigator.webdriver) : false,
      prefetch: typeof document !== 'undefined' && document.prerendering === true,
    });
  }, [token, resolved]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ctx = await fetchSigningClientContext();
      if (!cancelled && ctx) setClientContext(ctx);
    })();
    return () => { cancelled = true; };
  }, []);

  if (resolved?.expired || publicFailure?.kind === 'expired') {
    const copy = PUBLIC_SIGNING_FAILURE_COPY.expired;
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-expired">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </div>
    );
  }

  if (publicFailure?.kind === 'revoked') {
    const copy = PUBLIC_SIGNING_FAILURE_COPY.revoked;
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-revoked">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </div>
    );
  }

  if (publicFailure?.kind === 'unavailable') {
    const copy = PUBLIC_SIGNING_FAILURE_COPY.unavailable;
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-unavailable">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-invalid">
        <h1>{UX_MESSAGES.LINK_INVALID.title}</h1>
        <p>{UX_MESSAGES.LINK_INVALID.body}</p>
      </div>
    );
  }

  if (resolved.replay || publicFailure?.kind === 'replay') {
    const copy = PUBLIC_SIGNING_FAILURE_COPY.replay;
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-replay">
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
      </div>
    );
  }

  const { contract } = resolved;
  const registeredSignerName = contract.patientId
    ? (getPatient(contract.patientId)?.profile?.full_name || '')
    : '';

  if (done) {
    return (
      <div className="ctr-public-sign ctr-public-sign--v2ux" data-testid="public-sign-done">
        <h1>{UX_MESSAGES.SIGNATURE_COMPLETED.title}</h1>
        <p>{UX_MESSAGES.SIGNATURE_COMPLETED.body}</p>
        {stagingPackage?.manifestId ? (
          <section data-testid="signed-package-report" className="ctr-public-summary-card">
            <h2>PACOTE ASSINADO</h2>
            <p>Contrato · TCLE · LGPD</p>
            <p>Assinante: {signerName}</p>
            <p>Manifesto: {String(stagingPackage.manifestId).slice(0, 12)}…</p>
            <p>Data/hora: {new Date().toLocaleString('pt-BR')}</p>
          </section>
        ) : null}
        {evidenceHtml ? (
          <div
            data-testid="signature-evidence-report"
            dangerouslySetInnerHTML={{ __html: evidenceHtml }}
          />
        ) : null}
      </div>
    );
  }

  const stepNumber = {
    summary: 1,
    document: 2,
    privacy: hasPackage ? 2 : 3,
    package: 3,
    sign: 4,
  }[phase] || 1;

  const requiredOk = (summary.privacy?.requiredConsents || []).every((c) => consentMap[c.id]);
  const packageOk = !hasPackage || Boolean(signGate?.canSign);

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

  const handlePackageChange = async (docId, next) => {
    setPackageState((prev) => ({ ...prev, [docId]: next }));
    if (next?.accepted && token) {
      try {
        await recordStagingPackageAcceptance({
          token,
          documentId: docId,
          signerId: 'signer-patient-staging',
        });
        setSignGate(evaluateStagingPackageSignGate(token));
      } catch (e) {
        setError(e?.message || 'Falha ao registrar aceite do documento.');
      }
    }
  };

  const handleSign = async () => {
    setError('');
    if (hasPackage) {
      const gate = evaluateStagingPackageSignGate(token);
      setSignGate(gate);
      if (!gate.canSign) {
        setError('Visualize e aceite Contrato, TCLE e LGPD obrigatórios antes de assinar.');
        setPhase('package');
        return;
      }
    } else if (!requiredOk) {
      setError('Marque os consentimentos obrigatórios, incluindo o aviso de privacidade, para continuar.');
      setPhase('privacy');
      return;
    }
    try {
      let observed = clientContext;
      if (!observed) {
        observed = await fetchSigningClientContext();
        if (observed) setClientContext(observed);
      }
      markContractViewed({ id: 'public' }, contract.id);
      await signContractViaLink(token, {
        signerName,
        signerCpf,
        signatureImageDataUrl: signatureData,
        typedSignerName: signerName,
        presentedConsents: collectPresentedConsents(summary.privacy),
        acceptanceMap: consentMap,
        acceptedAtById: consentTimes,
        requireConsent: !hasPackage,
        observedClientContext: observed,
        privacy: summary.privacy,
      });

      if (hasPackage && stagingPackage) {
        withDb((db) => {
          const reqs = db.contractSignatureRequests || [];
          const rIdx = reqs.findIndex((r) => r.id === stagingPackage.requestId);
          const now = new Date().toISOString();
          if (rIdx >= 0) {
            reqs[rIdx] = {
              ...reqs[rIdx],
              status: 'completed',
              completedAt: now,
              envelopeStatus: 'SIGNED',
              signedAt: now,
              packageManifestId: stagingPackage.manifestId,
              packageManifestHash: stagingPackage.manifestHash,
            };
          }
          const links = db.contractSignLinks || [];
          const lIdx = links.findIndex((l) => l.token === token);
          if (lIdx >= 0) {
            links[lIdx] = { ...links[lIdx], status: 'signed', signedAt: now };
          }
          return db;
        });

        try {
          const { buildSignatureEvidenceReport, evidenceReportToPrintableHtml } = await import(
            '../../domain/contracts/artifacts/signature-evidence-report.ts'
          );
          const acceptances = stagingPackage.acceptances || [];
          const refreshed = getStagingPublicPackageByToken(token);
          const report = await buildSignatureEvidenceReport({
            envelope: {
              id: stagingPackage.requestId || `env-${token}`,
              tenantId: stagingPackage.tenantId,
              contractId: contract.id,
              contractVersionId: contract.id,
              status: 'COMPLETED',
              provider: 'internal',
              documentHashBeforeSigning: contract.documentHash || '0'.repeat(64),
              createdBy: 'staging',
              createdAt: stagingPackage.createdAt,
              completedAt: new Date().toISOString(),
              sentAt: stagingPackage.createdAt,
              packageManifestId: stagingPackage.manifestId,
              packageManifestHash: stagingPackage.manifestHash,
              rowVersion: 1,
            },
            signers: [{
              id: 'signer-patient-staging',
              tenantId: stagingPackage.tenantId,
              envelopeId: stagingPackage.requestId || `env-${token}`,
              signerOrder: 1,
              signerRole: 'PATIENT',
              name: signerName,
              status: 'SIGNED',
              required: true,
              signedAt: new Date().toISOString(),
              acceptedTerms: [],
            }],
            policy: null,
            evidences: [{
              signerId: 'signer-patient-staging',
              evidenceHash: 'c'.repeat(64),
              packageManifestId: stagingPackage.manifestId,
              packageManifestHash: stagingPackage.manifestHash,
              documentAcceptances: (refreshed?.manifest?.documents || []).map((d) => {
                const acc = (refreshed.acceptances || []).find((a) => a.manifestDocumentId === d.id);
                return {
                  documentKey: d.documentKey,
                  documentType: d.documentType,
                  documentVersion: d.documentVersion,
                  contentHash: d.contentHash,
                  required: d.required,
                  acceptedAt: acc?.acceptedAt,
                  viewedAt: acc?.viewedAt,
                };
              }),
            }],
            contractNumber: contract.contractNumber,
          });
          setEvidenceHtml(evidenceReportToPrintableHtml(report));
          withDb((db) => {
            db.stagingLastEvidenceReport = {
              reportHash: report.reportHash,
              packageManifestId: stagingPackage.manifestId,
              packageManifestHash: stagingPackage.manifestHash,
              html: evidenceReportToPrintableHtml(report),
              contractId: contract.id,
              patientId: contract.patientId,
              createdAt: new Date().toISOString(),
            };
            return db;
          });
        } catch {
          // evidence best-effort in staging smoke
        }
        try {
          const { persistSignedPackageToPatientRecord } = await import(
            '../../domain/contracts/staging/stagingClinicalPackageManifestBridge.js'
          );
          persistSignedPackageToPatientRecord({
            token,
            patientId: contract.patientId,
            signerName,
          });
        } catch {
          // prontuário staging best-effort
        }
      }

      recordContractsRolloutMetric('public_sign_completed');
      setDone(true);
    } catch (e) {
      recordContractsRolloutMetric('public_sign_failed');
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
          {!hasPackage ? (
            <PublicSigningDocumentCta onOpenDocument={handleOpenDocument} />
          ) : null}
          <button
            type="button"
            className="button primary"
            onClick={() => setPhase(hasPackage ? 'package' : 'privacy')}
          >
            Continuar
          </button>
        </>
      ) : null}

      {phase === 'package' && hasPackage ? (
        <PublicPackageManifestDocuments
          documents={stagingPackage.publicDocs}
          initialState={packageState}
          onChange={handlePackageChange}
          onReadyToSign={() => setPhase('sign')}
        />
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

      {phase === 'privacy' && !hasPackage ? (
        <>
          <PublicSigningPrivacySection
            privacy={summary.privacy}
            acceptance={consentMap}
            onChange={(id, checked) => {
              setConsentMap((prev) => ({ ...prev, [id]: checked }));
              setConsentTimes((prev) => ({
                ...prev,
                [id]: checked ? new Date().toISOString() : null,
              }));
            }}
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
          {registeredSignerName ? (
            <p className="ctr-public-summary-note" data-testid="public-sign-canonical-identity">
              Você está assinando como <strong>{registeredSignerName}</strong>.
              Digite seu nome para confirmar. Diferenças de acento, espaços e maiúsculas são aceitas;
              o nome cadastrado permanece a identidade canônica.
            </p>
          ) : null}
          <label>
            Nome completo
            <input
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label>
            CPF
            <input value={signerCpf} onChange={(e) => setSignerCpf(e.target.value)} />
          </label>
          <SignatureCanvas onChange={setSignatureData} />
          <div className="ctr-public-sign-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => setPhase(hasPackage ? 'package' : 'privacy')}
            >
              Voltar
            </button>
            <button
              type="button"
              className="button primary"
              disabled={!signerName.trim() || !signatureData || !(hasPackage ? packageOk : requiredOk)}
              onClick={handleSign}
              data-testid="public-sign-submit"
            >
              Assinar documento
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
