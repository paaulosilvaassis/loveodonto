/**
 * Endpoints públicos signatures-v2 — Phase 10.11 + hardening 10.12.
 * Anti-enumeração, CORS allowlist, headers, trust proxy, rate limit.
 * Flags OFF por padrão. Sem e-mail/SMS real.
 * Dependências de domínio são injetadas (Node server não importa .ts diretamente).
 */

import {
  applyContractsV2SecurityHeaders,
  applyPublicSigningCorsHeaders,
  createPersistedHttpRateLimitAdapter,
  evaluatePublicSigningCors,
  getPublicSigningCorsPolicy,
  parseBool,
  resolveTrustedClientAddress,
} from './contractsV2PublicSecurity.js';

const PUBLIC_GENERIC_MESSAGE = 'Não foi possível acessar esta solicitação de assinatura.';
const PUBLIC_GENERIC_CODE = 'SIGNATURE_PUBLIC_ACCESS_DENIED';

export function isPublicSignaturesV2ApiEnabled(env = process.env) {
  const flags = [
    env.CONTRACTS_DOMAIN_V2_ENABLED || env.VITE_CONTRACTS_DOMAIN_V2_ENABLED,
    env.CONTRACTS_MODULE_V2_ENABLED || env.VITE_CONTRACTS_MODULE_V2_ENABLED,
    env.CONTRACT_VERSIONING_ENABLED || env.VITE_CONTRACT_VERSIONING_ENABLED,
    env.CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED || env.VITE_CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED,
    env.CONTRACT_PDF_V2_ENABLED || env.VITE_CONTRACT_PDF_V2_ENABLED,
    env.CONTRACT_STORAGE_V2_ENABLED || env.VITE_CONTRACT_STORAGE_V2_ENABLED,
    env.CONTRACT_AUDIT_LEDGER_ENABLED || env.VITE_CONTRACT_AUDIT_LEDGER_ENABLED,
    env.CONTRACT_PATIENT_PORTAL_ENABLED || env.VITE_CONTRACT_PATIENT_PORTAL_ENABLED,
  ];
  return flags.every((f) => parseBool(f));
}

export function assertPublicSignaturesV2LocalEnvironment(env = process.env) {
  const confirmation = String(env.LOVE_ODONTO_LOCAL_DB_CONFIRMATION || '').trim();
  const localOk = confirmation === 'LOCAL_DISPOSABLE_ONLY'
    || parseBool(env.CONTRACTS_V2_PUBLIC_LOCAL_HARNESS)
    || parseBool(env.VITE_CONTRACTS_V2_PUBLIC_LOCAL_HARNESS)
    || process.env.NODE_ENV !== 'production';
  const forbidden = [
    env.SUPABASE_URL,
    env.VITE_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean).join(' ');
  if (/supabase\.co|uoepkwhqztmsjnzirpev|tckdjyunwmdpqmewrwvt/i.test(forbidden)) {
    return { ok: false, code: 'SIGNATURE_PUBLIC_ORIGIN_NOT_ALLOWED' };
  }
  if (!localOk) {
    return { ok: false, code: 'SIGNATURE_PUBLIC_ORIGIN_NOT_ALLOWED' };
  }
  return { ok: true };
}

export function applyPublicSignatureSecurityHeaders(res) {
  applyContractsV2SecurityHeaders(res);
}

