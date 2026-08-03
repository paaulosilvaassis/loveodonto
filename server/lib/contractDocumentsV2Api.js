/**
 * Endpoints técnicos de documentos/PDF v2 — Phase 10.7.
 * Flags OFF por padrão. Storage in-memory apenas via harness injetado.
 */

function parseBool(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isContractDocumentsV2ApiEnabled(env = process.env) {
  const domain = parseBool(env.CONTRACTS_DOMAIN_V2_ENABLED)
    || parseBool(env.VITE_CONTRACTS_DOMAIN_V2_ENABLED);
  const module = parseBool(env.CONTRACTS_MODULE_V2_ENABLED)
    || parseBool(env.VITE_CONTRACTS_MODULE_V2_ENABLED);
  const versioning = parseBool(env.CONTRACT_VERSIONING_ENABLED)
    || parseBool(env.VITE_CONTRACT_VERSIONING_ENABLED);
  const pdf = parseBool(env.CONTRACT_PDF_V2_ENABLED)
    || parseBool(env.VITE_CONTRACT_PDF_V2_ENABLED);
  const storage = parseBool(env.CONTRACT_STORAGE_V2_ENABLED)
    || parseBool(env.VITE_CONTRACT_STORAGE_V2_ENABLED);
  return domain && module && versioning && pdf && storage;
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
  if (code === 'CONTRACT_FILE_NOT_FOUND' || code === 'CONTRACT_NOT_FOUND') {
    return { status: 404, body: { error: message, code } };
  }
  if (code === 'CONTRACT_FILE_STORAGE_UNAVAILABLE' || code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE') {
    return {
      status: 501,
      body: {
        error: 'Documentos/PDF v2 ainda não estão disponíveis neste ambiente.',
        code: 'CONTRACT_FILE_STORAGE_UNAVAILABLE',
      },
    };
  }
  return { status: 400, body: { error: message, code } };
}

export function createContractDocumentsV2Handlers(deps = {}) {
  const isEnabled = deps.isEnabled || (() => isContractDocumentsV2ApiEnabled());
  const getPipeline = deps.getPipeline;
  const getStorage = deps.getStorage;
  const getContractLookup = deps.getContractLookup;
  const getEnvelopeLookup = deps.getEnvelopeLookup;

  async function withGuard(req, res, permission, run) {
    try {
      if (!isEnabled()) {
        return res.status(403).json({
          error: 'Documentos/PDF v2 desabilitados neste ambiente.',
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
      if (!getPipeline || !getStorage) {
        return res.status(501).json({
          error: 'Documentos/PDF v2 ainda não estão disponíveis neste ambiente.',
          code: 'CONTRACT_FILE_STORAGE_UNAVAILABLE',
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
        pipeline: getPipeline(),
        storage: getStorage(),
        contractLookup: getContractLookup ? getContractLookup() : null,
        envelopeLookup: getEnvelopeLookup ? getEnvelopeLookup() : null,
      });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json(mapped.body);
    }
  }

  return {
    renderVersion: (req, res) => withGuard(req, res, 'contracts:generate_pdf', async ({ tenantId, actor, pipeline, contractLookup }) => {
      if (!contractLookup) {
        return res.status(501).json({
          error: 'Documentos/PDF v2 ainda não estão disponíveis neste ambiente.',
          code: 'CONTRACT_FILE_STORAGE_UNAVAILABLE',
        });
      }
      const contract = await contractLookup.getContract(tenantId, req.params.id);
      const version = await contractLookup.getVersion(tenantId, req.params.versionId);
      if (!contract || !version) {
        return res.status(404).json({ error: 'Contrato/versão não encontrados.', code: 'CONTRACT_NOT_FOUND' });
      }
      // Render sem persistir PDF — gera unsigned e retorna metadados
      const result = await pipeline.generateUnsignedArtifacts(tenantId, contract, version, actor);
      return res.json({
        htmlSha256: result.html.sha256,
        pdfSha256: result.pdf.artifact.sha256,
        fileId: result.file.id,
        technicalDemo: true,
        verificationCodePresent: Boolean(result.verificationCode),
      });
    }),

    generateUnsignedPdf: (req, res) => withGuard(req, res, 'contracts:generate_pdf', async ({ tenantId, actor, pipeline, contractLookup }) => {
      if (!contractLookup) {
        return res.status(501).json({ code: 'CONTRACT_FILE_STORAGE_UNAVAILABLE', error: 'Indisponível.' });
      }
      const contract = await contractLookup.getContract(tenantId, req.params.id);
      const version = await contractLookup.getVersion(tenantId, req.params.versionId);
      if (!contract || !version) {
        return res.status(404).json({ error: 'Não encontrado.', code: 'CONTRACT_NOT_FOUND' });
      }
      const result = await pipeline.generateUnsignedArtifacts(tenantId, contract, version, actor);
      return res.status(201).json({
        file: result.file,
        pdfSha256: result.pdf.artifact.sha256,
        htmlSha256: result.html.sha256,
        technicalDemo: true,
      });
    }),

    generateSignedArtifacts: (req, res) => withGuard(req, res, 'contracts:generate_signed_artifacts', async ({ tenantId, actor, pipeline, envelopeLookup }) => {
      if (!envelopeLookup) {
        return res.status(501).json({ code: 'CONTRACT_FILE_STORAGE_UNAVAILABLE', error: 'Indisponível.' });
      }
      const ctx = await envelopeLookup.getCompletedEnvelopeContext(tenantId, req.params.id);
      if (!ctx) {
        return res.status(404).json({ error: 'Envelope não encontrado.', code: 'SIGNATURE_ENVELOPE_NOT_FOUND' });
      }
      const result = await pipeline.generateSignedArtifacts(
        tenantId,
        ctx.contract,
        ctx.version,
        ctx.envelope,
        ctx.signers,
        ctx.policy,
        ctx.evidences,
        actor,
      );
      return res.status(201).json({
        files: result.files,
        evidenceReportHash: result.evidenceReport.reportHash,
        manifestHash: result.manifest.manifestHash,
        effects: result.effects,
        technicalDemo: true,
      });
    }),

    listFiles: (req, res) => withGuard(req, res, 'contracts:view_files', async ({ tenantId, storage }) => {
      const items = await storage.listByContract(tenantId, req.params.id);
      return res.json({ items, total: items.length });
    }),

    getFile: (req, res) => withGuard(req, res, 'contracts:view_files', async ({ tenantId, storage }) => {
      const file = await storage.findById(tenantId, req.params.fileId);
      if (!file) {
        return res.status(404).json({ error: 'Arquivo não encontrado.', code: 'CONTRACT_FILE_NOT_FOUND' });
      }
      return res.json(file);
    }),

    verifyFile: (req, res) => withGuard(req, res, 'contracts:verify_integrity', async ({ tenantId, storage }) => {
      const result = await storage.verifyIntegrity(tenantId, req.params.fileId);
      return res.json(result);
    }),

    downloadFile: (req, res) => withGuard(req, res, 'contracts:download', async ({ tenantId, actor, storage }) => {
      const download = await storage.getAuthorizedDownload(tenantId, req.params.fileId, actor);
      // Sem bytes na resposta JSON padrão — apenas metadados + token temporário
      return res.json({
        fileId: download.fileId,
        mimeType: download.mimeType,
        generatedName: download.generatedName,
        sizeBytes: download.sizeBytes,
        sha256: download.sha256,
        temporaryToken: download.temporaryToken,
        expiresAt: download.expiresAt,
        bytesPresent: true,
        // bytes omitidos propositalmente na API JSON
      });
    }),
  };
}
