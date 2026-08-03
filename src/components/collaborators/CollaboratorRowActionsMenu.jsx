import { useEffect, useRef, useState } from 'react';
import {
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  Shield,
  UserPlus,
  UserX,
} from 'lucide-react';
import {
  provisionCollaboratorSystemAccess,
  resendCollaboratorInvite,
  resolveCollaboratorIdForAccessRequest,
  setCollaboratorSystemAccess,
  removeTenantUserAccess,
} from '../../services/collaboratorAccessProvisionService.js';
import { resolveCollaboratorProfileRole } from '../../utils/collaboratorAccessRole.js';
import { notifyInviteDeliveryResult } from '../../utils/inviteDeliveryFeedback.js';

function copyInviteLink(url) {
  if (!url) return;
  try {
    navigator.clipboard.writeText(url);
  } catch {
    // clipboard indisponível
  }
}

function isAccessActive(tenantUser) {
  return Boolean(tenantUser?.id) && tenantUser.has_system_access !== false;
}

function canResendInvite(tenantUser, email) {
  if (!email) return false;
  if (!tenantUser?.id) return false;
  const status = String(tenantUser.invitation_status || tenantUser.invitation?.status || '').toLowerCase();
  if (['pending', 'sent', 'expired', 'failed'].includes(status)) return true;
  return !tenantUser.user_id;
}

/**
 * Menu de ações da linha — consolida ícones soltos em um único menu (⋯).
 * Mantém as mesmas operações de negócio do fluxo anterior.
 */
export default function CollaboratorRowActionsMenu({
  collaborator,
  tenantUser,
  tenantId,
  isActiveRh,
  canManageAccess = false,
  canEditRh = false,
  disabled = false,
  onView,
  onEdit,
  onEditPermissions,
  onToggleRhStatus,
  onChanged,
  onError,
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const email = String(collaborator?.email || tenantUser?.email || '').trim().toLowerCase();
  const accessActive = isAccessActive(tenantUser);
  const showResend = canManageAccess && canResendInvite(tenantUser, email);
  const showProvision = canManageAccess && !tenantUser?.id && Boolean(email);
  const showAccessToggle = canManageAccess && Boolean(tenantUser?.id);
  const showUnlink = canManageAccess && Boolean(tenantUser?.id);

  const runAction = async (action) => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      await action();
      onChanged?.();
    } catch (err) {
      onError?.(err?.message || 'Falha na operação.');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const handleProvision = () => runAction(async () => {
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

  const handleResend = () => runAction(async () => {
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

  const handleUnlink = () => runAction(async () => {
    if (!tenantUser?.id) return;
    if (!window.confirm('Desvincular o acesso deste colaborador? O usuário deixará de aparecer em Usuários e acessos desta clínica.')) {
      return;
    }
    await removeTenantUserAccess(tenantUser.id, { tenant_id: tenantId });
  });

  return (
    <div className="team-row-menu" ref={menuRef} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="team-row-menu__trigger"
        aria-label="Ações do colaborador"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <MoreHorizontal size={18} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div className="team-row-menu__dropdown" role="menu">
          <button type="button" className="team-row-menu__item" role="menuitem" onClick={() => { setOpen(false); onView?.(); }}>
            <Eye size={15} aria-hidden />
            Ver detalhes
          </button>
          {canEditRh ? (
            <button
              type="button"
              className="team-row-menu__item"
              role="menuitem"
              disabled={busy}
              onClick={() => { setOpen(false); onEdit?.(); }}
            >
              <Pencil size={15} aria-hidden />
              Editar cadastro
            </button>
          ) : null}
          {canManageAccess ? (
            <button
              type="button"
              className="team-row-menu__item"
              role="menuitem"
              disabled={busy}
              onClick={() => { setOpen(false); onEditPermissions?.(); }}
            >
              <Shield size={15} aria-hidden />
              Acessos e permissões
            </button>
          ) : null}
          {showProvision ? (
            <button type="button" className="team-row-menu__item" role="menuitem" disabled={busy} onClick={handleProvision}>
              <UserPlus size={15} aria-hidden />
              Criar acesso e enviar convite
            </button>
          ) : null}
          {showResend ? (
            <button type="button" className="team-row-menu__item" role="menuitem" disabled={busy} onClick={handleResend}>
              <Mail size={15} aria-hidden />
              Reenviar convite
            </button>
          ) : null}
          {showAccessToggle ? (
            <button type="button" className="team-row-menu__item" role="menuitem" disabled={busy} onClick={handleToggleAccess}>
              <UserX size={15} aria-hidden />
              {accessActive ? 'Desativar acesso' : 'Reativar acesso'}
            </button>
          ) : null}
          {showUnlink ? (
            <button type="button" className="team-row-menu__item team-row-menu__item--danger" role="menuitem" disabled={busy} onClick={handleUnlink}>
              <UserX size={15} aria-hidden />
              Desvincular acesso
            </button>
          ) : null}
          {canEditRh ? (
            <button
              type="button"
              className="team-row-menu__item team-row-menu__item--danger"
              role="menuitem"
              disabled={busy}
              onClick={() => { setOpen(false); onToggleRhStatus?.(); }}
            >
              <UserX size={15} aria-hidden />
              {isActiveRh ? 'Desativar colaborador' : 'Reativar colaborador'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
