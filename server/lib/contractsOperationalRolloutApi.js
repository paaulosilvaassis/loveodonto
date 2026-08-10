/**
 * Phase 10.21C — Operational rollout SSOT via public.feature_flags.
 * GET/PUT/POST — sem migration. Não ativa produção automaticamente.
 */

import {
  CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG,
  CONTRACTS_OPERATIONAL_UX_TENANT_FLAG,
  PRODUCTION_ACTIVATION_PHRASE,
  buildRolloutActorPayload,
  mapFeatureFlagsToRolloutState,
  normalizeRolloutMode,
} from '../../src/domain/contracts/rollout/contracts-operational-rollout-flags.ts';
import { CONTRACTS_OPERATIONAL_MODES } from '../../src/domain/contracts/rollout/contracts-operational-mode.ts';
import { isTenantAdminRole, normalizeRoleValue } from '../core/rbac/roles.js';
import { readExplicitTenantId } from './tenantAdminActor.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function parseBoolEnv(value) {
  const v = String(value ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function isProductionActivationUnlocked() {
  return parseBoolEnv(process.env.CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK)
    || parseBoolEnv(process.env.VITE_CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK);
}

async function loadFlagRows(supabase, tenantId) {
  const [globalRes, tenantRes] = await Promise.all([
    supabase
      .from('feature_flags')
      .select('flag_key, scope_type, scope_ref, enabled, payload, updated_at')
      .eq('flag_key', CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG)
      .eq('scope_type', 'global')
      .maybeSingle(),
    supabase
      .from('feature_flags')
      .select('flag_key, scope_type, scope_ref, enabled, payload, updated_at')
      .eq('flag_key', CONTRACTS_OPERATIONAL_UX_TENANT_FLAG)
      .eq('scope_type', 'tenant')
      .eq('scope_ref', tenantId)
      .maybeSingle(),
  ]);
  if (globalRes.error) throw globalRes.error;
  if (tenantRes.error) throw tenantRes.error;
  return { globalRow: globalRes.data || null, tenantRow: tenantRes.data || null };
}

async function upsertFlag(supabase, row) {
  const { data, error } = await supabase
    .from('feature_flags')
    .upsert(row, { onConflict: 'flag_key,scope_type,scope_ref' })
    .select('flag_key, scope_type, scope_ref, enabled, payload, updated_at')
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function insertPlatformAudit(supabase, entry) {
  try {
    await supabase.from('audit_logs').insert({
      actor_admin_id: null,
      actor_role: entry.role || 'clinic_admin',
      action: entry.action,
      target_type: 'contracts_operational_rollout',
      target_id: entry.tenantId || null,
      tenant_id: entry.tenantId || null,
      metadata: {
        mode: entry.mode || null,
        reason: entry.reason || null,
        changedByUserId: entry.userId || null,
        globalEnabled: entry.globalEnabled,
        tenantEnabled: entry.tenantEnabled,
      },
    });
  } catch {
    // best-effort — payload.audit já guarda trilha
  }
}

export function createContractsOperationalRolloutHandlers(deps = {}) {
  const {
    supabase,
    getTenantAdminActorOrThrow,
    resolveActiveTenantUser,
    isActiveTenantUserRow,
  } = deps;

  async function resolveMembershipTenant(req) {
    const authUserId = req.appAuthUser?.id;
    const email = req.appAuthUser?.email;
    const explicit = readExplicitTenantId(req, 'both');
    const tenantUser = await resolveActiveTenantUser(authUserId, explicit, email);
    if (!tenantUser?.tenant_id || (isActiveTenantUserRow && !isActiveTenantUserRow(tenantUser))) {
      const err = new Error('Usuário sem vínculo ativo em tenant_users.');
      err.code = 'TENANT_MEMBERSHIP_REQUIRED';
      err.status = 403;
      throw err;
    }
    if (explicit && explicit !== tenantUser.tenant_id) {
      const err = new Error('tenant_id inválido para o usuário autenticado.');
      err.code = 'TENANT_FORBIDDEN';
      err.status = 403;
      throw err;
    }
    return tenantUser;
  }

  async function requireAdminActor(req) {
    const explicit = readExplicitTenantId(req, 'both');
    const actor = await getTenantAdminActorOrThrow(req.appAuthUser.id, explicit, {
      resolveActiveTenantUser,
    });
    const role = normalizeRoleValue(actor.role || actor.role_slug);
    if (!isTenantAdminRole(role)) {
      const err = new Error('Apenas administradores da clínica podem executar esta operação.');
      err.code = 'ADMIN_REQUIRED';
      err.status = 403;
      throw err;
    }
    return { actor, role, tenantId: actor.tenant_id };
  }

  async function readSnapshot(tenantId) {
    const { globalRow, tenantRow } = await loadFlagRows(supabase, tenantId);
    return mapFeatureFlagsToRolloutState(tenantId, globalRow, tenantRow);
  }

  async function handleGet(req, res) {
    try {
      const tenantUser = await resolveMembershipTenant(req);
      const tenantId = tenantUser.tenant_id;
      const snapshot = await readSnapshot(tenantId);
      return res.status(200).json({
        ok: true,
        source: 'feature_flags',
        tenantId,
        state: snapshot.state,
        operationalUxEnabled: snapshot.operationalUxEnabled,
        audit: Array.isArray(snapshot.tenantFlag.payload?.audit)
          ? snapshot.tenantFlag.payload.audit
          : [],
      });
    } catch (err) {
      const status = err.status || (err.code === 'TENANT_MEMBERSHIP_REQUIRED' ? 403 : 400);
      return res.status(status).json({ ok: false, error: err.message, code: err.code || 'ROLLOUT_GET_FAILED' });
    }
  }

  async function handlePut(req, res) {
    try {
      const { actor, role, tenantId } = await requireAdminActor(req);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const bodyTenant = normalizeText(body.tenantId || body.tenant_id);
      if (bodyTenant && bodyTenant !== tenantId) {
        return res.status(403).json({
          ok: false,
          error: 'Não é permitido alterar rollout de outro tenant.',
          code: 'TENANT_FORBIDDEN',
        });
      }

      const { globalRow, tenantRow } = await loadFlagRows(supabase, tenantId);
      const prevTenantPayload = (tenantRow?.payload && typeof tenantRow.payload === 'object')
        ? tenantRow.payload
        : {};
      const prevGlobalPayload = (globalRow?.payload && typeof globalRow.payload === 'object')
        ? globalRow.payload
        : {};

      let tenantEnabled = typeof body.tenantEnabled === 'boolean'
        ? body.tenantEnabled
        : Boolean(tenantRow?.enabled);
      let mode = body.mode != null
        ? normalizeRolloutMode(body.mode)
        : normalizeRolloutMode(prevTenantPayload.mode || CONTRACTS_OPERATIONAL_MODES.OPERATIONAL_UX);

      if (mode === CONTRACTS_OPERATIONAL_MODES.V1_ONLY || mode === CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK) {
        tenantEnabled = false;
      }

      let globalEnabled = Boolean(globalRow?.enabled);
      if (typeof body.productionGlobalEnabled === 'boolean') {
        if (body.productionGlobalEnabled === true) {
          if (!isProductionActivationUnlocked()) {
            return res.status(403).json({
              ok: false,
              error: 'Ativação global bloqueada. Defina CONTRACTS_OPERATIONAL_UX_PRODUCTION_UNLOCK=true.',
              code: 'PRODUCTION_ACTIVATION_LOCKED',
            });
          }
          if (normalizeText(body.confirmationPhrase) !== PRODUCTION_ACTIVATION_PHRASE) {
            return res.status(400).json({
              ok: false,
              error: `Confirmação inválida. Digite exatamente ${PRODUCTION_ACTIVATION_PHRASE}.`,
              code: 'CONFIRMATION_REQUIRED',
            });
          }
          globalEnabled = true;
        } else {
          globalEnabled = false;
        }
      }

      const tenantPayload = buildRolloutActorPayload({
        mode,
        rollbackReason: mode === CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK
          ? (body.rollbackReason || prevTenantPayload.rollbackReason || null)
          : null,
        changedByUserId: actor.user_id || actor.auth_user_id || req.appAuthUser.id,
        changedByRole: role,
        notes: body.note || body.notes || prevTenantPayload.notes || '',
        previousPayload: prevTenantPayload,
        auditAction: 'PUT_TENANT_ROLLOUT',
      });

      const globalPayload = buildRolloutActorPayload({
        mode,
        rollbackReason: null,
        changedByUserId: actor.user_id || actor.auth_user_id || req.appAuthUser.id,
        changedByRole: role,
        notes: prevGlobalPayload.notes || '',
        previousPayload: prevGlobalPayload,
        auditAction: typeof body.productionGlobalEnabled === 'boolean'
          ? (globalEnabled ? 'GLOBAL_ON' : 'GLOBAL_OFF')
          : 'PUT_TENANT_ROLLOUT_TOUCH_GLOBAL',
      });

      // Garante row global existe (default OFF) sem ativar se não pedido.
      await upsertFlag(supabase, {
        flag_key: CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG,
        scope_type: 'global',
        scope_ref: '*',
        enabled: globalEnabled,
        payload: typeof body.productionGlobalEnabled === 'boolean' ? globalPayload : {
          ...prevGlobalPayload,
          changedAt: prevGlobalPayload.changedAt || null,
        },
      });

      await upsertFlag(supabase, {
        flag_key: CONTRACTS_OPERATIONAL_UX_TENANT_FLAG,
        scope_type: 'tenant',
        scope_ref: tenantId,
        enabled: tenantEnabled,
        payload: tenantPayload,
      });

      await insertPlatformAudit(supabase, {
        action: 'contracts.operational_rollout.put',
        tenantId,
        userId: req.appAuthUser.id,
        role,
        mode,
        globalEnabled,
        tenantEnabled,
      });

      const snapshot = await readSnapshot(tenantId);
      return res.status(200).json({
        ok: true,
        source: 'feature_flags',
        tenantId,
        state: snapshot.state,
        operationalUxEnabled: snapshot.operationalUxEnabled,
        audit: snapshot.tenantFlag.payload?.audit || [],
      });
    } catch (err) {
      console.error('[contracts-operational-rollout-put]', err);
      const status = err.status || (err.code === 'ADMIN_REQUIRED' ? 403 : 400);
      return res.status(status).json({ ok: false, error: err.message, code: err.code || 'ROLLOUT_PUT_FAILED' });
    }
  }

  async function handleRollback(req, res) {
    try {
      const { actor, role, tenantId } = await requireAdminActor(req);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const bodyTenant = normalizeText(body.tenantId || body.tenant_id);
      if (bodyTenant && bodyTenant !== tenantId) {
        return res.status(403).json({
          ok: false,
          error: 'Não é permitido rollback de outro tenant.',
          code: 'TENANT_FORBIDDEN',
        });
      }
      const reason = normalizeText(body.reason || body.rollbackReason)
        || 'Rollback emergencial solicitado pelo administrador.';

      const { tenantRow, globalRow } = await loadFlagRows(supabase, tenantId);
      const prevTenantPayload = (tenantRow?.payload && typeof tenantRow.payload === 'object')
        ? tenantRow.payload
        : {};

      const mode = CONTRACTS_OPERATIONAL_MODES.ROLLED_BACK;
      const tenantPayload = buildRolloutActorPayload({
        mode,
        rollbackReason: reason,
        changedByUserId: actor.user_id || actor.auth_user_id || req.appAuthUser.id,
        changedByRole: role,
        notes: prevTenantPayload.notes || '',
        previousPayload: prevTenantPayload,
        auditAction: 'ROLLBACK',
      });

      await upsertFlag(supabase, {
        flag_key: CONTRACTS_OPERATIONAL_UX_TENANT_FLAG,
        scope_type: 'tenant',
        scope_ref: tenantId,
        enabled: false,
        payload: tenantPayload,
      });

      // Kill switch global OFF em emergência (preserva V1; não apaga contratos).
      await upsertFlag(supabase, {
        flag_key: CONTRACTS_OPERATIONAL_UX_GLOBAL_FLAG,
        scope_type: 'global',
        scope_ref: '*',
        enabled: false,
        payload: {
          ...(globalRow?.payload && typeof globalRow.payload === 'object' ? globalRow.payload : {}),
          mode,
          rollbackReason: reason,
          changedByUserId: req.appAuthUser.id,
          changedByRole: role,
          changedAt: new Date().toISOString(),
        },
      });

      await insertPlatformAudit(supabase, {
        action: 'contracts.operational_rollout.rollback',
        tenantId,
        userId: req.appAuthUser.id,
        role,
        mode,
        reason,
        globalEnabled: false,
        tenantEnabled: false,
      });

      const snapshot = await readSnapshot(tenantId);
      return res.status(200).json({
        ok: true,
        source: 'feature_flags',
        tenantId,
        state: snapshot.state,
        operationalUxEnabled: snapshot.operationalUxEnabled,
        audit: snapshot.tenantFlag.payload?.audit || [],
      });
    } catch (err) {
      console.error('[contracts-operational-rollout-rollback]', err);
      const status = err.status || (err.code === 'ADMIN_REQUIRED' ? 403 : 400);
      return res.status(status).json({ ok: false, error: err.message, code: err.code || 'ROLLOUT_ROLLBACK_FAILED' });
    }
  }

  return { handleGet, handlePut, handleRollback };
}
