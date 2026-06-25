import { useMemo, useState } from 'react';
import AccessTab from '../access/AccessTab.jsx';
import { setCollaboratorSystemAccess } from '../../services/collaboratorAccessProvisionService.js';
import { resolveCollaboratorAccessDisplayStatus } from '../../utils/inviteStatus.js';

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
  const accessActive = hasTenantRow && tenantUser?.has_system_access !== false;

  const handleDeactivateAccess = async () => {
    if (!canEdit || busy || !collaborator?.id) return;
    if (!window.confirm('Desativar o acesso deste colaborador ao sistema?')) return;
    setBusy(true);
    try {
      await setCollaboratorSystemAccess(collaborator.id, {
        tenant_id: tenantId,
        has_system_access: false,
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
        onDeactivateAccess={hasTenantRow && accessActive ? handleDeactivateAccess : undefined}
        onGoToProfile={onGoToProfile}
        onSaveSuccess={onSaveSuccess}
        onSaveError={onSaveError}
        section={section}
      />
    </div>
  );
}
