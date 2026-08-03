import { useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCw, KeyRound, UserCheck, UserX, Shield, Wrench, LogOut } from 'lucide-react';
import Button from '../Button.jsx';
import ResetPasswordModal from './ResetPasswordModal.jsx';
import {
  accountStatusBadgeClass,
  formatAccessDate,
  resolveAccessManagementActions,
  resolveAccessManagementDates,
  resolveCollaboratorAccountStatus,
} from '../../utils/collaboratorAccessManagement.js';
import { isCollaboratorEmailValid } from '../../utils/collaboratorAccessRole.js';
import { isSaasModeEnabled } from '../../services/saasAuthService.js';

const AUDIT_ACTION_LABELS = {
  password_reset_requested: 'Solicitou redefinição de senha',
  auth_recreated_invite_sent: 'Recriou conta e enviou convite',
};

const IDENTITY_EVENT_LABELS = {
  'identity.created': 'Identidade criada',
  'identity.provisioned': 'Acesso provisionado',
  'identity.repaired': 'Acesso reparado',
  'identity.invite.sent': 'Convite enviado',
  'identity.password.reset.sent': 'Reset de senha enviado',
  'identity.disabled': 'Acesso desativado',
  'identity.reactivated': 'Acesso reativado',
  'identity.session.revoked': 'Sessões revogadas',
  'identity.health.checked': 'Verificação de saúde',
};

