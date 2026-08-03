import { useEffect, useRef, useState } from 'react';
import { Mail, MoreVertical, Pencil, UserCheck, UserPlus, UserX } from 'lucide-react';
import {
  provisionCollaboratorSystemAccess,
  resendCollaboratorInvite,
  resolveCollaboratorIdForAccessRequest,
  setCollaboratorSystemAccess,
  removeTenantUserAccess,
} from '../../services/collaboratorAccessProvisionService.js';
import { resolveCollaboratorProfileRole } from '../../utils/collaboratorAccessRole.js';
import { notifyInviteDeliveryResult } from '../../utils/inviteDeliveryFeedback.js';

function isAccessActive(tenantUser) {
  return Boolean(tenantUser?.id) && tenantUser.has_system_access !== false;
}

function canResendInvite(tenantUser, email) {
  if (!email) return false;
  if (!tenantUser?.id) return true;
  const status = String(tenantUser.invitation_status || tenantUser.invitation?.status || '').toLowerCase();
  if (['pending', 'sent', 'expired', 'failed'].includes(status)) return true;
  return !tenantUser.user_id;
}

function copyInviteLink(url) {
  if (!url) return;
  try {
    navigator.clipboard.writeText(url);
  } catch {
    // clipboard indisponível — ignorar
  }
}

function CollaboratorAccessActions({
  collaborator,
  tenantUser,
  tenantId,
  canManage = false,
  disabled = false,
  onChanged,
  onError,
  onEditPermissions,
}) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  if (!canManage) return null;

  const email = String(collaborator?.email || tenantUser?.email || '').trim().toLowerCase();
  const active = isAccessActive(tenantUser);
  const showResend = canResendInvite(tenantUser, email);
  const showToggle = Boolean(tenantUser?.id);
  const showProvision = !tenantUser?.id && Boolean(email);
  const showMenu = showResend || showProvision || Boolean(tenantUser?.id);

  const runAction = async (action) => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await action();
      onChanged?.();
    } catch (err) {
      onError?.(err?.message || 'Falha na operação de acesso.');
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  const handleToggleAccess = () => runAction(async () => {
    const nextAccess = !active;
    if (!nextAccess && !window.confirm('Desativar o acesso deste colaborador ao sistema?')) {
      return;
    }
    await setCollaboratorSystemAccess(collaborator.id, {
      tenant_id: tenantId,
      has_system_access: nextAccess,
    });
  });

  const handleResendInvite = () => runAction(async () => {
    const result = await resendCollaboratorInvite({
      tenant_id: tenantId,
      email,
      collaborator_id: resolveCollaboratorIdForAccessRequest({ tenantUser, collaboratorId: collaborator?.id }),
    });
    notifyInviteDeliveryResult(result?.invite_delivery, {
      onCopyLink: copyInviteLink,
      pushToast: () => {},
    });
  });

  const handleProvisionAccess = () => runAction(async () => {
    const profileRole = resolveCollaboratorProfileRole({
      rhCategoria: collaborator?.rhCategoria,
      cargo: collaborator?.cargo,
    });
    const result = await provisionCollaboratorSystemAccess({
      tenant_id: tenantId,
      collaborator_id: collaborator.id,
      collaborator_full_name: collaborator.nomeCompleto || collaborator.apelido || email,
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

  const handleUnlinkAccess = () => runAction(async () => {
    if (!tenantUser?.id) return;
    if (!window.confirm('Desvincular o acesso deste colaborador? O usuário deixará de aparecer em Usuários e acessos desta clínica.')) {
      return;
    }
    await removeTenantUserAccess(tenantUser.id, { tenant_id: tenantId });
  });

  return (
    <div
      className="collaborator-row-actions collaborator-row-actions--icons access-user-row-actions"
      onClick={(event) => event.stopPropagation()}
    >
      {tenantUser?.id ? (
        <button
          type="button"
          className="collaborator-icon-btn"
          title="Editar permissões"
          aria-label="Editar permissões"
          onClick={(event) => {
            event.stopPropagation();
            onEditPermissions?.();
          }}
          disabled={disabled || busy}
        >
          <Pencil size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      {showProvision ? (
        <button
          type="button"
          className="collaborator-icon-btn collaborator-icon-btn--activate"
          title="Criar acesso e enviar convite"
          aria-label="Criar acesso e enviar convite"
          onClick={(event) => {
            event.stopPropagation();
            handleProvisionAccess();
          }}
          disabled={disabled || busy}
        >
          <UserPlus size={16} strokeWidth={2} aria-hidden />
        </button>
      ) : null}

      {showToggle ? (
        <button
          type="button"
          className={`collaborator-icon-btn ${active ? 'collaborator-icon-btn--deactivate' : 'collaborator-icon-btn--activate'}`}
          title={active ? 'Desativar acesso' : 'Ativar acesso'}
          aria-label={active ? 'Desativar acesso' : 'Ativar acesso'}
          onClick={(event) => {
            event.stopPropagation();
            handleToggleAccess();
          }}
          disabled={disabled || busy}
        >
          {active ? (
            <UserX size={16} strokeWidth={2} aria-hidden />
          ) : (
            <UserCheck size={16} strokeWidth={2} aria-hidden />
          )}
        </button>
      ) : null}

      {showMenu ? (
        <div className="access-user-row-menu" ref={menuRef}>
          <button
            type="button"
            className="collaborator-icon-btn"
            title="Ações de convite"
            aria-label="Ações de convite"
            aria-expanded={menuOpen}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            disabled={disabled || busy}
          >
            <MoreVertical size={16} strokeWidth={2} aria-hidden />
          </button>
          {menuOpen ? (
            <div className="access-user-row-menu-dropdown" role="menu">
              {showProvision ? (
                <button
                  type="button"
                  className="access-user-row-menu-item"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleProvisionAccess();
                  }}
                  disabled={disabled || busy}
                >
                  <Mail size={14} aria-hidden />
                  Enviar convite
                </button>
              ) : null}
              {showResend ? (
                <button
                  type="button"
                  className="access-user-row-menu-item"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleResendInvite();
                  }}
                  disabled={disabled || busy}
                >
                  <Mail size={14} aria-hidden />
                  Reenviar convite
                </button>
              ) : null}
              {tenantUser?.id ? (
                <button
                  type="button"
                  className="access-user-row-menu-item"
                  role="menuitem"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleUnlinkAccess();
                  }}
                  disabled={disabled || busy}
                >
                  <UserX size={14} aria-hidden />
                  Desvincular acesso
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default CollaboratorAccessActions;
