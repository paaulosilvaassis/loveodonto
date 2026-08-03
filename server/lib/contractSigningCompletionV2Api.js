/**
 * Endpoints técnicos de conclusão SIGNED / ledger v2 — Phase 10.8.
 * Flags OFF por padrão. Sem efeitos externos / event bus / legado.
 */

function parseBool(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isContractSigningCompletionV2ApiEnabled(env = process.env) {
  const flags = [
    env.CONTRACTS_DOMAIN_V2_ENABLED || env.VITE_CONTRACTS_DOMAIN_V2_ENABLED,
    env.CONTRACTS_MODULE_V2_ENABLED || env.VITE_CONTRACTS_MODULE_V2_ENABLED,
    env.CONTRACT_VERSIONING_ENABLED || env.VITE_CONTRACT_VERSIONING_ENABLED,
    env.CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED || env.VITE_CONTRACT_INTERNAL_SIGNATURE_V2_ENABLED,
    env.CONTRACT_PDF_V2_ENABLED || env.VITE_CONTRACT_PDF_V2_ENABLED,
    env.CONTRACT_STORAGE_V2_ENABLED || env.VITE_CONTRACT_STORAGE_V2_ENABLED,
    env.CONTRACT_AUDIT_LEDGER_ENABLED || env.VITE_CONTRACT_AUDIT_LEDGER_ENABLED,
  ];
  return flags.every((f) => parseBool(f));
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
  if (code === 'CONTRACT_NOT_FOUND' || code === 'SIGNATURE_ENVELOPE_NOT_FOUND') {
    return { status: 404, body: { error: message, code } };
  }
  if (code === 'CONTRACT_LEDGER_UNAVAILABLE' || code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE') {
    return {
      status: 501,
      body: {
        error: 'Conclusão/ledger v2 ainda não estão disponíveis neste ambiente.',
        code,
      },
    };
  }
  if (code === 'IDEMPOTENCY_CONFLICT' || code === 'CONTRACT_SIGNED_IDEMPOTENCY_CONFLICT') {
    return { status: 409, body: { error: message, code } };
  }
  return { status: 400, body: { error: message, code } };
}

function sanitizeResult(result) {
  if (!result) return result;
  return {
    contractId: result.contract?.id,
    contractStatus: result.contract?.status,
    versionId: result.version?.id,
    envelopeId: result.envelope?.id,
    signedPdfFileId: result.signedPdf?.id,
    evidenceReportFileId: result.evidenceReport?.id,
    integrityManifestFileId: result.integrityManifest?.id,
    ledgerEntryCount: result.ledgerEntries?.length ?? 0,
    effects: result.effects
      ? Object.fromEntries(
        Object.entries(result.effects).map(([k, v]) => [k, {
          required: v.required,
          ready: v.ready,
          executed: false,
          idempotencyKey: v.idempotencyKey,
        }]),
      )
      : undefined,
    events: (result.events || []).map((e) => ({
      eventType: e.eventType,
      occurredAt: e.occurredAt,
    })),
    idempotentReplay: result.idempotentReplay,
    completedAt: result.completedAt,
  };
}

export function createContractSigningCompletionV2Handlers(deps = {}) {
  const isEnabled = deps.isEnabled || (() => isContractSigningCompletionV2ApiEnabled());
  const getCompletion = deps.getCompletion;
  const getLedger = deps.getLedger;
  const getReconciliation = deps.getReconciliation;

  async function withGuard(req, res, permission, run) {
    try {
      if (!isEnabled()) {
        return res.status(403).json({
          error: 'Conclusão/ledger v2 desabilitados neste ambiente.',
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
      if (!getCompletion) {
        return res.status(501).json({
          error: 'Conclusão/ledger v2 ainda não estão disponíveis neste ambiente.',
          code: 'CONTRACT_LEDGER_UNAVAILABLE',
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
        completion: getCompletion(),
        ledger: getLedger ? getLedger() : null,
        reconciliation: getReconciliation ? getReconciliation() : null,
      });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json(mapped.body);
    }
  }

  return {
    validateSigningCompletion: (req, res) => withGuard(
      req,
      res,
      'contracts:complete_signing',
      async ({ tenantId, completion }) => {
        const body = req.body || {};
        const result = await completion.validateCompletion(tenantId, {
          contractId: req.params.id,
          contractVersionId: body.contractVersionId,
          envelopeId: body.envelopeId,
          signedPdfFileId: body.signedPdfFileId,
          evidenceReportFileId: body.evidenceReportFileId,
          integrityManifestFileId: body.integrityManifestFileId,
          idempotencyKey: body.idempotencyKey || 'validate-only',
          expectedContractRowVersion: body.expectedContractRowVersion,
        });
        return res.json({
          valid: result.valid,
          errors: result.errors?.map((e) => ({ code: e.code, field: e.field })),
          warnings: result.warnings?.map((w) => ({ code: w.code })),
          contractReady: result.contractReady,
          versionReady: result.versionReady,
          envelopeReady: result.envelopeReady,
          evidenceReady: result.evidenceReady,
          signedPdfReady: result.signedPdfReady,
          manifestReady: result.manifestReady,
          ledgerReady: result.ledgerReady,
        });
      },
    ),

    completeSigning: (req, res) => withGuard(
      req,
      res,
      'contracts:complete_signing',
      async ({ tenantId, actor, completion }) => {
        const body = req.body || {};
        const result = await completion.completeSigning(tenantId, {
          contractId: req.params.id,
          contractVersionId: body.contractVersionId,
          envelopeId: body.envelopeId,
          signedPdfFileId: body.signedPdfFileId,
          evidenceReportFileId: body.evidenceReportFileId,
          integrityManifestFileId: body.integrityManifestFileId,
          idempotencyKey: body.idempotencyKey,
          expectedContractRowVersion: body.expectedContractRowVersion,
        }, actor);
        return res.json(sanitizeResult(result));
      },
    ),

    getLedger: (req, res) => withGuard(
      req,
      res,
      'contracts:view_ledger',
      async ({ tenantId, ledger, completion }) => {
        const repo = ledger || completion.getLedgerRepository?.();
        if (!repo) {
          return res.status(501).json({
            error: 'Ledger indisponível.',
            code: 'CONTRACT_LEDGER_UNAVAILABLE',
          });
        }
        const entries = await repo.listByContract(tenantId, req.params.id);
        return res.json({
          contractId: req.params.id,
          entries: entries.map((e) => ({
            id: e.id,
            sequenceNumber: e.sequenceNumber,
            eventType: e.eventType,
            previousEntryHash: e.previousEntryHash,
            entryHash: e.entryHash,
            occurredAt: e.occurredAt,
            source: e.source,
            // payload mínimo — sem HTML/CPF/tokens
            payloadKeys: Object.keys(e.payload || {}),
          })),
        });
      },
    ),

    verifyLedger: (req, res) => withGuard(
      req,
      res,
      'contracts:verify_ledger',
      async ({ tenantId, ledger, completion }) => {
        const repo = ledger || completion.getLedgerRepository?.();
        if (!repo) {
          return res.status(501).json({
            error: 'Ledger indisponível.',
            code: 'CONTRACT_LEDGER_UNAVAILABLE',
          });
        }
        const result = await repo.verifyChain(tenantId, req.params.id);
        return res.json(result);
      },
    ),

    getSignedEffects: (req, res) => withGuard(
      req,
      res,
      'contracts:view_signed_effects',
      async ({ tenantId, completion }) => {
        const contract = await completion.reconcileSigningCompletion(tenantId, req.params.id);
        // effects derivados via retry/complete path — aqui retorna estado reconciliado + hint
        return res.json({
          contractId: req.params.id,
          contractStatus: contract.contractStatus,
          effectsExecuted: false,
          note: 'Efeitos permanecem prepared/não executados nesta fase.',
          reconciliation: {
            inconsistencies: contract.inconsistencies,
            hasSignedLedger: contract.hasSignedLedger,
          },
        });
      },
    ),

    reconcileSignedState: (req, res) => withGuard(
      req,
      res,
      'contracts:reconcile_signed_state',
      async ({ tenantId, actor, reconciliation, completion }) => {
        if (reconciliation) {
          const result = await reconciliation.repairLedgerProjection(
            tenantId,
            req.params.id,
            actor,
          );
          return res.json({
            contractId: result.contractId,
            contractStatus: result.contractStatus,
            ledgerValid: result.ledgerValid,
            hasSignedLedger: result.hasSignedLedger,
            inconsistencies: result.inconsistencies,
            repairPlan: result.repairPlan,
            autoExecuted: false,
          });
        }
        const result = await completion.reconcileSigningCompletion(tenantId, req.params.id);
        return res.json({
          contractId: result.contractId,
          contractStatus: result.contractStatus,
          ledgerValid: result.ledgerValid,
          hasSignedLedger: result.hasSignedLedger,
          inconsistencies: result.inconsistencies,
          repairPlan: result.repairPlan,
          autoExecuted: false,
        });
      },
    ),
  };
}