export default function CollaboratorAccessManagementCard({
  tenantUser,
  identity = null,
  collaboratorEmail = '',
  saasTenantId,
  collaboratorId,
  linkedDisplayName,
  currentUser,
  canEdit,
  saving = false,
  onSendInvite,
  onResendInvite,
  onResetPassword,
  onToggleSystemAccess,
  onRepairIdentity,
  onRevokeSessions,
  auditEvents = [],
  identityEvents = [],
  onLoadAudit,
  statusLabels = {},
  healthLabels = {},
}) {
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const email = (tenantUser?.email || collaboratorEmail || '').trim().toLowerCase();
  const accountStatus = useMemo(() => resolveCollaboratorAccountStatus(tenantUser), [tenantUser]);
  const dates = useMemo(() => resolveAccessManagementDates(tenantUser), [tenantUser]);
  const actions = useMemo(
    () => resolveAccessManagementActions({
      tenantUser,
      accountStatus,
      hasValidEmail: isCollaboratorEmailValid(email),
    }),
    [tenantUser, accountStatus, email],
  );
  const readOnly = !canEdit;
  const saasMode = isSaasModeEnabled();

  useEffect(() => {
    if (saasMode && email && saasTenantId && onLoadAudit) {
      onLoadAudit();
    }
  }, [saasMode, email, saasTenantId, onLoadAudit]);

  if (!saasMode) return null;

  const handleResetConfirm = async () => {
    await onResetPassword?.();
    setResetModalOpen(false);
  };

  return (
    <>
      <section className="cr-access-mgmt">
        <header className="cr-access-mgmt__head">
          <Shield size={16} aria-hidden />
          <h3>Centro de credenciais</h3>
        </header>

        <div className="cr-access-mgmt__stats">
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Status da conta</span>
            <span className={accountStatusBadgeClass(accountStatus.key)}>
              {identity?.status ? (statusLabels[identity.status] || identity.status) : accountStatus.label}
            </span>
          </div>
          {identity?.invitation_status ? (
            <div className="cr-access-mgmt__stat">
              <span className="cr-access-mgmt__label">Status do convite</span>
              <strong>{identity.invitation_status}</strong>
            </div>
          ) : null}
          {identity?.password_status ? (
            <div className="cr-access-mgmt__stat">
              <span className="cr-access-mgmt__label">Status da senha</span>
              <strong>{identity.password_status}</strong>
            </div>
          ) : null}
          {identity?.identity_health ? (
            <div className="cr-access-mgmt__stat">
              <span className="cr-access-mgmt__label">Saúde da identidade</span>
              <strong className={identity.identity_health === 'healthy' ? 'access-badge on' : 'access-badge off'}>
                {healthLabels[identity.identity_health] || identity.identity_health}
              </strong>
            </div>
          ) : null}
          <div className="cr-access-mgmt__stat cr-access-mgmt__stat--email">
            <span className="cr-access-mgmt__label">E-mail de acesso</span>
            <strong title={email || undefined}>{email || '—'}</strong>
          </div>
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Data do convite</span>
            <strong>{formatAccessDate(identity?.last_invite_sent_at || dates.inviteDate)}</strong>
          </div>
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Último acesso</span>
            <strong>{formatAccessDate(identity?.last_login_at || dates.lastSignIn)}</strong>
          </div>
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Última redefinição de senha</span>
            <strong>{formatAccessDate(identity?.last_password_reset_sent_at || dates.lastPasswordReset)}</strong>
          </div>
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Criado em</span>
            <strong>{formatAccessDate(dates.createdAt)}</strong>
          </div>
        </div>

        <div className="cr-access-mgmt__actions">
          {actions.canSendInvite ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Mail}
              disabled={readOnly || saving}
              onClick={onSendInvite}
            >
              Enviar convite
            </Button>
          ) : null}
          {actions.canResendInvite ? (
            <Button
              variant="secondary"
              size="sm"
              icon={RefreshCw}
              disabled={readOnly || saving}
              onClick={onResendInvite}
            >
              Reenviar convite
            </Button>
          ) : null}
          {actions.canResetPassword ? (
            <Button
              variant="secondary"
              size="sm"
              icon={KeyRound}
              disabled={readOnly || saving}
              onClick={() => setResetModalOpen(true)}
            >
              Redefinir senha
            </Button>
          ) : null}
          {actions.canDeactivate && onToggleSystemAccess ? (
            <Button
              variant="secondary"
              size="sm"
              icon={UserX}
              disabled={readOnly || saving}
              onClick={onToggleSystemAccess}
            >
              Desativar acesso
            </Button>
          ) : null}
          {actions.canActivate && onToggleSystemAccess ? (
            <Button
              variant="secondary"
              size="sm"
              icon={UserCheck}
              disabled={readOnly || saving}
              onClick={onToggleSystemAccess}
            >
              Reativar acesso
            </Button>
          ) : null}
          {onRepairIdentity && identity?.identity_health !== 'healthy' ? (
            <Button
              variant="secondary"
              size="sm"
              icon={Wrench}
              disabled={readOnly || saving}
              onClick={onRepairIdentity}
            >
              Reparar acesso
            </Button>
          ) : null}
          {onRevokeSessions && identity?.auth_user_id ? (
            <Button
              variant="secondary"
              size="sm"
              icon={LogOut}
              disabled={readOnly || saving}
              onClick={onRevokeSessions}
            >
              Revogar sessões
            </Button>
          ) : null}
        </div>

        {(identityEvents.length > 0 || auditEvents.length > 0) ? (
          <div className="cr-access-mgmt__history">
            <h4>Histórico</h4>
            <ul className="cr-access-mgmt__history-list">
              {identityEvents.slice(0, 5).map((event) => (
                <li key={event.id}>
                  <div className="cr-access-mgmt__history-row">
                    <strong>{event.actor_email || 'Sistema'}</strong>
                    <span className="muted">{formatAccessDate(event.created_at)}</span>
                  </div>
                  <p>{IDENTITY_EVENT_LABELS[event.action] || event.message || event.action}</p>
                </li>
              ))}
              {auditEvents.slice(0, Math.max(0, 5 - identityEvents.length)).map((event, index) => (
                <li key={`${event.at}-${index}`}>
                  <div className="cr-access-mgmt__history-row">
                    <strong>{event.actor_name || 'Administrador'}</strong>
                    <span className="muted">{formatAccessDate(event.at)}</span>
                  </div>
                  <p>{event.label || AUDIT_ACTION_LABELS[event.action] || event.action}</p>
                  {event.ip ? <span className="cr-access-mgmt__ip muted">IP: {event.ip}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <ResetPasswordModal
        open={resetModalOpen}
        email={email}
        displayName={linkedDisplayName}
        loading={saving}
        onClose={() => setResetModalOpen(false)}
        onConfirm={handleResetConfirm}
      />
    </>
  );
}