export function resolveTrustedClientIp(req, env = process.env) {
  const resolved = resolveTrustedClientAddress(req, env);
  if (resolved.ip) return resolved.ip;
  // Compat: TRUST_PROXY_LOCAL legado apenas em não-produção / local.
  if (parseBool(env.TRUST_PROXY_LOCAL) && String(env.CONTRACTS_V2_RUNTIME_MODE || '') !== 'staging-disabled') {
    const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff && /^(127\.|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(xff)) {
      return xff;
    }
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

/** Rate-limit HTTP em memória (persistido via adapter injetável nos testes). */
export function createInMemoryHttpSignatureRateLimit(options = {}) {
  const store = options.store || new Map();
  const windowMs = options.windowMs || 60_000;
  const max = options.max || 20;
  return {
    store,
    async check(operation, ctx = {}) {
      const key = `${operation}|${ctx.ipHash || '-'}|${ctx.sessionHint || '-'}`;
      const now = Date.now();
      const row = store.get(key) || { windowStart: now, count: 0 };
      if (now - row.windowStart > windowMs) {
        row.windowStart = now;
        row.count = 0;
      }
      row.count += 1;
      store.set(key, row);
      if (row.count > max) {
        return { allowed: false, remaining: 0 };
      }
      return { allowed: true, remaining: Math.max(0, max - row.count) };
    },
  };
}

export function createInMemoryPublicMetrics() {
  const counters = new Map();
  return {
    increment(name, labels = {}) {
      const key = `${name}|${JSON.stringify(labels)}`;
      counters.set(key, (counters.get(key) || 0) + 1);
    },
    snapshot() {
      return Object.fromEntries(counters.entries());
    },
    reset() { counters.clear(); },
  };
}

function publicDenied(res, metrics, operation, internalCode) {
  metrics.increment('signature_public_invalid_session_total', { operation });
  applyPublicSignatureSecurityHeaders(res);
  return res.status(404).json({
    error: PUBLIC_GENERIC_MESSAGE,
    code: PUBLIC_GENERIC_CODE,
  });
}

function publicRateLimited(res, metrics, operation) {
  metrics.increment('signature_rate_limited_total', { operation });
  applyPublicSignatureSecurityHeaders(res);
  return res.status(429).json({
    error: PUBLIC_GENERIC_MESSAGE,
    code: 'SIGNATURE_HTTP_RATE_LIMIT_EXCEEDED',
  });
}

export function createPublicSignaturesV2Handlers(deps = {}) {
  const isEnabled = deps.isEnabled || (() => isPublicSignaturesV2ApiEnabled());
  const getSignerService = deps.getSignerService;
  const getInvitationService = deps.getInvitationService;
  const getDocumentAccess = deps.getDocumentAccess;
  const metrics = deps.metrics || createInMemoryPublicMetrics();
  const env = deps.env || process.env;
  const runtimeMode = String(env.CONTRACTS_V2_RUNTIME_MODE || 'disabled').trim().toLowerCase();
  const rateLimitMode = String(env.CONTRACTS_V2_RATE_LIMIT_MODE || (
    runtimeMode === 'local-integration' || runtimeMode === 'staging-disabled'
      ? 'persisted'
      : 'memory-test'
  )).trim().toLowerCase();

  let rateLimit = deps.rateLimit;
  if (!rateLimit) {
    if (rateLimitMode === 'persisted' && deps.persistedRateLimitService) {
      rateLimit = createPersistedHttpRateLimitAdapter({
        service: deps.persistedRateLimitService,
      });
    } else if (runtimeMode === 'staging-disabled' && rateLimitMode === 'persisted' && !deps.persistedRateLimitService) {
      rateLimit = {
        async check() {
          return { allowed: false, remaining: 0 };
        },
      };
    } else {
      rateLimit = createInMemoryHttpSignatureRateLimit();
    }
  }

  const corsPolicy = deps.corsPolicy || getPublicSigningCorsPolicy(env);
  const sleepMs = deps.uniformDelayMs ?? 10;

  async function withUniformDelay(fn) {
    const started = Date.now();
    try {
      return await fn();
    } finally {
      const elapsed = Date.now() - started;
      if (elapsed < sleepMs) {
        await new Promise((r) => setTimeout(r, sleepMs - elapsed));
      }
    }
  }

  async function withPublicGuard(req, res, operation, run) {
    return withUniformDelay(async () => {
      applyPublicSignatureSecurityHeaders(res);
      try {
        // staging-disabled: infraestrutura pode existir, mas tráfego público permanece fechado.
        // disabled (default): segue gates de feature flag (comportamento 10.11 / testes).
        if (runtimeMode === 'staging-disabled') {
          return res.status(403).json({
            error: 'Assinatura pública v2 desabilitada neste ambiente.',
            code: 'FEATURE_FLAG_DISABLED',
          });
        }

        const corsDecision = evaluatePublicSigningCors(corsPolicy, {
          origin: req.headers?.origin,
          method: req.method,
        });
        if (!corsDecision.allowed) {
          metrics.increment('signature_public_cors_denied_total', { operation });
          return res.status(403).json({
            error: 'Origem não autorizada.',
            code: 'CONTRACTS_V2_CORS_ORIGIN_DENIED',
          });
        }
        applyPublicSigningCorsHeaders(res, corsPolicy, corsDecision);

        if (!isEnabled()) {
          return res.status(403).json({
            error: 'Assinatura pública v2 desabilitada neste ambiente.',
            code: 'FEATURE_FLAG_DISABLED',
          });
        }
        const envGuard = assertPublicSignaturesV2LocalEnvironment(env);
        if (!envGuard.ok) {
          return publicDenied(res, metrics, operation, envGuard.code);
        }
        if (!getSignerService) {
          return res.status(501).json({
            error: 'Assinatura pública v2 ainda não está disponível neste ambiente.',
            code: 'SIGNATURE_STORAGE_UNAVAILABLE',
          });
        }
        const token = req.params?.token;
        if (!token || String(token).includes('?')) {
          return publicDenied(res, metrics, operation, 'TOKEN_MISSING');
        }
        const addr = resolveTrustedClientAddress(req, env);
        const ipHash = addr.ipHash;
        const rl = await rateLimit.check(operation, {
          ipHash,
          sessionHint: `h_${String(token).length}`,
        });
        if (!rl.allowed) {
          return publicRateLimited(res, metrics, operation);
        }
        return await run({
          req,
          res,
          token,
          ipHash,
          signerService: getSignerService(),
          invitationService: getInvitationService ? getInvitationService() : null,
        });
      } catch (error) {
        const code = error?.domainError?.code || error?.code || '';
        if (code === 'SIGNATURE_RATE_LIMIT_EXCEEDED' || code === 'SIGNATURE_HTTP_RATE_LIMIT_EXCEEDED') {
          return publicRateLimited(res, metrics, operation);
        }
        return publicDenied(res, metrics, operation, code || 'UNKNOWN');
      }
    });
  }

  return {
    metrics,
    publicOpen: (req, res) => withPublicGuard(req, res, 'OPEN_SESSION', async ({ token, signerService }) => {
      const result = await signerService.openSigningSession({ token });
      metrics.increment('signature_public_open_total');
      // Resumo público opcional (snapshot congelado). Sem ledger/evidence/outros signatários.
      return res.json({
        clinicDisplayName: result.clinicDisplayName || 'Clínica (fixture)',
        documentTitle: result.documentTitle || result.envelopeTitle || 'Documento para assinatura',
        signerRole: result.signer?.signerRole || result.signerRole,
        status: result.signer?.status || result.status,
        requiredSteps: result.requiredSteps || ['VIEW', 'AUTHENTICATE', 'ACCEPT', 'SIGN'],
        requiredTerms: result.requiredTerms || [],
        expiresAt: result.expiresAt,
        treatmentSummary: result.treatmentSummary || null,
        financialSummary: result.financialSummary || null,
      });
    }),

    publicView: (req, res) => withPublicGuard(req, res, 'OPEN_SESSION', async ({ token, signerService }) => {
      const result = await signerService.viewDocument({ token });
      if (result.fileType === 'EVIDENCE_REPORT') {
        return publicDenied(res, metrics, 'VIEW', 'EVIDENCE_BLOCKED');
      }
      return res.json({
        documentHashAbbrev: result.documentHash
          ? `${String(result.documentHash).slice(0, 12)}…`
          : undefined,
        html: result.html,
        signerStatus: result.signer?.status,
      });
    }),

    publicDocument: (req, res) => withPublicGuard(req, res, 'OPEN_SESSION', async ({ token, signerService }) => {
      if (getDocumentAccess) {
        const doc = await getDocumentAccess().getAuthorizedDocument({ token });
        if (!doc || doc.blocked || doc.fileType === 'EVIDENCE_REPORT') {
          return publicDenied(res, metrics, 'DOCUMENT', 'UNAVAILABLE');
        }
        applyPublicSignatureSecurityHeaders(res);
        res.setHeader('Content-Type', doc.mimeType || 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="documento.pdf"');
        return res.status(200).send(Buffer.from(doc.bytes));
      }
      const result = await signerService.viewDocument({ token });
      if (result.fileType === 'EVIDENCE_REPORT') {
        return publicDenied(res, metrics, 'DOCUMENT', 'EVIDENCE_BLOCKED');
      }
      return res.json({
        documentHashAbbrev: result.documentHash
          ? `${String(result.documentHash).slice(0, 12)}…`
          : undefined,
        available: true,
        fileType: result.fileType || 'GENERATED_PDF',
      });
    }),

    publicStatus: (req, res) => withPublicGuard(req, res, 'OPEN_SESSION', async ({ token, signerService }) => {
      const result = await signerService.openSigningSession({ token });
      return res.json({
        status: result.signer?.status || result.status,
        envelopeStatus: result.envelope?.status || result.envelopeStatus,
        expiresAt: result.expiresAt,
      });
    }),

    publicChallenge: (req, res) => withPublicGuard(req, res, 'REQUEST_CHALLENGE', async ({ req: r, token, signerService, invitationService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.requestAuthenticationChallenge({
        token,
        method: body.method || 'OTP_EMAIL',
        idempotencyKey: body.idempotencyKey,
      });
      if (invitationService && result.challengeId) {
        try {
          await invitationService.recordChallengeDelivery({
            tenantId: result.tenantId,
            envelopeId: result.envelopeId,
            signerId: result.signerId,
            channel: body.channel || 'TECHNICAL_HARNESS',
            challengeId: result.challengeId,
            testOnlyPlainCode: result.testOnlyPlainCode,
            idempotencyKey: body.idempotencyKey || `chal_${result.challengeId}`,
          });
          metrics.increment('signature_delivery_simulated_total', { purpose: 'AUTH' });
        } catch {
          metrics.increment('signature_delivery_failed_total', { purpose: 'AUTH' });
        }
      }
      metrics.increment('signature_public_challenge_requested_total');
      return res.json({
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        deliverySimulated: true,
      });
    }),

    publicVerify: (req, res) => withPublicGuard(req, res, 'VERIFY_CHALLENGE', async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.verifyAuthenticationChallenge({
        token,
        challengeId: body.challengeId,
        code: body.code,
        idempotencyKey: body.idempotencyKey,
      });
      if (!result.valid) {
        metrics.increment('signature_public_challenge_failed_total');
        return publicDenied(res, metrics, 'VERIFY', result.errorCode || 'AUTH_FAILED');
      }
      metrics.increment('signature_public_authenticated_total');
      return res.json({
        authenticated: true,
        signerStatus: result.signer?.status,
      });
    }),

    publicAccept: (req, res) => withPublicGuard(req, res, 'SIGN', async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const acceptances = Array.isArray(body.acceptances) ? body.acceptances : null;
      if (acceptances) {
        for (const a of acceptances) {
          if (a.required && a.accepted !== true) {
            return publicDenied(res, metrics, 'ACCEPT', 'TERMS_REQUIRED');
          }
        }
        const result = await signerService.acceptRequiredTerms({
          token,
          acceptanceIds: acceptances.filter((a) => a.accepted).map((a) => a.code || a.id),
          acceptances,
          idempotencyKey: body.idempotencyKey,
        });
        return res.json({ signerStatus: result.signer?.status, accepted: true });
      }
      const result = await signerService.acceptRequiredTerms({
        token,
        acceptanceIds: body.acceptanceIds || [],
        idempotencyKey: body.idempotencyKey,
      });
      return res.json({ signerStatus: result.signer?.status, accepted: true });
    }),

    publicSign: (req, res) => withPublicGuard(req, res, 'SIGN', async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.sign({
        token,
        method: body.method || 'CLICK_ACCEPT',
        typedConfirmation: body.typedConfirmation,
        artifactSeed: body.artifactSeed,
        artifactReference: body.artifactReference,
        ipAddress: resolveTrustedClientIp(r, env),
        userAgent: r.headers?.['user-agent'],
        geolocation: body.geolocation,
        idempotencyKey: body.idempotencyKey,
      });
      metrics.increment('signature_public_signed_total');
      return res.json({
        envelopeStatus: result.envelope?.status,
        signerStatus: result.signer?.status,
        evidenceHashAbbrev: result.evidence?.evidenceHash
          ? `${String(result.evidence.evidenceHash).slice(0, 12)}…`
          : undefined,
        idempotentReplay: result.idempotentReplay,
        effectsExecuted: false,
      });
    }),

    publicDecline: (req, res) => withPublicGuard(req, res, 'DECLINE', async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.decline({
        token,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
      });
      metrics.increment('signature_public_declined_total');
      return res.json({
        declined: true,
        envelopeStatus: result.envelope?.status,
        signerStatus: result.signer?.status,
      });
    }),
  };
}
