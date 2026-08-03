/**
 * Phase 4.10 Wave 3I — POST /internal/platform/tenants/:tenantId/resend-access
 * Operação explícita resendAccessInvite (convite expirado / Auth existente).
 */

import { resendAccessInvite } from './resendAccessInvite.js';
import { findAuthUserByEmail } from '../../email/accessEmailHelpers.js';
import { sendClinicOwnerAccessEmail } from '../../email/sendClinicOwnerAccessEmail.js';
import { provisionClinicOwnerAccess } from '../../clinicOwnerAccessDispatch.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

/** Normaliza role_slug da Console: SUPER_ADMIN / super-admin → super_admin. */
function normalizePlatformRole(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function canResendAccessRole(role) {
  return role === 'owner' || role === 'super_admin' || role === 'system';
}

function mapHttpStatus(code) {
  switch (code) {
    case 'TENANT_NOT_FOUND':
    case 'MEMBERSHIP_NOT_FOUND':
      return 404;
    case 'TENANT_INACTIVE':
    case 'EMAIL_MISMATCH':
    case 'OTHER_TENANT_LINK':
    case 'VALIDATION':
    case 'INVALID_REDIRECT':
      return 400;
    case 'RATE_LIMIT':
      return 429;
    case 'SMTP_UNAVAILABLE':
      return 502;
    default:
      return 400;
  }
}

export function createResendAccessHandler(deps) {
  const {
    supabase,
    normalizeEmail,
    normalizeDatabaseError,
    insertAuditLog,
    getSupabaseHost,
  } = deps;

  return async function handleResendAccess(req, res) {
    try {
      const tenantId = normalizeText(req.params?.tenantId);
      if (!tenantId) {
        return res.status(400).json({ error: 'tenantId é obrigatório.', code: 'VALIDATION' });
      }

      const role = normalizePlatformRole(
        req.platformActor?.role || req.platformActor?.role_slug,
      );
      if (!canResendAccessRole(role)) {
        console.warn('[resend-access] forbidden role', {
          role,
          actorId: req.platformActor?.id || null,
          actorEmail: req.platformActor?.email || null,
        });
        return res.status(403).json({
          error: 'Somente owner ou super_admin pode reenviar acesso.',
          code: 'FORBIDDEN',
        });
      }

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .select('id, trade_name, legal_name, owner_email, status')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantError) throw tenantError;
      if (!tenant?.id) {
        const host = typeof getSupabaseHost === 'function' ? getSupabaseHost() : null;
        return res.status(404).json({
          error:
            'Clínica não encontrada neste projeto Supabase da Admin API.'
            + (host ? ` Host atual: ${host}.` : '')
            + ' Alinhe SUPABASE_URL do backend com a Platform Console.',
          code: 'TENANT_NOT_FOUND',
          supabaseHost: host || undefined,
        });
      }

      const { data: legalProfile, error: legalError } = await supabase
        .from('tenant_legal_profiles')
        .select('legal_representative_name, legal_representative_email')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (legalError) throw legalError;

      const bodyEmail = normalizeEmail(req.body?.email || '');
      const accessEmail = normalizeEmail(
        bodyEmail
        || legalProfile?.legal_representative_email
        || tenant.owner_email,
      );
      if (!accessEmail) {
        return res.status(400).json({
          error: 'E-mail de acesso não encontrado para esta clínica.',
          code: 'VALIDATION',
        });
      }

      const fullName = normalizeText(
        legalProfile?.legal_representative_name || tenant.trade_name || tenant.legal_name,
      );

      const result = await resendAccessInvite(
        {
          supabase,
          sendClinicOwnerAccessEmail,
          provisionClinicOwnerAccess,
          findAuthUserByEmail,
        },
        {
          tenantId,
          email: accessEmail,
          fullName,
          roleSlug: 'master',
          tenantUserId: normalizeText(req.body?.tenantUserId) || null,
          redirectTo: normalizeText(req.body?.redirectTo) || null,
          actorUserId: req.platformActor?.id || null,
        },
      );

      if (result.accessEmailSent || result.sent) {
        await supabase
          .from('tenant_legal_profiles')
          .update({ onboarding_email_sent_at: new Date().toISOString() })
          .eq('tenant_id', tenantId);
      }

      await insertAuditLog({
        actor: req.platformActor,
        action: 'tenant.access.resent',
        targetType: 'tenant',
        targetId: tenantId,
        tenantId,
        metadata: {
          access_email: accessEmail,
          email_delivery: result.emailDelivery,
          sent: Boolean(result.sent),
          strategy: result.strategy,
          invitation_status: result.invitationStatus,
          previous_invites_invalidated: result.previousInvitesInvalidated,
          supabase_host: typeof getSupabaseHost === 'function' ? getSupabaseHost() : null,
        },
      });

      return res.status(200).json({
        success: true,
        accessEmail,
        ...result,
      });
    } catch (err) {
      console.error('[resend-access]', err?.code || '', err?.message || err);
      const code = err?.code || 'RESEND_FAILED';
      return res.status(mapHttpStatus(code)).json({
        error: normalizeDatabaseError(err, err?.message || 'Falha ao reenviar acesso da clínica.'),
        code,
      });
    }
  };
}
