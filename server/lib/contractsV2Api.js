/**
 * Endpoints técnicos de contratos v2 — Phase 10.5.
 * Flags OFF por padrão. Sem legado / dual-write.
 */

function parseBool(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function isContractsV2ApiEnabled(env = process.env) {
  const domain = parseBool(env.CONTRACTS_DOMAIN_V2_ENABLED)
    || parseBool(env.VITE_CONTRACTS_DOMAIN_V2_ENABLED);
  const module = parseBool(env.CONTRACTS_MODULE_V2_ENABLED)
    || parseBool(env.VITE_CONTRACTS_MODULE_V2_ENABLED);
  const versioning = parseBool(env.CONTRACT_VERSIONING_ENABLED)
    || parseBool(env.VITE_CONTRACT_VERSIONING_ENABLED);
  return domain && module && versioning;
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
  if (code === 'CONTRACTS_V2_STORAGE_UNAVAILABLE') {
    return {
      status: 501,
      body: {
        error: 'O módulo de contratos v2 ainda não está disponível neste ambiente.',
        code,
      },
    };
  }
  if (code === 'CONTRACT_NOT_FOUND') {
    return { status: 404, body: { error: message, code } };
  }
  return { status: 400, body: { error: message, code } };
}

export function createContractsV2Handlers(deps = {}) {
  const isEnabled = deps.isEnabled || (() => isContractsV2ApiEnabled());
  const getService = deps.getService;
  const getPackageService = deps.getPackageService;

  async function withGuard(req, res, permission, run) {
    try {
      if (!isEnabled()) {
        return res.status(403).json({
          error: 'Contratos v2 desabilitados neste ambiente.',
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
          error: 'O módulo de contratos v2 ainda não está disponível neste ambiente.',
          code: 'CONTRACTS_V2_STORAGE_UNAVAILABLE',
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
        service: getService(),
        packageService: getPackageService ? getPackageService() : null,
      });
    } catch (error) {
      const mapped = mapError(error);
      return res.status(mapped.status).json(mapped.body);
    }
  }

  return {
    list: (req, res) => withGuard(req, res, 'contracts:view', async ({ tenantId, actor, service }) => {
      const result = await service.listContracts(tenantId, {
        status: req.query?.status,
        search: req.query?.search,
      }, actor);
      return res.json(result);
    }),

    create: (req, res) => withGuard(req, res, 'contracts:create', async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await service.createDraft(tenantId, body, actor);
      return res.status(201).json(result);
    }),

    get: (req, res) => withGuard(req, res, 'contracts:view', async ({ tenantId, actor, service }) => {
      const details = await service.getContract(tenantId, req.params.id, actor);
      if (!details) {
        return res.status(404).json({ error: 'Contrato não encontrado.', code: 'CONTRACT_NOT_FOUND' });
      }
      return res.json(details);
    }),

    patch: (req, res) => withGuard(req, res, 'contracts:update_draft', async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const updated = await service.updateDraft(tenantId, req.params.id, body, actor);
      return res.json(updated);
    }),

    createVersion: (req, res) => withGuard(req, res, 'contracts:update_draft', async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await service.createVersion(tenantId, req.params.id, body, actor);
      return res.status(201).json(result);
    }),

    lockVersion: (req, res) => withGuard(req, res, 'contracts:review', async ({ tenantId, actor, service }) => {
      const version = await service.lockVersion(
        tenantId,
        req.params.id,
        req.params.versionId,
        actor,
      );
      return res.json(version);
    }),

    validate: (req, res) => withGuard(req, res, 'contracts:view', async ({ tenantId, actor, service }) => {
      const target = req.body?.targetStatus || req.query?.targetStatus || 'READY_FOR_REVIEW';
      const result = await service.validateReadiness(tenantId, req.params.id, target, actor);
      return res.json(result);
    }),

    transition: (req, res) => withGuard(req, res, null, async ({ tenantId, actor, service }) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await service.transitionStatus(tenantId, req.params.id, body, actor);
      return res.json(result);
    }),

    listPackages: (req, res) => withGuard(req, res, 'contracts:view', async ({ tenantId, packageService }) => {
      if (!packageService) {
        return res.status(501).json({
          error: 'O módulo de contratos v2 ainda não está disponível neste ambiente.',
          code: 'CONTRACTS_V2_STORAGE_UNAVAILABLE',
        });
      }
      const items = await packageService.packageRepository?.list?.(tenantId);
      // package service doesn't expose list — use validate path via create only in tests
      return res.json({ items: items || [] });
    }),

    createPackage: (req, res) => withGuard(req, res, 'contracts:create', async ({ tenantId, actor, packageService }) => {
      if (!packageService) {
        return res.status(501).json({
          error: 'O módulo de contratos v2 ainda não está disponível neste ambiente.',
          code: 'CONTRACTS_V2_STORAGE_UNAVAILABLE',
        });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await packageService.createPackage(tenantId, body, actor);
      return res.status(201).json(result);
    }),

    getPackage: (req, res) => withGuard(req, res, 'contracts:view', async ({ tenantId, packageService }) => {
      if (!packageService?.packageRepository) {
        return res.status(501).json({
          error: 'O módulo de contratos v2 ainda não está disponível neste ambiente.',
          code: 'CONTRACTS_V2_STORAGE_UNAVAILABLE',
        });
      }
      const pkg = await packageService.packageRepository.findById(tenantId, req.params.id);
      if (!pkg) {
        return res.status(404).json({ error: 'Package não encontrado.', code: 'CONTRACT_NOT_FOUND' });
      }
      return res.json(pkg);
    }),

    validatePackage: (req, res) => withGuard(req, res, 'contracts:view', async ({ tenantId, packageService }) => {
      if (!packageService) {
        return res.status(501).json({
          error: 'O módulo de contratos v2 ainda não está disponível neste ambiente.',
          code: 'CONTRACTS_V2_STORAGE_UNAVAILABLE',
        });
      }
      const result = await packageService.validatePackage(tenantId, req.params.id);
      return res.json(result);
    }),
  };
}
