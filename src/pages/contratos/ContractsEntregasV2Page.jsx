/**
 * Harness de entregas / convites v2 — Phase 10.11.
 * Delivery simulado. OTP/token somente via harness técnico.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPublicSignaturesV2Harness,
  isPublicSignaturesV2UiEnabled,
  mapPublicSignaturesV2Error,
  setPublicSignaturesV2HarnessForTests,
} from '../../services/publicSignaturesV2Service.js';
import { createSignaturePublicV2Harness } from '../../domain/contracts/signatures/signature-public-v2.harness.ts';

const DELIVERY_PERMS = [
  'contract_signatures:view',
  'contract_signatures:send_invitation',
  'contract_signatures:resend_invitation',
  'contract_signatures:view_delivery',
  'contract_signatures:revoke_session',
  'contract_signatures:view_public_harness',
  'contract_signatures:create_envelope',
  'contract_signatures:manage_signers',
  'contract_signatures:send',
];

export default function ContractsEntregasV2Page() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [fixture, setFixture] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [channel, setChannel] = useState('TECHNICAL_HARNESS');
  const [destination, setDestination] = useState('paciente.assinatura.demo@example.com');
  const [publicLink, setPublicLink] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [harnessOtp, setHarnessOtp] = useState('');
  const [lifecycle, setLifecycle] = useState([]);

  const enabled = useMemo(() => isPublicSignaturesV2UiEnabled(), []);
  const harness = useMemo(() => getPublicSignaturesV2Harness(), [ready]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const pushLife = (text) => {
    setLifecycle((prev) => [...prev, { at: new Date().toISOString(), text }]);
  };

  const handleError = useCallback((err) => {
    const mapped = mapPublicSignaturesV2Error(err);
    setError(mapped.message);
    showToast(mapped.message, 'error');
  }, []);

  const ensureHarness = useCallback(async () => {
    let h = getPublicSignaturesV2Harness();
    if (!h) {
      h = await createSignaturePublicV2Harness({
        deterministicOtp: '654321',
        origin: `${window.location.protocol}//${window.location.host}`,
      });
      setPublicSignaturesV2HarnessForTests(h);
    }
    setReady(true);
    return h;
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        await ensureHarness();
        if (!cancelled) pushLife('Harness de entregas v2 inicializado.');
      } catch (err) {
        if (!cancelled) handleError(err);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, ensureHarness, handleError]);

  const refreshDeliveries = async (envelopeId, h = harness) => {
    if (!h || !envelopeId) return;
    const list = await h.deliveryRepo.listByEnvelope(h.tenantId, envelopeId);
    setDeliveries(list);
  };

  const createInviteFixture = async () => {
    try {
      const h = await ensureHarness();
      const result = await h.prepareInviteFixture({
        channel,
        destination,
        policyId: 'pol_demo_otp',
      });
      setFixture(result);
      setPublicLink(result.publicLink);
      setTokenId(result.tokenId);
      setChallengeId('');
      setHarnessOtp('');
      await refreshDeliveries(result.envelope.id, h);
      pushLife(`Convite simulado: ${result.deliveryAttempt.id} (${result.deliveryAttempt.status})`);
      showToast('Fixture de convite criada');
    } catch (err) {
      handleError(err);
    }
  };

  const copyLocalLink = async () => {
    if (!publicLink) return;
    try {
      await navigator.clipboard.writeText(publicLink);
      showToast('Link copiado (somente local)');
      pushLife('Link público copiado para área de transferência.');
    } catch {
      showToast('Não foi possível copiar', 'error');
    }
  };

  const openPublicPage = () => {
    if (!publicLink) return;
    window.open(publicLink, '_blank', 'noopener,noreferrer');
    pushLife('Página pública aberta em nova aba.');
  };

  const resendInvitation = async () => {
    if (!fixture || !harness) return;
    try {
      const invite = await harness.invitationService.sendInvitation({
        tenantId: harness.tenantId,
        envelopeId: fixture.envelope.id,
        signerId: fixture.signer.id,
        channel,
        origin: harness.origin,
        expiresAt: fixture.envelope.expiresAt || new Date(Date.now() + 72 * 3600_000).toISOString(),
        destination,
        clinicDisplayName: 'Clínica Demo',
        documentTitle: harness.contract.title,
        idempotencyKey: `resend_${Date.now()}`,
        revokePreviousSessionTokenId: tokenId,
      });
      setTokenId(invite.tokenId);
      setPublicLink(`${harness.origin}${invite.publicPath}`);
      if (invite.token) {
        setFixture((prev) => (prev ? { ...prev, token: invite.token, tokenId: invite.tokenId } : prev));
      }
      await refreshDeliveries(fixture.envelope.id);
      pushLife(`Reenvio simulado (#${invite.deliveryAttempt.attemptNumber})`);
      showToast('Reenvio simulado');
    } catch (err) {
      handleError(err);
    }
  };

  const simulateFail = async () => {
    if (!harness) return;
    harness.deliveryFailNext.invitation = true;
    try {
      await resendInvitation();
    } catch (err) {
      handleError(err);
    } finally {
      harness.deliveryFailNext.invitation = false;
    }
  };

  const revokeSession = async () => {
    if (!harness || !tokenId) return;
    try {
      await harness.tokenService.revoke(tokenId);
      pushLife(`Sessão revogada: ${tokenId}`);
      showToast('Sessão revogada');
    } catch (err) {
      handleError(err);
    }
  };

  const requestChallengeHarness = async () => {
    if (!fixture?.token || !harness) return;
    try {
      const ch = await harness.signerService.requestAuthenticationChallenge({
        token: fixture.token,
        method: 'OTP_EMAIL',
      });
      setChallengeId(ch.challengeId);
      await harness.invitationService.recordChallengeDelivery({
        tenantId: harness.tenantId,
        envelopeId: fixture.envelope.id,
        signerId: fixture.signer.id,
        channel: 'TECHNICAL_HARNESS',
        challengeId: ch.challengeId,
        testOnlyPlainCode: ch.testOnlyPlainCode,
        idempotencyKey: `harness_chal_${ch.challengeId}`,
      });
      const otp = harness.getOtpFromHarness(ch.challengeId);
      setHarnessOtp(otp || '');
      await refreshDeliveries(fixture.envelope.id);
      pushLife(`Challenge registrado (OTP disponível no harness).`);
    } catch (err) {
      handleError(err);
    }
  };

  const revealInviteToken = () => {
    if (!harness || !tokenId) return;
    const token = harness.getInviteToken(tokenId);
    if (token) {
      pushLife('Token recuperado do harness (não exibido em log).');
      showToast('Token disponível no harness técnico');
      setFixture((prev) => (prev ? { ...prev, token } : prev));
    }
  };

  if (!enabled) {
    return (
      <div className="ctr-page" data-testid="entregas-v2-unavailable">
        <h2 className="ctr-section-title">Entregas v2</h2>
        <p>Este módulo não está habilitado neste ambiente.</p>
      </div>
    );
  }

  return (
    <div className="ctr-page space-y-4" data-testid="contracts-entregas-v2-page">
      <header>
        <h2 className="ctr-section-title">Entregas v2 (harness)</h2>
        <p className="ctr-hint">
          Convites e delivery simulados. Sem e-mail/SMS real. OTP e token apenas no harness técnico.
        </p>
        <p className="ctr-hint text-xs">
          Permissões esperadas: {DELIVERY_PERMS.join(', ')}
        </p>
      </header>

      {error ? (
        <div className="ctr-section" role="alert">{error}</div>
      ) : null}
      {toast ? (
        <div className={`ctr-toast ctr-toast-${toast.type}`}>{toast.message}</div>
      ) : null}

      <section className="ctr-section space-y-2">
        <label className="ctr-label" htmlFor="delivery-channel">Canal simulado</label>
        <select
          id="delivery-channel"
          className="ctr-input"
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          data-testid="entregas-v2-channel"
        >
          <option value="TECHNICAL_HARNESS">TECHNICAL_HARNESS</option>
          <option value="EMAIL">EMAIL (simulado)</option>
          <option value="SMS">SMS (simulado)</option>
          <option value="IN_PERSON">IN_PERSON</option>
        </select>
        <label className="ctr-label" htmlFor="delivery-destination">
          Destino (mascarado na entrega)
          <input
            id="delivery-destination"
            className="ctr-input"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            data-testid="entregas-v2-destination"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ctr-btn" onClick={createInviteFixture} data-testid="entregas-v2-create">
            Criar fixture de convite
          </button>
          <button type="button" className="ctr-btn" onClick={copyLocalLink} disabled={!publicLink}>
            Copiar link local
          </button>
          <button type="button" className="ctr-btn" onClick={openPublicPage} disabled={!publicLink}>
            Abrir página pública
          </button>
          <button type="button" className="ctr-btn" onClick={resendInvitation} disabled={!fixture}>
            Reenviar convite
          </button>
          <button type="button" className="ctr-btn" onClick={simulateFail} disabled={!fixture}>
            Simular falha
          </button>
          <button type="button" className="ctr-btn" onClick={revokeSession} disabled={!tokenId}>
            Revogar sessão
          </button>
          <button type="button" className="ctr-btn" onClick={revealInviteToken} disabled={!tokenId}>
            Token do harness
          </button>
          <button type="button" className="ctr-btn" onClick={requestChallengeHarness} disabled={!fixture?.token}>
            OTP via harness
          </button>
        </div>
      </section>

      {fixture ? (
        <section className="ctr-section space-y-1" data-testid="entregas-v2-fixture">
          <p><strong>Envelope:</strong> {fixture.envelope.id}</p>
          <p><strong>Signatário:</strong> {fixture.signer.name}</p>
          <p><strong>Destino mascarado:</strong> {fixture.deliveryAttempt.destinationMasked || '—'}</p>
          <p><strong>Link local:</strong> {publicLink ? publicLink.replace(/\/assinar\/v2\/[^/]+$/, '/assinar/v2/[token]') : '—'}</p>
          <p><strong>Token ID:</strong> {tokenId || '—'}</p>
        </section>
      ) : null}

      {deliveries.length ? (
        <section className="ctr-section" data-testid="entregas-v2-deliveries">
          <h3>Tentativas de entrega</h3>
          <ul>
            {deliveries.map((d) => (
              <li key={d.id}>
                #{d.attemptNumber} {d.purpose} — {d.channel} — {d.status}
                {d.destinationMasked ? ` → ${d.destinationMasked}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {harnessOtp && challengeId ? (
        <section className="ctr-section" data-testid="entregas-v2-otp-harness">
          <h3>OTP (somente harness)</h3>
          <p className="ctr-hint font-mono">{harnessOtp}</p>
          <p className="ctr-hint text-xs">Challenge: {challengeId}</p>
        </section>
      ) : null}

      <section className="ctr-section" data-testid="entregas-v2-lifecycle">
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
