/**
 * Endpoints internos de modelos de contrato v2 — Phase 10.4.
 * Feature flags OFF por padrão. Sem fallback para tabelas legadas.
 */

function parseBool(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isContractTemplatesV2ApiEnabled(env = process.env) {
  return (
    parseBool(env.CONTRACTS_DOMAIN_V2_ENABLED)
    || parseBool(env.VITE_CONTRACTS_DOMAIN_V2_ENABLED)
  ) && (
    parseBool(env.CONTRACT_TEMPLATES_V2_ENABLED)
    || parseBool(env.VITE_CONTRACT_TEMPLATES_V2_ENABLED)
  );
}

function resolveTenantId(req) {
  return (
    req.tenantContext?.tenantId
    || req.tenantContext?.tenantUser?.tenant_id
    || null
  );
}

function resolveActor(req) {
  const perms = req.tenantContext?.permissions
    || req.appAuthUser?.permissions
    || [];
  return {
    userId: req.appAuthUser?.id || 'unknown',
    displayName: req.appAuthUser?.email,
    permissions: Array.isArray(perms) ? perms : [],
  };
}

function mapError(error) {
  const code = error?.domainError?.code || error?.code || 'INVALID_INPUT';
  const message = error?.domainError?.message || error?.message || 'Erro.';
  if (code === 'FEATURE_FLAG_DISABLED') {
    return { status: 403, body: { error: message, code } };
  }
  if (code === 'PERMISSION_DENIED') {
    return { status: 403, body: { error: message, code } };
  }
  if (code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE') {
    return {
      status: 501,
      body: {
        error: 'O módulo de modelos v2 ainda não está disponível neste ambiente.',
        code,
      },
    };
  }
  if (code === 'CONTRACT_NOT_FOUND') {
    return { status: 404, body: { error: message, code } };
  }
  if (code === 'TENANT_REQUIRED' || code === 'TENANT_MISMATCH') {
    return { status: 400, body: { error: message, code } };
  }
  return { status: 400, body: { error: message, code } };
}

/**
 * @param {object} deps
 * @param {() => object} deps.getService — retorna ContractTemplateApplicationService
 * @param {(flag: boolean) => boolean} [deps.isEnabled] — override de flag (testes)
 */
export function createContractTemplatesV2Handlers(deps = {}) {
  const isEnabled = deps.isEnabled || (() => isContractTemplatesV2ApiEnabled());
  const getService = deps.getService;

  async function withGuard(req, res, permission, run) {
    try {
      if (!isEnabled()) {
        return res.status(403).json({
          error: 'Modelos v2 desabilitados neste ambiente.',
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
      if (!getService) {
        return res.status(501).json({
          error: 'O módulo de modelos v2 ainda não está disponível neste ambiente.',
          code: 'CONTRACTS_V2_STORAGE_UNAVAILABLE',
        });
      }
      const service = getService();
      const actor = resolveActor(req);
      if (permission && !(actor.permissions || []).includes(permission)) {
        return res.status(403).json({
          error: `Permissão necessária: ${permission}.`,
          code: 'PERMISSION_DENIED',
        });
      }
      // Ignora tenantId do body como fonte de verdade
      return await run({ req, res, tenantId, actor, service });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json(mapped.body);
    }
  }

  return {
    list: (req, res) => withGuard(req, res, 'contract_templates:view', async ({ tenantId, actor, service }) => {
      const result = await service.listTemplates(tenantId, {
        search: req.query?.search,
        documentType: req.query?.documentType,
        status: req.query?.status,
        includeArchived: parseBool(req.query?.includeArchived),
      }, actor);
      return res.json(result);
    }),

    create: (req, res) => withGuard(req, res, 'contract_templates:create', async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const created = await service.createTemplate(tenantId, {
        name: body.name,
        description: body.description,
        documentType: body.documentType,
        category: body.category,
        procedureCodes: body.procedureCodes,
        specialtyCodes: body.specialtyCodes,
        isDefault: body.isDefault,
        requirements: body.requirements,
        signaturePolicyId: body.signaturePolicyId,
        initialContentSchema: body.initialContentSchema,
      }, actor);
      return res.status(201).json(created);
    }),

    get: (req, res) => withGuard(req, res, 'contract_templates:view', async ({ tenantId, actor, service }) => {
      const details = await service.getTemplate(tenantId, req.params.id, actor);
      if (!details) {
        return res.status(404).json({ error: 'Modelo não encontrado.', code: 'CONTRACT_NOT_FOUND' });
      }
      return res.json(details);
    }),

    patch: (req, res) => withGuard(req, res, 'contract_templates:update_draft', async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updated = await service.updateTemplateDraft(tenantId, req.params.id, body, actor);
      return res.json(updated);
    }),

    duplicate: (req, res) => withGuard(req, res, 'contract_templates:duplicate', async ({ tenantId, actor, service }) => {
      const created = await service.duplicateTemplate(tenantId, req.params.id, actor);
      return res.status(201).json(created);
    }),

    archive: (req, res) => withGuard(req, res, 'contract_templates:archive', async ({ tenantId, actor, service }) => {
      const archived = await service.archiveTemplate(tenantId, req.params.id, actor);
      return res.json(archived);
    }),

    listVersions: (req, res) => withGuard(req, res, 'contract_templates:view_history', async ({ tenantId, actor, service }) => {
      const details = await service.getTemplate(tenantId, req.params.id, actor);
      if (!details) {
        return res.status(404).json({ error: 'Modelo não encontrado.', code: 'CONTRACT_NOT_FOUND' });
      }
      return res.json({ items: details.versions });
    }),

    createVersion: (req, res) => withGuard(req, res, 'contract_templates:update_draft', async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const version = await service.createVersion(tenantId, req.params.id, body, actor);
      return res.status(201).json(version);
    }),

    getVersion: (req, res) => withGuard(req, res, 'contract_templates:view', async ({ tenantId, actor, service }) => {
      // versionId isolado — resolve via listagem não disponível sem templateId;
      // exige query templateId para isolamento.
      const templateId = req.query?.templateId;
      if (!templateId) {
        return res.status(400).json({
          error: 'templateId é obrigatório na query.',
          code: 'TEMPLATE_REQUIRED',
        });
      }
      const details = await service.getTemplate(tenantId, templateId, actor);
      const version = details?.versions?.find((v) => v.id === req.params.versionId);
      if (!version) {
        return res.status(404).json({ error: 'Versão não encontrada.', code: 'CONTRACT_NOT_FOUND' });
      }
      return res.json(version);
    }),

    patchVersion: (req, res) => withGuard(req, res, 'contract_templates:update_draft', async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const templateId = body.templateId || req.query?.templateId;
      if (!templateId) {
        return res.status(400).json({ error: 'templateId é obrigatório.', code: 'TEMPLATE_REQUIRED' });
      }
      const version = await service.updateVersionDraft(
        tenantId,
        templateId,
        req.params.versionId,
        body,
        actor,
      );
      return res.json(version);
    }),

    reviewVersion: (req, res) => withGuard(req, res, 'contract_templates:review', async ({ tenantId, actor, service }) => {
      const templateId = req.body?.templateId || req.query?.templateId;
      if (!templateId) {
        return res.status(400).json({ error: 'templateId é obrigatório.', code: 'TEMPLATE_REQUIRED' });
      }
      const version = await service.submitVersionForReview(
        tenantId,
        templateId,
        req.params.versionId,
        actor,
      );
      return res.json(version);
    }),

    publishVersion: (req, res) => withGuard(req, res, 'contract_templates:publish', async ({ tenantId, actor, service }) => {
      const templateId = req.body?.templateId || req.query?.templateId;
      const changeSummary = req.body?.changeSummary;
      if (!templateId) {
        return res.status(400).json({ error: 'templateId é obrigatório.', code: 'TEMPLATE_REQUIRED' });
      }
      const result = await service.publishVersion(
        tenantId,
        templateId,
        req.params.versionId,
        { changeSummary },
        actor,
      );
      return res.json(result);
    }),

    validateVersion: (req, res) => withGuard(req, res, 'contract_templates:view', async ({ tenantId, actor, service }) => {
      const templateId = req.body?.templateId || req.query?.templateId;
      if (!templateId) {
        return res.status(400).json({ error: 'templateId é obrigatório.', code: 'TEMPLATE_REQUIRED' });
      }
      const result = await service.validateVersion(
        tenantId,
        templateId,
        req.params.versionId,
        actor,
      );
      return res.json(result);
    }),

    previewVersion: (req, res) => withGuard(req, res, 'contract_templates:view', async ({ tenantId, actor, service }) => {
      const templateId = req.body?.templateId || req.query?.templateId;
      if (!templateId) {
        return res.status(400).json({ error: 'templateId é obrigatório.', code: 'TEMPLATE_REQUIRED' });
      }
      const result = await service.previewVersion(
        tenantId,
        templateId,
        req.params.versionId,
        actor,
      );
      return res.json(result);
    }),
  };
}
