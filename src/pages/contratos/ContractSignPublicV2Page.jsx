/**
 * Página pública de assinatura v2 — Phase 10.11.
 * Token apenas em memória de sessão React. Sem localStorage/IndexedDB.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  isPublicSignaturesV2UiEnabled,
  mapPublicSignaturesV2Error,
  publicAccept,
  publicChallenge,
  publicDecline,
  publicOpen,
  publicSign,
  publicVerify,
  publicView,
  uploadPublicSignatureGraphic,
} from '../../services/publicSignaturesV2Service.js';

const STEPS = ['load', 'view', 'auth', 'terms', 'sign', 'done'];

function deriveUiState(session, step, errorCode) {
  if (errorCode === 'SIGNATURE_SESSION_EXPIRED') return 'expired';
  if (errorCode === 'SIGNATURE_PUBLIC_ACCESS_DENIED' || errorCode === 'SIGNATURE_SESSION_INVALID') {
    return 'invalid';
  }
  if (session?.signerStatus === 'SIGNED' || session?.status === 'SIGNED') return 'completed';
  if (session?.signerStatus === 'DECLINED' || session?.status === 'DECLINED') return 'declined';
  if (step === 'auth') return 'awaiting_auth';
  if (step === 'sign' || step === 'terms') return 'awaiting_sign';
  return 'loading';
}

export default function ContractSignPublicV2Page() {
  const { token: routeToken } = useParams();
  const [sessionToken] = useState(() => String(routeToken || '').trim());
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  const enabled = useMemo(() => isPublicSignaturesV2UiEnabled(), []);
  const [step, setStep] = useState('load');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const [session, setSession] = useState(null);
  const [documentHtml, setDocumentHtml] = useState('');
  const [requiredTerms, setRequiredTerms] = useState([]);
  const [termAcceptance, setTermAcceptance] = useState({});
  const [challengeId, setChallengeId] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); };
  }, []);

  const handleError = useCallback((err) => {
    const mapped = mapPublicSignaturesV2Error(err);
    setError(mapped.message);
    setErrorCode(mapped.code);
  }, []);

  const loadSession = useCallback(async () => {
    if (!sessionToken) {
      setError('Link inválido.');
      setErrorCode('SIGNATURE_PUBLIC_ACCESS_DENIED');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const open = await publicOpen(sessionToken);
      setSession(open);
      setRequiredTerms(open.requiredTerms || []);
      const initial = {};
      for (const t of open.requiredTerms || []) {
        initial[t.id] = Boolean(t.accepted);
      }
      setTermAcceptance(initial);
      setStep('view');
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, handleError]);

  useEffect(() => {
    if (enabled) loadSession();
    else setLoading(false);
  }, [enabled, loadSession]);

  const advanceAfterView = useCallback((terms, steps) => {
    const hasTerms = (terms || []).length > 0;
    const authStep = (steps || []).includes('AUTHENTICATE');
    if (authStep) setStep('auth');
    else if (hasTerms) setStep('terms');
    else setStep('sign');
  }, []);

  const handleViewDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      const view = await publicView(sessionToken);
      setDocumentHtml(view.html || '<p>Documento indisponível.</p>');
      setSession((prev) => ({
        ...prev,
        signerStatus: view.signerStatus || prev?.signerStatus,
        requiredSteps: prev?.requiredSteps,
      }));
      advanceAfterView(requiredTerms, session?.requiredSteps);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestOtp = async () => {
    setLoading(true);
    setError(null);
    try {
      const ch = await publicChallenge(sessionToken, {
        method: 'OTP_EMAIL',
        channel: 'TECHNICAL_HARNESS',
        idempotencyKey: `chal_${Date.now()}`,
      });
      setChallengeId(ch.challengeId);
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await publicVerify(sessionToken, {
        challengeId,
        code: otpInput.trim(),
        idempotencyKey: `verify_${challengeId}`,
      });
      if ((requiredTerms || []).length > 0) setStep('terms');
      else setStep('sign');
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptTerms = async () => {
    const acceptances = (requiredTerms || []).map((t) => ({
      id: t.id,
      code: t.code,
      required: t.required,
      accepted: Boolean(termAcceptance[t.id]),
    }));
    const missing = acceptances.filter((a) => a.required && !a.accepted);
    if (missing.length) {
      setError('Aceite todos os termos obrigatórios.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await publicAccept(sessionToken, {
        acceptances,
        idempotencyKey: `accept_${Date.now()}`,
      });
      setStep('sign');
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const paintCanvas = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawing.current = true;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const endDraw = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    drawing.current = false;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || step !== 'sign') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#0d7377';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [step]);

  const handleSign = async () => {
    setLoading(true);
    setError(null);
    try {
      const canvas = canvasRef.current;
      let artifactSeed;
      let artifactReference;

      if (canvas) {
        const blob = await new Promise((resolve) => {
          canvas.toBlob((b) => resolve(b), 'image/png');
        });
        if (blob) {
          const uploaded = await uploadPublicSignatureGraphic(sessionToken, blob);
          if (uploaded?.artifactReference) {
            artifactReference = uploaded.artifactReference;
          } else {
            artifactSeed = `canvas_png_${Date.now()}_${blob.size}`;
          }
        }
      }

      const result = await publicSign(sessionToken, {
        method: artifactSeed || artifactReference ? 'DRAWN_SIGNATURE' : 'CLICK_ACCEPT',
        artifactSeed,
        artifactReference,
        idempotencyKey: `sign_${Date.now()}`,
      });
      setConfirmation(result);
      setSession((prev) => ({ ...prev, signerStatus: result.signerStatus }));
      setStep('done');
    } catch (err) {
      handleError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    setDeclining(true);
    setError(null);
    try {
      await publicDecline(sessionToken, {
        reason: 'Recusa pelo signatário',
        idempotencyKey: `decline_${Date.now()}`,
      });
      setStep('done');
    } catch (err) {
      handleError(err);
    } finally {
      setDeclining(false);
    }
  };

  const uiState = deriveUiState(session, step, errorCode);

  if (!enabled) {
    return (
      <div className="ctr-public-sign" data-testid="public-sign-v2-unavailable">
        <h1>Assinatura indisponível</h1>
        <p>Este serviço não está habilitado neste ambiente.</p>
      </div>
    );
  }

  if (uiState === 'invalid' || !sessionToken) {
    return (
      <div className="ctr-public-sign" data-testid="public-sign-v2-invalid">
        <h1>Solicitação inválida</h1>
        <p>{error || 'Não foi possível acessar esta solicitação de assinatura.'}</p>
      </div>
    );
  }

  if (uiState === 'expired') {
    return (
      <div className="ctr-public-sign" data-testid="public-sign-v2-expired">
        <h1>Link expirado</h1>
        <p>Solicite um novo link de assinatura à clínica.</p>
      </div>
    );
  }

  if (uiState === 'completed' || (step === 'done' && confirmation)) {
    return (
      <div className="ctr-public-sign" data-testid="public-sign-v2-completed">
        <h1>Assinatura registrada</h1>
        <p>Obrigado. Sua assinatura foi registrada com evidências técnicas.</p>
        {confirmation?.evidenceHashAbbrev ? (
          <p className="ctr-hint">Referência: {confirmation.evidenceHashAbbrev}</p>
        ) : null}
      </div>
    );
  }

  if (uiState === 'declined' || (step === 'done' && !confirmation)) {
    return (
      <div className="ctr-public-sign" data-testid="public-sign-v2-declined">
        <h1>Assinatura recusada</h1>
        <p>Sua recusa foi registrada.</p>
      </div>
    );
  }

  return (
    <div className="ctr-public-sign" data-testid="public-sign-v2-page">
      <header className="ctr-public-sign-header">
        <h1>{session?.documentTitle || 'Assinatura de documento'}</h1>
        <p>{session?.clinicDisplayName || 'Clínica'}</p>
        {session?.signerRole ? (
          <p className="ctr-hint">Papel: {session.signerRole}</p>
        ) : null}
      </header>

      {error ? (
        <div className="ctr-section" role="alert" data-testid="public-sign-v2-error">{error}</div>
      ) : null}

      {loading ? <p className="ctr-hint">Carregando…</p> : null}

      {step === 'view' ? (
        <section className="ctr-section space-y-3" data-testid="public-sign-v2-step-view">
          <p>Revise o documento antes de continuar.</p>
          <button type="button" className="ctr-btn" onClick={handleViewDocument} disabled={loading}>
            Visualizar documento
          </button>
        </section>
      ) : null}

      {step === 'auth' ? (
        <section className="ctr-section space-y-3" data-testid="public-sign-v2-step-auth">
          <p>Confirme sua identidade com o código enviado (simulado neste ambiente técnico).</p>
          {!challengeId ? (
            <button type="button" className="ctr-btn" onClick={handleRequestOtp} disabled={loading}>
              Solicitar código
            </button>
          ) : (
            <>
              <label className="ctr-label" htmlFor="otp-input">
                Código de verificação
                <input
                  id="otp-input"
                  className="ctr-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value)}
                  data-testid="public-sign-v2-otp-input"
                />
              </label>
              <button type="button" className="ctr-btn" onClick={handleVerifyOtp} disabled={loading}>
                Validar código
              </button>
            </>
          )}
        </section>
      ) : null}

      {step === 'terms' ? (
        <section className="ctr-section space-y-3" data-testid="public-sign-v2-step-terms">
          <p>Leia e aceite os termos obrigatórios.</p>
          <ul className="space-y-2">
            {(requiredTerms || []).map((t) => (
              <li key={t.id}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(termAcceptance[t.id])}
                    onChange={(e) => setTermAcceptance((prev) => ({
                      ...prev,
                      [t.id]: e.target.checked,
                    }))}
                  />
                  <span>{t.label}{t.required ? ' *' : ''}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="ctr-btn" onClick={handleAcceptTerms} disabled={loading}>
            Continuar
          </button>
        </section>
      ) : null}

      {step === 'sign' ? (
        <section className="ctr-section space-y-3" data-testid="public-sign-v2-step-sign">
          {documentHtml ? (
            <div
              className="ctr-doc-preview border border-slate-200 rounded p-3 text-sm max-h-64 overflow-auto"
              dangerouslySetInnerHTML={{ __html: documentHtml }}
            />
          ) : null}
          <p className="ctr-hint text-sm">
            A assinatura gráfica abaixo integra o conjunto de evidências do documento
            (hash, termos aceitos, autenticação e metadados técnicos).
          </p>
          <canvas
            ref={canvasRef}
            width={320}
            height={120}
            className="border border-slate-300 bg-white w-full max-w-md touch-none"
            data-testid="public-sign-v2-canvas"
            onMouseDown={startDraw}
            onMouseMove={(e) => { if (drawing.current) paintCanvas(e); }}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={(e) => { if (drawing.current) paintCanvas(e); }}
            onTouchEnd={endDraw}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="ctr-btn" onClick={handleSign} disabled={loading}>
              Assinar documento
            </button>
            <button
              type="button"
              className="ctr-btn"
              onClick={handleDecline}
              disabled={loading || declining}
              data-testid="public-sign-v2-decline"
            >
              Recusar
            </button>
          </div>
        </section>
      ) : null}

      <footer className="ctr-hint text-xs">
        Etapa {STEPS.indexOf(step) + 1} de {STEPS.length - 1}
      </footer>
    </div>
  );
}
