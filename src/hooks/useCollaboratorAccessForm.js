import { useMemo, useState, useEffect, useCallback } from 'react';
import {
  getPermissionsCatalog,
  getUserAccess,
  getRoleDefaultPermissionIds,
  updateUserAccess,
  ensureLocalUserForSaasAccess,
  canManageAccess,
  ROLES,
  ROLE_LABELS,
  ROLE_ADMIN,
} from '../services/accessService.js';
import { saveCollaboratorAccessBundle, provisionCollaboratorAccessWithRepair, resendCollaboratorInvite } from '../services/collaboratorAccessProvisionService.js';
import { tenantUserNeedsAuthRepair } from '../utils/collaboratorAccessPanel.js';
import { MODULES_SPEC, ACTION_LABELS } from '../permissions/catalog.js';
import { isSaasModeEnabled } from '../services/saasAuthService.js';
import { isCollaboratorEmailValid } from '../utils/collaboratorAccessRole.js';
import { resolveCollaboratorAccessDisplayStatus } from '../utils/inviteStatus.js';
import { normalizeTenantAccessRole, resolveAccessTargetUserId } from '../utils/collaboratorAccessPanel.js';
import { PERMS_CLIPBOARD_PREFIX } from '../components/collaborators/record/permissions/permissionsConstants.js';

