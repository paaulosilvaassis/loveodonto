import { useMemo, useState } from 'react';
import AccessTab from '../access/AccessTab.jsx';
import { setCollaboratorSystemAccessWithRecovery } from '../../services/collaboratorAccessRecoveryService.js';
import { resolveCollaboratorAccessDisplayStatus } from '../../utils/inviteStatus.js';
import { isTenantSystemAccessActive } from '../../utils/collaboratorAccessManagement.js';

/**
 * Painel unificado da aba Acessos e permissões.
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
  section = 'full',
}) {
  const [busy, setBusy] = useState(false);

  const accessStatus = useMemo(
    () => resolveCollaboratorAccessDisplayStatus(tenantUser),
    [tenantUser],
  );
  const hasTenantRow = Boolean(tenantUser?.id);
  const accessActive = hasTenantRow && isTenantSystemAccessActive(tenantUser);

  const handleToggleSystemAccess = async () => {
    if (!canEdit || busy || !collaborator?.id) return;
    const nextAccess = !accessActive;
    const confirmMessage = nextAccess
      ? 'Reativar o acesso deste colaborador ao sistema?'
      : 'Desativar o acesso deste colaborador ao sistema?';
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    try {
      await setCollaboratorSystemAccessWithRecovery({
        collaboratorId: collaborator.id,
        collaborator,
        tenantUser,
        tenantId,
        currentUser,
        hasSystemAccess: nextAccess,
      });
      onAccessChanged?.();
    } catch (err) {
      onSaveError?.(err?.message || 'Falha na operação de acesso.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="collaborator-permissions-panel">
      <AccessTab
        collaboratorId={collaborator?.id}
        targetUserId={targetUserId}
        tenantUser={tenantUser}
        collaboratorEmail={String(collaborator?.email || tenantUser?.email || '').trim().toLowerCase()}
        saasTenantId={saasTenantId}
        linkedDisplayName={linkedDisplayName}
        currentUser={currentUser}
        canEdit={canEdit}
        accessDisplayStatus={accessStatus}
        onAccessChanged={onAccessChanged}
        onToggleSystemAccess={hasTenantRow ? handleToggleSystemAccess : undefined}
        accessActive={accessActive}
        onGoToProfile={onGoToProfile}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
        section={section}
      />
    </div>
  );
}
