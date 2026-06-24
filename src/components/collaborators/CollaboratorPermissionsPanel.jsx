import { useMemo, useState } from 'react';
import Button from '../Button.jsx';
import AccessTab from '../access/AccessTab.jsx';
import {
  provisionCollaboratorSystemAccess,
  resendCollaboratorInvite,
  setCollaboratorSystemAccess,
} from '../../services/collaboratorAccessProvisionService.js';
import { resolveCollaboratorProfileRole, isCollaboratorEmailValid } from '../../utils/collaboratorAccessRole.js';
import {
  inviteStatusBadgeClass,
  resolveCollaboratorAccessDisplayStatus,
} from '../../utils/inviteStatus.js';
import { notifyInviteDeliveryResult } from '../../utils/inviteDeliveryFeedback.js';
import { Mail, UserCheck, UserPlus, UserX } from 'lucide-react';

function copyInviteLink(url) {
  if (!url) return;
  try {
    navigator.clipboard.writeText(url);
  } catch {
    // clipboard indisponível
  }
}

/**
 * Painel unificado: status de acesso, ações SaaS e matriz de permissões (AccessTab).
 */
export default function CollaboratorPermissionsPanel({
  collaborator,
  tenantUser,
  tenantId,
  currentUser,
  canEdit,
  targetUserId,
  saasTenantId,
  linkedDisplayName,
  onSaveSuccess,
  onSaveError,
  onAccessChanged,
  onGoToProfile,
}) {
  const [busy, setBusy] = useState(false);

  const email = String(
    collaborator?.email || tenantUser?.email || '',
  ).trim().toLowerCase();
  const accessStatus = useMemo(
    () => resolveCollaboratorAccessDisplayStatus(tenantUser),
    [tenantUser],
  );
  const hasTenantRow = Boolean(tenantUser?.id);
  const accessActive = hasTenantRow && tenantUser?.has_system_access !== false;
  const canProvision = !hasTenantRow && isCollaboratorEmailValid(email);
  const inviteStatus = String(tenantUser?.invitation_status || tenantUser?.invitation?.status || '').toLowerCase();
  const canResend = Boolean(
    email
    && (['pending', 'sent', 'expired', 'failed'].includes(inviteStatus) || !tenantUser?.user_id),
  );

  const runAction = async (action) => {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      await action();
      onAccessChanged?.();
    } catch (err) {
      onSaveError?.(err?.message || 'Falha na operação de acesso.');
    } finally {
      setBusy(false);
    }
  };

  const handleProvision = () => runAction(async () => {
    const profileRole = resolveCollaboratorProfileRole({
      rhCategoria: collaborator?.rhCategoria,
      cargo: collaborator?.cargo,
    });
    const result = await provisionCollaboratorSystemAccess({
      tenant_id: tenantId,
      collaborator_id: collaborator?.id,
      collaborator_full_name: collaborator?.nomeCompleto || collaborator?.apelido || email,
      create_system_access: true,
      email,
      profile_role: profileRole,
      send_invite: true,
    });
    notifyInviteDeliveryResult(result?.invite_delivery, {
      onCopyLink: copyInviteLink,
      pushToast: () => {},
    });
  });

  const handleResend = () => runAction(async () => {
    const result = await resendCollaboratorInvite({
      tenant_id: tenantId,
      email,
      collaborator_id: collaborator?.id || tenantUser?.collaborator_id || null,
    });
    notifyInviteDeliveryResult(result?.invite_delivery, {
      onCopyLink: copyInviteLink,
      pushToast: () => {},
    });
  });

  const handleToggleAccess = () => runAction(async () => {
    const nextAccess = !accessActive;
    if (!nextAccess && !window.confirm('Desativar o acesso deste colaborador ao sistema?')) {
      return;
    }
    await setCollaboratorSystemAccess(collaborator.id, {
      tenant_id: tenantId,
      has_system_access: nextAccess,
    });
  });

  return (
    <div className="collaborator-permissions-panel stack">
      <section className="card collaborator-permissions-panel__summary">
        <div className="form-grid collaborator-permissions-panel__summary-grid">
          <div>
            <span className="muted collaborator-permissions-panel__label">Status do acesso</span>
            <div>
              <span className={`access-badge ${inviteStatusBadgeClass(accessStatus.key)}`}>
                {accessStatus.label}
              </span>
            </div>
          </div>
          <div>
            <span className="muted collaborator-permissions-panel__label">E-mail de acesso</span>
            <div>{email || '—'}</div>
          </div>
          <div>
            <span className="muted collaborator-permissions-panel__label">Perfil no sistema</span>
            <div>{tenantUser?.role || '—'}</div>
          </div>
        </div>

        {canEdit ? (
          <div className="collaborator-permissions-panel__actions inline-actions">
            {canProvision ? (
              <Button variant="primary" icon={UserPlus} disabled={busy} onClick={handleProvision}>
                Criar acesso
              </Button>
            ) : null}
            {canResend && hasTenantRow ? (
              <Button variant="secondary" icon={Mail} disabled={busy} onClick={handleResend}>
                Reenviar convite
              </Button>
            ) : null}
            {hasTenantRow ? (
              <Button
                variant="secondary"
                icon={accessActive ? UserX : UserCheck}
                disabled={busy}
                onClick={handleToggleAccess}
              >
                {accessActive ? 'Desativar acesso' : 'Reativar acesso'}
              </Button>
            ) : null}
            {!email && onGoToProfile ? (
              <Button variant="ghost" disabled={busy} onClick={onGoToProfile}>
                Informar e-mail no cadastro
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <AccessTab
        collaboratorId={collaborator?.id}
        targetUserId={targetUserId}
        tenantUser={tenantUser}
        collaboratorEmail={email}
        saasTenantId={saasTenantId}
        linkedDisplayName={linkedDisplayName}
        currentUser={currentUser}
        canEdit={canEdit}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
        onVincularUsuario={onGoToProfile}
      />
    </div>
  );
}
