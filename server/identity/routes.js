import { Router } from 'express';
import { DISABLE_REASONS, REACTIVATION_REASONS } from './constants.js';
import { isMissingIdentitiesTableError } from './identityRepository.js';

function jsonError(res, err, fallback = 'Não foi possível concluir a operação.') {
  const message = String(err?.message || fallback);
  return res.status(400).json({ ok: false, message, error: message });
}

/**
 * Router montado em app.use('/internal/app', identityRoutes(deps))
 * Paths relativos: /identities, /identity-health, etc.
 */
export default function identityRoutes({
  identityService,
  requireAppUser,
  getTenantAdminActorOrThrow,
  resolveClientIp,
  normalizeText,
  normalizeEmail,
}) {
  const router = Router();

  router.get('/identities', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.query?.tenant_id);
      const actor = await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const { identities, total } = await identityService.repo.listByTenant(actor.tenant_id, {
        limit: Number(req.query?.limit) || 100,
        offset: Number(req.query?.offset) || 0,
        health: normalizeText(req.query?.health) || null,
        status: normalizeText(req.query?.status) || null,
      });
      const summary = await identityService.repo.countByHealth(actor.tenant_id);
      return res.json({ ok: true, identities, total, summary });
    } catch (err) {
      if (isMissingIdentitiesTableError(err)) {
        return res.status(501).json({
          ok: false,
          message: 'Módulo de identidades não instalado. Aplique a migration 008_app_identities.sql.',
        });
      }
      return jsonError(res, err);
    }
  });

  router.get('/identity-health', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.query?.tenant_id);
      const actor = await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const summary = await identityService.repo.countByHealth(actor.tenant_id);
      return res.json({ ok: true, summary });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.post('/identity-health/evaluate', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      const actor = await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const result = await identityService.evaluateIdentityHealth({
        tenantId: actor.tenant_id,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.get('/identities/:id', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.query?.tenant_id);
      const actor = await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const identity = await identityService.repo.findById(normalizeText(req.params.id), actor.tenant_id);
      if (!identity) return res.status(404).json({ ok: false, message: 'Identidade não encontrada.' });
      const health = await identityService.getIdentityHealth({
        identityId: identity.id,
        tenantId: actor.tenant_id,
      });
      return res.json({ ok: true, identity, health });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.get('/identities/:id/events', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.query?.tenant_id);
      const actor = await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const events = await identityService.repo.listEvents(
        normalizeText(req.params.id),
        actor.tenant_id,
        Number(req.query?.limit) || 50,
      );
      return res.json({ ok: true, events });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.post('/identities/provision', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const result = await identityService.provisionIdentity({
        actorAuthUserId: req.appAuthUser.id,
        tenantId,
        collaboratorId: normalizeText(req.body?.collaborator_id),
        collaboratorFullName: normalizeText(req.body?.collaborator_full_name || req.body?.full_name),
        email: normalizeEmail(req.body?.email),
        profileRole: req.body?.profile_role || req.body?.role,
        sendInvite: req.body?.send_invite !== false,
        repairStaleAuth: true,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.status(200).json({ ok: true, identity: result.identity, ...result.formatted });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.post('/identities/:id/repair', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const result = await identityService.repairIdentity({
        identityId: normalizeText(req.params.id),
        tenantId,
        actorAuthUserId: req.appAuthUser.id,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.json({
        ok: true,
        identity: result.identity,
        message: 'Acesso reparado com sucesso.',
        ...result.formatted,
      });
    } catch (err) {
      return jsonError(res, err, 'Não foi possível reparar o acesso. Tente novamente.');
    }
  });

  router.post('/identities/:id/resend-invite', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const result = await identityService.resendInvite({
        identityId: normalizeText(req.params.id),
        tenantId,
        actorAuthUserId: req.appAuthUser.id,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.json({
        ok: true,
        identity: result.identity,
        message: result.formatted?.message || 'Convite reenviado.',
        email_sent: result.formatted?.emailSent,
      });
    } catch (err) {
      return jsonError(res, err, 'Não foi possível reenviar o convite.');
    }
  });

  router.post('/identities/:id/reset-password', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const result = await identityService.resetPassword({
        identityId: normalizeText(req.params.id),
        tenantId,
        actorAuthUserId: req.appAuthUser.id,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.json({
        ok: true,
        identity: result.identity,
        message: result.message || `Link de redefinição enviado para: ${result.identity?.email}`,
      });
    } catch (err) {
      return jsonError(res, err, 'Não foi possível enviar o e-mail de redefinição.');
    }
  });

  router.post('/identities/:id/deactivate', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const identity = await identityService.deactivateIdentity({
        identityId: normalizeText(req.params.id),
        tenantId,
        actorAuthUserId: req.appAuthUser.id,
        reason: normalizeText(req.body?.reason),
        reasonDescription: normalizeText(req.body?.reason_description),
        expectedReturnAt: req.body?.expected_return_at || null,
        suspended: req.body?.suspended === true,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.json({ ok: true, identity, message: 'Acesso desativado.' });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.post('/identities/:id/reactivate', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const identity = await identityService.reactivateIdentity({
        identityId: normalizeText(req.params.id),
        tenantId,
        actorAuthUserId: req.appAuthUser.id,
        reason: normalizeText(req.body?.reason),
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.json({ ok: true, identity, message: 'Acesso reativado.' });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.post('/identities/:id/revoke-sessions', requireAppUser, async (req, res) => {
    try {
      const tenantId = normalizeText(req.body?.tenant_id);
      await getTenantAdminActorOrThrow(req.appAuthUser.id, tenantId);
      const result = await identityService.revokeSessions({
        identityId: normalizeText(req.params.id),
        tenantId,
        actorAuthUserId: req.appAuthUser.id,
        actor: { id: req.appAuthUser.id, email: req.appAuthUser.email, ip: resolveClientIp(req) },
      });
      return res.json({ ok: true, ...result, message: 'Sessões revogadas.' });
    } catch (err) {
      return jsonError(res, err);
    }
  });

  router.get('/identity/reasons', requireAppUser, (_req, res) => {
    res.json({
      ok: true,
      disable_reasons: DISABLE_REASONS,
      reactivation_reasons: REACTIVATION_REASONS,
    });
  });

  return router;
}

/** @deprecated Use default export identityRoutes() + app.use('/internal/app', router) */
export function registerIdentityRoutes(app, deps) {
  app.use('/internal/app', identityRoutes(deps));
}
