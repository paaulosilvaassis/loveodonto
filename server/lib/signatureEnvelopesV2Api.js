/**
 * Endpoints técnicos de envelopes de assinatura v2 — Phase 10.6.
 * Flags OFF por padrão. Sem e-mail/SMS/PDF/legado.
 */

function parseBool(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isSignatureEnvelopesV2ApiEnabled(env = process.env) {
  const domain = parseBool(env.CONTRACTS_DOMAIN_V2_ENABLED)
    || parseBool(env.VITE_CONTRACTS_DOMAIN_V2_ENABLED);
  const module = parseBool(env.CONTRACTS_MODULE_V2_ENABLED)
    || parseBool(env.VITE_CONTRACTS_MODULE_V2_ENABLED);
  const versioning = parseBool(env.CONTRACT_VERSIONING_ENABLED)
    || parseBool(env.VITE_CONTRACT_VERSIONING_ENABLED);
  const signature = parseBool(env.CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED)
    || parseBool(env.VITE_CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED);
  return domain && module && versioning && signature;
}

function resolveTenantId(req) {
  return req.tenantContext?.tenantId
    || req.tenantContext?.tenantUser?.tenant_id
    || null;
}

function resolveActor(req) {
  return {
    userId: req.appAuthUser?.id || 'unknown',
    displayName: req.appAuthUser?.email,
    permissions: req.tenantContext?.permissions || req.appAuthUser?.permissions || [],
  };
}

function mapError(error) {
  const code = error?.domainError?.code || error?.code || 'INVALID_INPUT';
  const message = error?.domainError?.message || error?.message || 'Erro.';
  if (code === 'FEATURE_FLAG_DISABLED' || code === 'PERMISSION_DENIED') {
    return { status: 403, body: { error: message, code } };
  }
  if (code === 'SIGNATURE_ENVELOPE_NOT_FOUND' || code === 'SIGNATURE_SIGNER_NOT_FOUND') {
    return { status: 404, body: { error: message, code } };
  }
  if (code === 'SIGNATURE_SESSION_INVALID'
    || code === 'SIGNATURE_SESSION_EXPIRED'
    || code === 'SIGNATURE_SESSION_REVOKED') {
    return { status: 401, body: { error: 'Sessão inválida.', code } };
  }
  if (code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE' || code === 'SIGNATURE_STORAGE_UNAVAILABLE') {
    return {
      status: 501,
      body: {
        error: 'Assinatura interna v2 ainda não está disponível neste ambiente.',
        code: 'SIGNATURE_STORAGE_UNAVAILABLE',
      },
    };
  }
  return { status: 400, body: { error: message, code } };
}

/** Abstração de rate-limit preparada — no-op nesta fase. */
export function createSignatureRateLimitGuard(_options = {}) {
  return {
    async check(_key) {
      return { allowed: true, remaining: 100 };
    },
  };
}

export function createSignatureEnvelopesV2Handlers(deps = {}) {
  const isEnabled = deps.isEnabled || (() => isSignatureEnvelopesV2ApiEnabled());
  const getEnvelopeService = deps.getEnvelopeService;
  const getPolicyService = deps.getPolicyService;
  const getSignerService = deps.getSignerService;
  const rateLimit = deps.rateLimit || createSignatureRateLimitGuard();

  async function withInternalGuard(req, res, permission, run) {
    try {
      if (!isEnabled()) {
        return res.status(403).json({
          error: 'Assinatura interna v2 desabilitada neste ambiente.',
          code: 'FEATURE_FLAG_DISABLED',
        });
      }
      const tenantId = resolveTenantId(req);
      if (!tenantId) {
        return res.status(400).json({
          error: 'tenantId é obrigatório no contexto autenticado.',
          code: 'TENANT_REQUIRED',
        });
      }
      if (!getEnvelopeService) {
        return res.status(501).json({
          error: 'Assinatura interna v2 ainda não está disponível neste ambiente.',
          code: 'SIGNATURE_STORAGE_UNAVAILABLE',
        });
      }
      const actor = resolveActor(req);
      if (permission && !(actor.permissions || []).includes(permission)) {
        return res.status(403).json({
          error: `Permissão necessária: ${permission}.`,
          code: 'PERMISSION_DENIED',
        });
      }
      return await run({
        req,
        res,
        tenantId,
        actor,
        envelopeService: getEnvelopeService(),
        policyService: getPolicyService ? getPolicyService() : null,
      });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json(mapped.body);
    }
  }

  async function withPublicGuard(req, res, run) {
    try {
      if (!isEnabled()) {
        return res.status(403).json({
          error: 'Assinatura interna v2 desabilitada neste ambiente.',
          code: 'FEATURE_FLAG_DISABLED',
        });
      }
      if (!getSignerService) {
        return res.status(501).json({
          error: 'Assinatura interna v2 ainda não está disponível neste ambiente.',
          code: 'SIGNATURE_STORAGE_UNAVAILABLE',
        });
      }
      const token = req.params?.token;
      // Nunca logar token
      const rl = await rateLimit.check(`sig_public:${String(token || '').slice(0, 8)}`);
      if (!rl.allowed) {
        return res.status(429).json({ error: 'Rate limit.', code: 'RATE_LIMITED' });
      }
      return await run({
        req,
        res,
        token,
        signerService: getSignerService(),
      });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json(mapped.body);
    }
  }

  return {
    listPolicies: (req, res) => withInternalGuard(req, res, 'contract_signatures:manage_policies', async ({ tenantId, actor, policyService }) => {
      if (!policyService) {
        return res.status(501).json({
          error: 'Assinatura interna v2 ainda não está disponível neste ambiente.',
          code: 'SIGNATURE_STORAGE_UNAVAILABLE',
        });
      }
      const result = await policyService.listPolicies(tenantId, actor);
      return res.json(result);
    }),

    createPolicy: (req, res) => withInternalGuard(req, res, 'contract_signatures:manage_policies', async ({ tenantId, actor, policyService }) => {
      if (!policyService) {
        return res.status(501).json({
          error: 'Assinatura interna v2 ainda não está disponível neste ambiente.',
          code: 'SIGNATURE_STORAGE_UNAVAILABLE',
        });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const policy = await policyService.createPolicy(tenantId, body, actor);
      return res.status(201).json(policy);
    }),

    listEnvelopes: (req, res) => withInternalGuard(req, res, 'contract_signatures:view', async ({ tenantId, actor, envelopeService }) => {
      const result = await envelopeService.listEnvelopes(tenantId, {
        contractId: req.query?.contractId,
        status: req.query?.status,
      }, actor);
      return res.json(result);
    }),

    createEnvelope: (req, res) => withInternalGuard(req, res, 'contract_signatures:create_envelope', async ({ tenantId, actor, envelopeService }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await envelopeService.createEnvelope(tenantId, body, actor);
      return res.status(201).json(result);
    }),

    getEnvelope: (req, res) => withInternalGuard(req, res, 'contract_signatures:view', async ({ tenantId, actor, envelopeService }) => {
      const details = await envelopeService.getEnvelope(tenantId, req.params.id, actor);
      if (!details) {
        return res.status(404).json({
          error: 'Envelope não encontrado.',
          code: 'SIGNATURE_ENVELOPE_NOT_FOUND',
        });
      }
      return res.json(details);
    }),

    addSigner: (req, res) => withInternalGuard(req, res, 'contract_signatures:manage_signers', async ({ tenantId, actor, envelopeService }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const details = await envelopeService.addSigner(tenantId, req.params.id, body, actor);
      return res.status(201).json(details);
    }),

    markReady: (req, res) => withInternalGuard(req, res, 'contract_signatures:manage_signers', async ({ tenantId, actor, envelopeService }) => {
      const envelope = await envelopeService.markReady(tenantId, req.params.id, actor);
      return res.json(envelope);
    }),

    sendEnvelope: (req, res) => withInternalGuard(req, res, 'contract_signatures:send', async ({ tenantId, actor, envelopeService }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await envelopeService.sendEnvelope(tenantId, req.params.id, actor, {
        idempotencyKey: body.idempotencyKey,
      });
      // Tokens de sessão: apenas harness — mascarar em resposta HTTP padrão
      return res.json({
        ...result,
        issuedSessions: (result.issuedSessions || []).map((s) => ({
          signerId: s.signerId,
          tokenId: s.tokenId,
          tokenPresent: Boolean(s.token),
        })),
        deliverySimulated: true,
      });
    }),

    cancelEnvelope: (req, res) => withInternalGuard(req, res, 'contract_signatures:cancel_envelope', async ({ tenantId, actor, envelopeService }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const envelope = await envelopeService.cancelEnvelope(tenantId, req.params.id, body, actor);
      return res.json(envelope);
    }),

    expireEnvelope: (req, res) => withInternalGuard(req, res, 'contract_signatures:reconcile', async ({ tenantId, actor, envelopeService }) => {
      const envelope = await envelopeService.expireEnvelope(tenantId, req.params.id, actor);
      return res.json(envelope);
    }),

    reconcileEnvelope: (req, res) => withInternalGuard(req, res, 'contract_signatures:reconcile', async ({ tenantId, envelopeService }) => {
      const result = await envelopeService.reconcileEnvelope(tenantId, req.params.id);
      return res.json(result);
    }),

    // Rotas públicas técnicas (harness)
    publicOpen: (req, res) => withPublicGuard(req, res, async ({ token, signerService }) => {
      const result = await signerService.openSigningSession({ token });
      return res.json(result);
    }),

    publicView: (req, res) => withPublicGuard(req, res, async ({ token, signerService }) => {
      const result = await signerService.viewDocument({ token });
      return res.json({
        documentHash: result.documentHash,
        html: result.html,
        signerStatus: result.signer?.status,
      });
    }),

    publicChallenge: (req, res) => withPublicGuard(req, res, async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.requestAuthenticationChallenge({
        token,
        method: body.method || 'OTP_EMAIL',
        idempotencyKey: body.idempotencyKey,
      });
      return res.json({
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        deliverySimulated: true,
        // OTP plain somente se harness expuser — não incluir por padrão na API HTTP
      });
    }),

    publicVerify: (req, res) => withPublicGuard(req, res, async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.verifyAuthenticationChallenge({
        token,
        challengeId: body.challengeId,
        code: body.code,
        idempotencyKey: body.idempotencyKey,
      });
      return res.json({ valid: result.valid, signerStatus: result.signer?.status });
    }),

    publicAccept: (req, res) => withPublicGuard(req, res, async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.acceptRequiredTerms({
        token,
        acceptanceIds: body.acceptanceIds || [],
      });
      return res.json({ signerStatus: result.signer?.status });
    }),

    publicSign: (req, res) => withPublicGuard(req, res, async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.sign({
        token,
        method: body.method || 'CLICK_ACCEPT',
        typedConfirmation: body.typedConfirmation,
        artifactSeed: body.artifactSeed,
        ipAddress: body.ipAddress,
        userAgent: body.userAgent,
        geolocation: body.geolocation,
        idempotencyKey: body.idempotencyKey,
      });
      return res.json({
        envelopeStatus: result.envelope?.status,
        signerStatus: result.signer?.status,
        evidenceHash: result.evidence?.evidenceHash,
        idempotentReplay: result.idempotentReplay,
        effects: result.effects,
      });
    }),

    publicDecline: (req, res) => withPublicGuard(req, res, async ({ req: r, token, signerService }) => {
      const body = r.body && typeof r.body === 'object' ? r.body : {};
      const result = await signerService.decline({
        token,
        reason: body.reason,
        idempotencyKey: body.idempotencyKey,
      });
      return res.json({
        envelopeStatus: result.envelope?.status,
        signerStatus: result.signer?.status,
      });
    }),
  };
}
