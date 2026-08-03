import { useEffect, useState } from 'react';
import { Panel } from './ConsoleUi.jsx';
import { resendClinicOwnerAccess } from '../services/platformConsoleService.js';

function normalizePlatformRole(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function resolveAccessEmail({ masterAccess, legalProfile, clinic }) {
  return masterAccess?.email
    || legalProfile?.legalRepresentativeEmail
    || clinic?.ownerEmail
    || '';
}

function resolveAccessName({ masterAccess, legalProfile, clinic }) {
  return masterAccess?.fullName
    || legalProfile?.legalRepresentativeName
    || clinic?.ownerName
    || '';
}

function formatDateTime(value) {
  if (!value) return null;
  return String(value).replace('T', ' ').slice(0, 19);
}

/**
 * Deriva rótulo de estado do convite/acesso master para a Console.
 */
export function resolveInviteUiStatus({ masterAccess, legalProfile, lastResult }) {
  if (lastResult?.accessEmailSent || lastResult?.sent) return 'Reenviado';
  const invitationStatus = String(masterAccess?.invitationStatus || '').toLowerCase();
  if (invitationStatus === 'accepted') return 'Aceito';
  if (invitationStatus === 'expired') return 'Expirado';
  if (invitationStatus === 'sent' || invitationStatus === 'pending') return 'Enviado';
  if (masterAccess?.authLinked && legalProfile?.onboardingEmailSentAt) return 'Enviado';
  if (legalProfile?.onboardingEmailSentAt) return 'Enviado';
  return 'Pendente';
}

export default function ConsoleMasterAccessPanel({
  clinic,
  legalProfile,
  masterAccess,
  platformUser,
  canManage = false,
  onResent,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const profile = platformUser || null;
  const role = normalizePlatformRole(profile?.role || profile?.role_slug);
  const isOwner = role === 'owner';
  const isSuperAdmin = role === 'super_admin';
  const canResendAccess = Boolean(canManage) && (isOwner || isSuperAdmin);

  useEffect(() => {
    console.log({
      profile,
      role: profile?.role_slug || profile?.role,
      isOwner,
      isSuperAdmin,
      canResendAccess,
    });
  }, [profile, isOwner, isSuperAdmin, canResendAccess]);

  const accessEmail = resolveAccessEmail({ masterAccess, legalProfile, clinic });
  const accessName = resolveAccessName({ masterAccess, legalProfile, clinic });
  const accessRole = masterAccess?.role || 'master';
  const inviteStatus = resolveInviteUiStatus({ masterAccess, legalProfile, lastResult: result });
  const lastSentAt = formatDateTime(
    result?.invitationSentAt
    || legalProfile?.onboardingEmailSentAt,
  );

  const handleResend = async () => {
    if (!canResendAccess || !clinic?.id || saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await resendClinicOwnerAccess(platformUser, clinic.id, {
        email: accessEmail,
        tenantUserId: masterAccess?.id || undefined,
      });
      setResult(response);
      onResent?.(response);
    } catch (err) {
      setError(err?.message || 'Falha ao reenviar acesso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="acesso-master">
      <Panel
        title="Acesso master ao SaaS"
        description="Usuário administrador da clínica no Love Odonto — acesso total ao sistema provisionado."
        actions={canResendAccess ? (
          <button
            type="button"
            className="pc-button pc-button--active"
            disabled={saving || !accessEmail}
            onClick={handleResend}
          >
            {saving ? 'Enviando…' : 'Reenviar acesso'}
          </button>
        ) : null}
      >
        <ul className="pc-info-list">
          <li><span>Responsável</span><strong>{accessName || '—'}</strong></li>
          <li><span>E-mail de acesso</span><strong>{accessEmail || '—'}</strong></li>
          <li><span>Papel</span><strong>{accessRole}</strong></li>
          <li><span>Conta no Auth</span><strong>{masterAccess?.authLinked ? 'Vinculada' : 'Pendente'}</strong></li>
          <li><span>Estado do convite</span><strong>{inviteStatus}</strong></li>
          <li><span>Último envio</span><strong>{lastSentAt || '—'}</strong></li>
        </ul>

        {!accessEmail ? (
          <p className="pc-error">Cadastre o e-mail do responsável legal para liberar o acesso master.</p>
        ) : null}

        {error ? <p className="pc-error">{error}</p> : null}

        {result ? (
          <div className="pc-review-grid">
            {result.accessEmailSent || result.sent ? (
              <p className="pc-success">
                {result.message
                  || `Novo e-mail de acesso enviado com sucesso para ${result.accessEmail || accessEmail}.`}
              </p>
            ) : (
              <p className="pc-error">
                <strong>{result.message || 'E-mail automático não foi enviado. Verifique SMTP do Supabase Auth ou EMAIL_API_KEY.'}</strong>
              </p>
            )}
            {result.invitationExpiresAt ? (
              <p style={{ fontSize: '0.9rem', color: 'var(--pc-muted, #94a3b8)' }}>
                Nova validade do convite: {formatDateTime(result.invitationExpiresAt)}
              </p>
            ) : null}
            {result.setupLink && !(result.accessEmailSent || result.sent) ? (
              <div className="pc-inline-actions">
                <button
                  type="button"
                  className="pc-button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.setupLink);
                  }}
                >
                  Copiar link operacional (e-mail não enviado)
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p style={{ fontSize: '0.9rem', color: 'var(--pc-muted, #94a3b8)' }}>
            Se o convite expirou ou o link foi invalidado, use <strong>Reenviar acesso</strong>.
            O link anterior será invalidado e um novo e-mail será enviado.
          </p>
        )}
      </Panel>
    </div>
  );
}