export function useCollaboratorAccessForm({
  collaboratorId,
  targetUserId,
  tenantUser = null,
  collaboratorEmail = '',
  saasTenantId,
  linkedDisplayName,
  currentUser,
  accessDisplayStatus = null,
  onAccessChanged,
}) {
  const [hasSystemAccess, setHasSystemAccess] = useState(true);
  const [role, setRole] = useState('');
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [credEmail, setCredEmail] = useState('');

  const catalog = useMemo(() => getPermissionsCatalog(), []);
  const effectiveTargetUserId = useMemo(
    () => resolveAccessTargetUserId({ localUserId: targetUserId, tenantUser }),
    [targetUserId, tenantUser],
  );
  const roleDefaultIds = useMemo(
    () => (role ? new Set(getRoleDefaultPermissionIds(role)) : new Set()),
    [role],
  );

  useEffect(() => {
    const emailFromTenant = String(tenantUser?.email || collaboratorEmail || '').trim().toLowerCase();

    if (!effectiveTargetUserId) {
      setHasSystemAccess(tenantUser?.has_system_access !== false);
      setRole(tenantUser?.role ? normalizeTenantAccessRole(tenantUser.role) : 'atendimento');
      setOverrides({});
      setInitialSnapshot(null);
      setDirty(false);
      setCredEmail(emailFromTenant);
      return;
    }

    if (isSaasModeEnabled() && !getUserAccess(effectiveTargetUserId)) {
      ensureLocalUserForSaasAccess(effectiveTargetUserId, {
        email: emailFromTenant,
        role: normalizeTenantAccessRole(tenantUser?.role),
        has_system_access: tenantUser?.has_system_access !== false,
        displayName: linkedDisplayName,
        tenantId: saasTenantId || '',
      });
    }

    const access = getUserAccess(effectiveTargetUserId);
    if (access) {
      setHasSystemAccess(access.has_system_access);
      setRole(normalizeTenantAccessRole(access.role));
      setOverrides(access.overrides || {});
      setInitialSnapshot(JSON.stringify(access));
      setDirty(false);
    } else if (tenantUser) {
      setHasSystemAccess(tenantUser.has_system_access !== false);
      setRole(normalizeTenantAccessRole(tenantUser.role));
      setOverrides({});
      setInitialSnapshot(null);
      setDirty(false);
    }

    setCredEmail(emailFromTenant);
  }, [effectiveTargetUserId, tenantUser, collaboratorId, collaboratorEmail, linkedDisplayName, saasTenantId]);

  const effectivePermission = useCallback((permId) => {
    if (overrides[permId] !== undefined) return overrides[permId];
    return roleDefaultIds.has(permId);
  }, [overrides, roleDefaultIds]);

  const sectorsWithPerms = useMemo(() => MODULES_SPEC.map((sector) => {
    const baseRows = (sector.children || []).map((base) => {
      const perms = catalog.filter((p) => p.module_key === base.key);
      const permByAction = perms.reduce((acc, perm) => {
        acc[perm.action_key] = perm;
        return acc;
      }, {});
      return { key: base.key, label: base.label, actions: base.actions || [], perms, permByAction };
    });
    return {
      key: sector.key,
      label: sector.label,
      rows: baseRows,
      allPerms: baseRows.flatMap((row) => row.perms),
    };
  }), [catalog]);

  const applyPermissionUpdates = useCallback((entries) => {
    setOverrides((prev) => {
      const next = { ...prev };
      for (const [permId, allowed] of entries) {
        const base = roleDefaultIds.has(permId);
        if (allowed === base) delete next[permId];
        else next[permId] = allowed;
      }
      return next;
    });
    setDirty(true);
  }, [roleDefaultIds]);

  const setPermission = useCallback((permId, allowed) => {
    applyPermissionUpdates([[permId, allowed]]);
  }, [applyPermissionUpdates]);

  const totalPerms = catalog.length;

  const allowedCount = useMemo(() => {
    let count = 0;
    for (const perm of catalog) {
      if (overrides[perm.id] !== undefined) {
        if (overrides[perm.id]) count += 1;
      } else if (roleDefaultIds.has(perm.id)) {
        count += 1;
      }
    }
    return count;
  }, [catalog, overrides, roleDefaultIds]);

  const selectAll = useCallback(() => {
    applyPermissionUpdates(catalog.map((p) => [p.id, true]));
    return catalog.length;
  }, [applyPermissionUpdates, catalog]);

  const clearAll = useCallback(() => {
    applyPermissionUpdates(catalog.map((p) => [p.id, false]));
  }, [applyPermissionUpdates, catalog]);

  const selectAllInSector = useCallback((sectorKey) => {
    const sector = sectorsWithPerms.find((s) => s.key === sectorKey);
    if (!sector) return;
    applyPermissionUpdates(sector.allPerms.map((p) => [p.id, true]));
  }, [applyPermissionUpdates, sectorsWithPerms]);

  const clearAllInSector = useCallback((sectorKey) => {
    const sector = sectorsWithPerms.find((s) => s.key === sectorKey);
    if (!sector) return;
    applyPermissionUpdates(sector.allPerms.map((p) => [p.id, false]));
  }, [applyPermissionUpdates, sectorsWithPerms]);

  const setRowPermissions = useCallback((row, allowed) => {
    applyPermissionUpdates(row.perms.map((p) => [p.id, allowed]));
  }, [applyPermissionUpdates]);

  const setActionInSector = useCallback((sectorKey, actionKey, allowed) => {
    const sector = sectorsWithPerms.find((s) => s.key === sectorKey);
    if (!sector) return;
    const perms = sector.allPerms.filter((p) => p.action_key === actionKey);
    applyPermissionUpdates(perms.map((p) => [p.id, allowed]));
  }, [applyPermissionUpdates, sectorsWithPerms]);

  const buildEffectiveMap = useCallback(() => {
    const map = {};
    for (const perm of catalog) {
      map[perm.id] = overrides[perm.id] !== undefined
        ? overrides[perm.id]
        : roleDefaultIds.has(perm.id);
    }
    return map;
  }, [catalog, overrides, roleDefaultIds]);

  const copyPermissions = useCallback(async () => {
    try {
      const payload = JSON.stringify({
        v: 1,
        role,
        effective: buildEffectiveMap(),
      });
      await navigator.clipboard.writeText(`${PERMS_CLIPBOARD_PREFIX}${payload}`);
      return true;
    } catch {
      return false;
    }
  }, [role, buildEffectiveMap]);

  const pastePermissions = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.startsWith(PERMS_CLIPBOARD_PREFIX)) {
        return { ok: false, error: 'Área de transferência sem permissões válidas.' };
      }
      const parsed = JSON.parse(text.slice(PERMS_CLIPBOARD_PREFIX.length));
      const effective = parsed?.effective;
      if (!effective || typeof effective !== 'object') {
        return { ok: false, error: 'Formato de permissões inválido.' };
      }
      const entries = catalog
        .filter((p) => typeof effective[p.id] === 'boolean')
        .map((p) => [p.id, effective[p.id]]);
      applyPermissionUpdates(entries);
      return { ok: true, count: entries.length };
    } catch {
      return { ok: false, error: 'Não foi possível colar as permissões.' };
    }
  }, [catalog, applyPermissionUpdates]);

  const sectorCount = useCallback((sectorKey) => {
    const sector = sectorsWithPerms.find((s) => s.key === sectorKey);
    if (!sector) return { selected: 0, total: 0 };
    const selected = sector.allPerms.filter((p) => effectivePermission(p.id)).length;
    return { selected, total: sector.allPerms.length };
  }, [sectorsWithPerms, effectivePermission]);

  const restoreRoleDefaults = useCallback(() => {
    setOverrides({});
    setDirty(true);
  }, []);

  const handleRevert = useCallback(() => {
    if (!initialSnapshot) return;
    try {
      const access = JSON.parse(initialSnapshot);
      setHasSystemAccess(access.has_system_access);
      setRole(access.role);
      setOverrides(access.overrides || {});
      setDirty(false);
    } catch {
      /* ignore */
    }
  }, [initialSnapshot]);

  const validateCredentials = useCallback(() => {
    if (!hasSystemAccess) return null;
    const email = (credEmail || collaboratorEmail || '').trim().toLowerCase();
    if (!email) return 'E-mail é obrigatório.';
    if (!isCollaboratorEmailValid(email)) return 'Informe um e-mail válido.';
    return null;
  }, [hasSystemAccess, credEmail, collaboratorEmail]);

  const handleSave = useCallback(async ({ onSaveSuccess, onSaveError, onRepairNotice } = {}) => {
    if (!currentUser || !canManageAccess(currentUser)) return false;
    const credErr = validateCredentials();
    if (credErr) {
      onSaveError?.(credErr);
      return false;
    }
    setSaving(true);
    let inviteSent = false;
    try {
      let resolvedTargetUserId = effectiveTargetUserId;
      const normalizedEmail = (credEmail || collaboratorEmail || '').trim().toLowerCase();

      if (isSaasModeEnabled() && hasSystemAccess) {
        if (!saasTenantId) throw new Error('Clínica não identificada para salvar no servidor. Faça login novamente.');
        const mustProvision = !resolvedTargetUserId || tenantUserNeedsAuthRepair(tenantUser);
        if (mustProvision) {
          if (!collaboratorId) throw new Error('Colaborador não identificado para criar acesso.');
          let repairNotified = false;
          const provisionResult = await provisionCollaboratorAccessWithRepair({
            tenant_id: saasTenantId,
            collaborator_id: collaboratorId,
            collaborator_full_name: (linkedDisplayName || '').trim() || normalizedEmail,
            create_system_access: true,
            email: normalizedEmail,
            profile_role: role || 'atendimento',
            send_invite: true,
            repair_stale_auth: tenantUserNeedsAuthRepair(tenantUser),
            tenantUser,
          }, {
            onRepairNotice: () => {
              if (repairNotified) return;
              repairNotified = true;
              onRepairNotice?.('Encontramos um vínculo antigo. O sistema vai recriar o convite.');
            },
          });
          resolvedTargetUserId = provisionResult.authUserId || provisionResult.tenant_user?.user_id || null;
          if (!resolvedTargetUserId) throw new Error('Acesso criado, mas o usuário não foi vinculado. Tente novamente.');
          inviteSent = Boolean(provisionResult.inviteSent ?? provisionResult.emailSent ?? true);
          onAccessChanged?.();
        }
        await saveCollaboratorAccessBundle({
          tenant_id: saasTenantId,
          collaborator_id: collaboratorId || '',
          target_user_id: resolvedTargetUserId,
          email: normalizedEmail,
          role: role || 'atendimento',
          has_system_access: hasSystemAccess,
          permission_overrides: overrides || {},
        });
      } else if (hasSystemAccess && !resolvedTargetUserId) {
        onSaveError?.('Crie o acesso do colaborador antes de salvar permissões individuais.');
        return false;
      }

      if (resolvedTargetUserId) {
        if (isSaasModeEnabled() && !getUserAccess(resolvedTargetUserId)) {
          ensureLocalUserForSaasAccess(resolvedTargetUserId, {
            email: normalizedEmail,
            role: role || 'atendimento',
            has_system_access: hasSystemAccess,
            displayName: (linkedDisplayName || '').trim(),
            tenantId: saasTenantId || '',
          });
        }
        updateUserAccess(currentUser, resolvedTargetUserId, {
          has_system_access: hasSystemAccess,
          role: role || 'atendimento',
          overrides,
        });
        setInitialSnapshot(JSON.stringify(getUserAccess(resolvedTargetUserId)));
      }
      setDirty(false);
      onSaveSuccess?.({ inviteSent });
      return true;
    } catch (err) {
      onSaveError?.(err?.message || 'Erro ao salvar');
      return false;
    } finally {
      setSaving(false);
    }
  }, [currentUser, validateCredentials, effectiveTargetUserId, credEmail, collaboratorEmail, hasSystemAccess, saasTenantId, collaboratorId, linkedDisplayName, role, overrides, onAccessChanged, tenantUser]);

  const formatInviteDate = (value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
      return '—';
    }
  };

  const resolvedAccessStatus = useMemo(
    () => accessDisplayStatus || resolveCollaboratorAccessDisplayStatus(tenantUser),
    [accessDisplayStatus, tenantUser],
  );

  const lastInviteLabel = useMemo(() => {
    const invitation = tenantUser?.invitation;
    const sentAt = invitation?.sent_at || invitation?.created_at || tenantUser?.updated_at;
    if (!sentAt && resolvedAccessStatus?.key === 'no_access') return 'Nenhum convite enviado';
    return formatInviteDate(sentAt);
  }, [tenantUser, resolvedAccessStatus]);

  const roleOptions = ROLES.filter((r) => r !== ROLE_ADMIN);
  const readOnly = !canManageAccess(currentUser);
  const inviteTargetEmail = (credEmail || collaboratorEmail || '').trim().toLowerCase();
  const canResendInvite = Boolean(
    isSaasModeEnabled() && saasTenantId && inviteTargetEmail && tenantUser?.id
    && (['sent', 'pending', 'expired', 'failed'].includes(resolvedAccessStatus.key) || !tenantUser?.user_id),
  );

  const handleResendInvite = useCallback(async ({ onSaveSuccess, onSaveError } = {}) => {
    if (!canResendInvite || !currentUser || saving) return;
    setSaving(true);
    try {
      if (isSaasModeEnabled() && saasTenantId) {
        await resendCollaboratorInvite({
          tenant_id: saasTenantId,
          email: inviteTargetEmail,
          collaborator_id: collaboratorId || tenantUser?.collaborator_id || null,
        });
        onAccessChanged?.();
        onSaveSuccess?.({ inviteSent: true });
      }
    } catch (err) {
      onSaveError?.(err?.message || 'Erro ao reenviar convite.');
    } finally {
      setSaving(false);
    }
  }, [canResendInvite, currentUser, saving, saasTenantId, inviteTargetEmail, collaboratorId, tenantUser, onAccessChanged]);

  return {
    hasSystemAccess,
    setHasSystemAccess,
    role,
    setRole,
    overrides,
    credEmail,
    setCredEmail,
    saving,
    dirty,
    setDirty,
    catalog,
    sectorsWithPerms,
    effectivePermission,
    setPermission,
    sectorCount,
    totalPerms,
    allowedCount,
    selectAll,
    clearAll,
    selectAllInSector,
    clearAllInSector,
    setRowPermissions,
    setActionInSector,
    copyPermissions,
    pastePermissions,
    restoreRoleDefaults,
    handleRevert,
    handleSave,
    handleResendInvite,
    roleOptions,
    readOnly,
    resolvedAccessStatus,
    lastInviteLabel,
    canResendInvite,
    effectiveTargetUserId,
    ROLE_LABELS,
    ACTION_LABELS,
  };
}
