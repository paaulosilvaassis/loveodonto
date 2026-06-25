import { useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCw, KeyRound, UserX, Shield } from 'lucide-react';
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

export default function CollaboratorAccessManagementCard({
  tenantUser,
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
  onDeactivateAccess,
  auditEvents = [],
  onLoadAudit,
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
          <h3>Gerenciamento de acesso</h3>
        </header>

        <div className="cr-access-mgmt__stats">
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Status da conta</span>
            <span className={accountStatusBadgeClass(accountStatus.key)}>{accountStatus.label}</span>
          </div>
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Data do convite</span>
            <strong>{formatAccessDate(dates.inviteDate)}</strong>
          </div>
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Último acesso</span>
            <strong>{formatAccessDate(dates.lastSignIn)}</strong>
          </div>
          <div className="cr-access-mgmt__stat">
            <span className="cr-access-mgmt__label">Última redefinição de senha</span>
            <strong>{formatAccessDate(dates.lastPasswordReset)}</strong>
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
          {actions.canDeactivate && onDeactivateAccess ? (
            <Button
              variant="secondary"
              size="sm"
              icon={UserX}
              disabled={readOnly || saving}
              onClick={onDeactivateAccess}
            >
              Desativar acesso
            </Button>
          ) : null}
        </div>

        {auditEvents.length > 0 ? (
          <div className="cr-access-mgmt__history">
            <h4>Histórico</h4>
            <ul className="cr-access-mgmt__history-list">
              {auditEvents.slice(0, 5).map((event, index) => (
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
