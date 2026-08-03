/**
 * Área técnica de envelopes de assinatura v2 — Phase 10.6.
 * Somente fixtures / harness in-memory. Sem e-mail, SMS, PDF ou dados reais.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getSignaturesV2Services,
  mapSignaturesV2Error,
  setSignaturesV2HarnessForTests,
} from '../../services/signaturesV2Service.js';
import { createSignatureV2Harness } from '../../domain/contracts/signatures/signature-v2.harness.ts';
import {
  demoSignerPatient,
  demoSignerProfessional,
  demoSignerResponsible,
} from '../../domain/contracts/fixtures/signature-v2.fixtures.ts';

const ALL_PERMS = [
  'contract_signatures:view',
  'contract_signatures:create_envelope',
  'contract_signatures:manage_signers',
  'contract_signatures:send',
  'contract_signatures:cancel_envelope',
  'contract_signatures:view_evidence',
  'contract_signatures:manage_policies',
  'contract_signatures:reconcile',
];

function maskEvidence(evidence) {
  if (!evidence) return null;
  return {
    evidenceHash: evidence.evidenceHash,
    documentHash: evidence.documentHash,
    signedAt: evidence.signedAt,
    authenticationMethod: evidence.authenticationMethod,
    artifactId: evidence.signatureArtifact?.temporaryArtifactId || null,
    artifactSha: evidence.signatureArtifact?.sha256
      ? `${String(evidence.signatureArtifact.sha256).slice(0, 8)}…`
      : null,
    sessionTokenId: evidence.sessionTokenId ? '[present]' : null,
    acceptedTerms: (evidence.acceptedTerms || []).map((t) => ({
      code: t.code,
      acceptedAt: t.acceptedAt,
    })),
  };
}

export default function ContractsAssinaturasV2Page() {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [envelope, setEnvelope] = useState(null);
  const [signers, setSigners] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeToken, setActiveToken] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [evidenceMasked, setEvidenceMasked] = useState(null);
  const [lifecycle, setLifecycle] = useState([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState('pol_demo_simple');

  const services = useMemo(() => getSignaturesV2Services(), [ready]);
  const harness = services.harness;
  const actor = useMemo(() => ({
    userId: 'tech_sig_user',
    permissions: ALL_PERMS,
  }), []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleError = useCallback((err) => {
    const mapped = mapSignaturesV2Error(err);
    setError(mapped.message);
    showToast(mapped.message, 'error');
  }, []);

  const pushLife = (text) => {
    setLifecycle((prev) => [...prev, { at: new Date().toISOString(), text }]);
  };

  const ensureHarness = useCallback(async () => {
    if (getSignaturesV2Services().harness) {
      setReady(true);
      return getSignaturesV2Services().harness;
    }
    const h = await createSignatureV2Harness({ deterministicOtp: '123456' });
    setSignaturesV2HarnessForTests(h);
    setReady(true);
    return h;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const h = await ensureHarness();
        if (cancelled) return;
        const listed = await h.policyService.listPolicies(h.tenantId, actor);
        setPolicies(listed.items || []);
        pushLife('Harness técnico inicializado (fixtures).');
      } catch (err) {
        if (!cancelled) handleError(err);
      }
    })();
    return () => { cancelled = true; };
  }, [ensureHarness, actor, handleError]);

  const refreshEnvelope = async (envelopeId) => {
    const h = getSignaturesV2Services().harness;
    if (!h || !envelopeId) return;
    const details = await h.envelopeService.getEnvelope(h.tenantId, envelopeId, actor);
    if (details) {
      setEnvelope(details.envelope);
      setSigners(details.signers || []);
    }
  };

  const createEnvelopeDemo = async () => {
    try {
      const h = await ensureHarness();
      const result = await h.envelopeService.createEnvelope(h.tenantId, {
        contractId: h.contract.id,
        signaturePolicyId: selectedPolicyId,
        signers: [
          { ...demoSignerPatient, allowedMethods: [...demoSignerPatient.allowedMethods] },
          { ...demoSignerResponsible, allowedMethods: [...demoSignerResponsible.allowedMethods] },
          { ...demoSignerProfessional, allowedMethods: [...demoSignerProfessional.allowedMethods] },
        ],
        idempotencyKey: `create_${Date.now()}`,
      }, actor);
      setEnvelope(result.envelope);
      setSigners(result.signers);
      setSessions([]);
      setEvidenceMasked(null);
      pushLife(`Envelope criado: ${result.envelope.id} (${result.envelope.status})`);
      showToast('Envelope demo criado');
    } catch (err) {
      handleError(err);
    }
  };

  const markReady = async () => {
    try {
      const h = harness;
      const env = await h.envelopeService.markReady(h.tenantId, envelope.id, actor);
      setEnvelope(env);
      pushLife('Envelope READY');
    } catch (err) {
      handleError(err);
    }
  };

  const sendEnvelope = async () => {
    try {
      const h = harness;
      const result = await h.envelopeService.sendEnvelope(h.tenantId, envelope.id, actor, {
        idempotencyKey: `send_${envelope.id}`,
      });
      setEnvelope(result.envelope);
      setSigners(result.signers);
      setSessions(result.issuedSessions || []);
      if (result.issuedSessions?.[0]?.token) {
        setActiveToken(result.issuedSessions[0].token);
      }
      pushLife('Envio simulado (nenhuma mensagem real)');
      showToast('Envio simulado');
    } catch (err) {
      handleError(err);
    }
  };

  const openSession = async () => {
    try {
      const h = harness;
      const result = await h.signerService.openSigningSession({ token: activeToken });
      pushLife(`Sessão aberta: ${result.signerName} (${result.status})`);
      await refreshEnvelope(envelope.id);
    } catch (err) {
      handleError(err);
    }
  };

  const viewDocument = async () => {
    try {
      const h = harness;
      await h.signerService.viewDocument({ token: activeToken });
      pushLife('Documento visualizado (demo)');
      await refreshEnvelope(envelope.id);
    } catch (err) {
      handleError(err);
    }
  };

  const requestChallenge = async () => {
    try {
      const h = harness;
      const result = await h.signerService.requestAuthenticationChallenge({
        token: activeToken,
        method: 'OTP_EMAIL',
      });
      setChallengeId(result.challengeId);
      setOtpCode(result.testOnlyPlainCode || '');
      pushLife(`Challenge solicitado (OTP harness: ${result.testOnlyPlainCode || '***'})`);
    } catch (err) {
      handleError(err);
    }
  };

  const verifyChallenge = async () => {
    try {
      const h = harness;
      await h.signerService.verifyAuthenticationChallenge({
        token: activeToken,
        challengeId,
        code: otpCode,
      });
      pushLife('OTP validado (simulado)');
      await refreshEnvelope(envelope.id);
    } catch (err) {
      handleError(err);
    }
  };

  const acceptTerms = async () => {
    try {
      const h = harness;
      const session = await h.signerService.openSigningSession({ token: activeToken });
      const ids = (session.requiredTerms || []).filter((t) => t.required).map((t) => t.id);
      await h.signerService.acceptRequiredTerms({ token: activeToken, acceptanceIds: ids });
      pushLife('Termos obrigatórios aceitos');
    } catch (err) {
      handleError(err);
    }
  };

  const drawAndSign = async (method = 'CLICK_ACCEPT') => {
    try {
      const h = harness;
      let artifactSeed;
      if (method === 'DRAWN_SIGNATURE' && canvasRef.current) {
        // Usa seed local — NÃO envia data URL ao domínio
        artifactSeed = `canvas_strokes_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      }
      const result = await h.signerService.sign({
        token: activeToken,
        method,
        artifactSeed,
        typedConfirmation: method === 'TYPED_CONFIRMATION' ? 'Confirmo' : undefined,
        idempotencyKey: `sign_${envelope.id}_${Date.now()}`,
      });
      setEnvelope(result.envelope);
      setEvidenceMasked(maskEvidence(result.evidence));
      pushLife(`Assinado (${method}). Envelope: ${result.envelope.status}`);
      showToast('Assinatura registrada (evidência)');
      await refreshEnvelope(result.envelope.id);
    } catch (err) {
      handleError(err);
    }
  };

  const decline = async () => {
    try {
      const h = harness;
      const result = await h.signerService.decline({
        token: activeToken,
        reason: 'Recusa demonstrativa',
      });
      setEnvelope(result.envelope);
      setEvidenceMasked(maskEvidence(result.evidence));
      pushLife(`Recusado. Envelope: ${result.envelope.status}`);
      await refreshEnvelope(result.envelope.id);
    } catch (err) {
      handleError(err);
    }
  };

  const expire = async () => {
    try {
      const h = harness;
      h.advanceClock('2026-08-20T12:00:00.000Z');
      const env = await h.envelopeService.expireEnvelope(h.tenantId, envelope.id, actor);
      setEnvelope(env);
      pushLife(`Expirado: ${env.status}`);
    } catch (err) {
      handleError(err);
    }
  };

  const reconcile = async () => {
    try {
      const h = harness;
      const result = await h.envelopeService.reconcileEnvelope(h.tenantId, envelope.id);
      setEnvelope(result.envelope);
      pushLife(`Reconciliação: completed=${result.completed}`);
    } catch (err) {
      handleError(err);
    }
  };

  const paintCanvas = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  };

  return (
    <div className="ctr-page space-y-4" data-testid="contracts-assinaturas-v2-page">
      <header>
        <h2 className="ctr-section-title">Assinaturas v2 (técnica)</h2>
        <p className="ctr-hint">
          Harness com fixtures. Flags OFF em produção. Sem e-mail, SMS, PDF ou dados reais.
        </p>
      </header>

      {error ? (
        <div className="ctr-section" role="alert" data-testid="contracts-assinaturas-v2-error">
          {error}
        </div>
      ) : null}
      {toast ? (
        <div className={`ctr-toast ctr-toast-${toast.type}`} data-testid="contracts-assinaturas-v2-toast">
          {toast.message}
        </div>
      ) : null}

      <section className="ctr-section space-y-2">
        <label className="ctr-label" htmlFor="policy-select">Política demo</label>
        <select
          id="policy-select"
          className="ctr-input"
          value={selectedPolicyId}
          onChange={(e) => setSelectedPolicyId(e.target.value)}
          data-testid="sig-v2-policy-select"
        >
          {policies.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.signingOrder})</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ctr-btn" onClick={createEnvelopeDemo} data-testid="sig-v2-create">
            Criar envelope demo
          </button>
          <button type="button" className="ctr-btn" onClick={markReady} disabled={!envelope} data-testid="sig-v2-ready">
            Ready
          </button>
          <button type="button" className="ctr-btn" onClick={sendEnvelope} disabled={!envelope} data-testid="sig-v2-send">
            Enviar (simulado)
          </button>
          <button type="button" className="ctr-btn" onClick={expire} disabled={!envelope} data-testid="sig-v2-expire">
            Expirar
          </button>
          <button type="button" className="ctr-btn" onClick={reconcile} disabled={!envelope} data-testid="sig-v2-reconcile">
            Reconciliar
          </button>
        </div>
      </section>

      {envelope ? (
        <section className="ctr-section space-y-2" data-testid="sig-v2-envelope">
          <p><strong>Envelope:</strong> {envelope.id}</p>
          <p data-testid="sig-v2-envelope-status"><strong>Status:</strong> {envelope.status}</p>
          <p><strong>Hash doc:</strong> {envelope.documentHashBeforeSigning}</p>
          <ul data-testid="sig-v2-signers">
            {signers.map((s) => (
              <li key={s.id}>{s.signerOrder}. {s.name} — {s.status} {s.required ? '(obrig.)' : ''}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="ctr-section space-y-2">
        <label className="ctr-label" htmlFor="session-token">Token de sessão técnica</label>
        <select
          id="session-token"
          className="ctr-input"
          value={activeToken}
          onChange={(e) => setActiveToken(e.target.value)}
          data-testid="sig-v2-token-select"
        >
          <option value="">—</option>
          {sessions.map((s) => (
            <option key={s.tokenId} value={s.token}>
              {s.signerId} (token harness)
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ctr-btn" onClick={openSession} disabled={!activeToken} data-testid="sig-v2-open">
            Abrir sessão
          </button>
          <button type="button" className="ctr-btn" onClick={viewDocument} disabled={!activeToken} data-testid="sig-v2-view">
            Ver documento
          </button>
          <button type="button" className="ctr-btn" onClick={requestChallenge} disabled={!activeToken} data-testid="sig-v2-challenge">
            Solicitar OTP
          </button>
          <button type="button" className="ctr-btn" onClick={verifyChallenge} disabled={!challengeId} data-testid="sig-v2-verify">
            Validar OTP
          </button>
          <button type="button" className="ctr-btn" onClick={acceptTerms} disabled={!activeToken} data-testid="sig-v2-accept">
            Aceitar termos
          </button>
          <button type="button" className="ctr-btn" onClick={() => drawAndSign('CLICK_ACCEPT')} disabled={!activeToken} data-testid="sig-v2-sign-click">
            Assinar (click)
          </button>
          <button type="button" className="ctr-btn" onClick={() => drawAndSign('DRAWN_SIGNATURE')} disabled={!activeToken} data-testid="sig-v2-sign-draw">
            Assinar (canvas→artifact)
          </button>
          <button type="button" className="ctr-btn" onClick={decline} disabled={!activeToken} data-testid="sig-v2-decline">
            Recusar
          </button>
        </div>
        {otpCode ? (
          <p className="ctr-hint" data-testid="sig-v2-otp-harness">
            OTP harness (somente teste): {otpCode}
          </p>
        ) : null}
        <canvas
          ref={canvasRef}
          width={300}
          height={100}
          className="border border-slate-300 bg-white"
          data-testid="sig-v2-canvas"
          onMouseMove={(e) => { if (e.buttons === 1) paintCanvas(e); }}
        />
      </section>

      {evidenceMasked ? (
        <section className="ctr-section" data-testid="sig-v2-evidence">
          <h3>Evidência (mascarada)</h3>
          <pre className="text-xs overflow-auto">{JSON.stringify(evidenceMasked, null, 2)}</pre>
        </section>
      ) : null}

      <section className="ctr-section" data-testid="sig-v2-lifecycle">
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
