import { useMemo, useState, useEffect } from 'react';
import { getPermissionsCatalog, getUserAccess, getRoleDefaultPermissionIds, updateUserAccess, ROLES, ROLE_LABELS, ROLE_ADMIN } from '../../services/accessService.js';
import { MODULES_SPEC, ACTION_LABELS } from '../../permissions/catalog.js';

/**
 * Aba "Acessos" da Ficha do Colaborador: toggle acesso, perfil, permissões granulares.
 * Somente ADMIN pode editar. targetUserId = usuário vinculado ao colaborador (draft.access.userId).
 * ADMIN único: role "Administrador" não é oferecida na UI para outros usuários.
 */
export default function AccessTab({
  targetUserId,
  currentUser,
  canEdit,
  onSaveSuccess,
  onSaveError,
  onVincularUsuario,
}) {
  const [hasSystemAccess, setHasSystemAccess] = useState(true);
  const [role, setRole] = useState('');
  const [overrides, setOverrides] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  const catalog = useMemo(() => getPermissionsCatalog(), []);
  const roleDefaultIds = useMemo(() => (role ? new Set(getRoleDefaultPermissionIds(role)) : new Set()), [role]);

  useEffect(() => {
    if (!targetUserId) {
      setHasSystemAccess(true);
      setRole('');
      setOverrides({});
      setInitialSnapshot(null);
      setDirty(false);
      return;
    }
    const access = getUserAccess(targetUserId);
    if (!access) return;
    setHasSystemAccess(access.has_system_access);
    setRole(access.role);
    setOverrides(access.overrides || {});
    setInitialSnapshot(JSON.stringify(access));
    setDirty(false);
  }, [targetUserId]);

  const effectivePermission = (permId) => {
    if (overrides[permId] !== undefined) return overrides[permId];
    return roleDefaultIds.has(permId);
  };

  const setPermission = (permId, allowed) => {
    const base = roleDefaultIds.has(permId);
    if (allowed === base) {
      const next = { ...overrides };
      delete next[permId];
      setOverrides(next);
    } else {
      setOverrides((prev) => ({ ...prev, [permId]: allowed }));
    }
    setDirty(true);
  };

  const groupedByModule = useMemo(() => {
    const groups = [];
    const searchLower = (search || '').toLowerCase().trim();
    for (const mod of MODULES_SPEC) {
      if (mod.children) {
        for (const child of mod.children) {
          const perms = catalog.filter((p) => p.module_key === child.key);
          if (perms.length === 0) continue;
          const label = `${mod.label} › ${child.label}`;
          if (searchLower && !label.toLowerCase().includes(searchLower) && !perms.some((p) => p.description?.toLowerCase().includes(searchLower))) continue;
          groups.push({ key: child.key, label, perms });
        }
      } else {
        const perms = catalog.filter((p) => p.module_key === mod.key);
        if (perms.length === 0) continue;
        if (searchLower && !mod.label.toLowerCase().includes(searchLower) && !perms.some((p) => p.description?.toLowerCase().includes(searchLower))) continue;
        groups.push({ key: mod.key, label: mod.label, perms });
      }
    }
    return groups;
  }, [catalog, search]);

  const totalPerms = catalog.length;
  const allowedCount = useMemo(() => {
    let n = 0;
    for (const p of catalog) {
      if (effectivePermission(p.id)) n++;
    }
    return n;
  }, [catalog, role, roleDefaultIds, overrides]);

  const handleSave = async () => {
    if (!targetUserId || !currentUser || (currentUser.role !== ROLE_ADMIN && !currentUser.isMaster)) return;
    setSaving(true);
    try {
      updateUserAccess(currentUser, targetUserId, {
        has_system_access: hasSystemAccess,
        role: role || 'atendimento',
        overrides,
      });
      setInitialSnapshot(JSON.stringify(getUserAccess(targetUserId)));
      setDirty(false);
      onSaveSuccess?.();
    } catch (err) {
      onSaveError?.(err?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    if (!initialSnapshot) return;
    try {
      const access = JSON.parse(initialSnapshot);
      setHasSystemAccess(access.has_system_access);
      setRole(access.role);
      setOverrides(access.overrides || {});
      setDirty(false);
    } catch (_) {}
  };

  if (!targetUserId) {
    return (
      <div className="access-tab access-tab-empty">
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Nenhum usuário vinculado. Vincule para definir perfil e permissões de login.
        </p>
        {onVincularUsuario && (
          <button type="button" className="button primary" onClick={onVincularUsuario}>
            Vincular usuário
          </button>
        )}
      </div>
    );
  }

  /** Não permitir criar outro ADMIN pela UI: apenas perfis não-admin. */
  const roleOptions = ROLES.filter((r) => r !== ROLE_ADMIN);
  const readOnly = !canEdit || (currentUser?.role !== ROLE_ADMIN && !currentUser?.isMaster);

  return (
    <div className="access-tab">
      <div className="access-tab-header">
        <div className="access-tab-toggle-row">
          <label className="access-tab-toggle-label">Acesso ao sistema</label>
          <button
            type="button"
            role="switch"
            aria-checked={hasSystemAccess}
            className={`access-tab-toggle ${hasSystemAccess ? 'on' : 'off'}`}
            disabled={readOnly}
            onClick={() => { setHasSystemAccess((v) => !v); setDirty(true); }}
          >
            <span className="access-tab-toggle-slider" />
          </button>
          <span className="access-tab-toggle-caption">{hasSystemAccess ? 'Ativo' : 'Desativado'}</span>
        </div>
        <div className="access-tab-profile-row">
          <label className="access-tab-label">Perfil de Acesso</label>
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value); setDirty(true); }}
            disabled={readOnly}
            className="access-tab-select"
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="access-tab-permissions-header">
        <h4 className="access-tab-permissions-title">Permissões por Tópico</h4>
        <span className="access-tab-counter">{allowedCount} de {totalPerms} permissões</span>
        <input
          type="search"
          placeholder="Buscar permissão..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="access-tab-search"
          aria-label="Buscar permissão"
        />
      </div>

      <div className="access-tab-permissions-list">
        {groupedByModule.map((group) => (
          <div key={group.key} className="access-tab-module">
            <h5 className="access-tab-module-title">{group.label}</h5>
            <div className="access-tab-grid">
              {group.perms.map((perm) => (
                <label key={perm.id} className="access-tab-perm-row">
                  <input
                    type="checkbox"
                    checked={effectivePermission(perm.id)}
                    onChange={(e) => setPermission(perm.id, e.target.checked)}
                    disabled={readOnly}
                    aria-label={perm.description}
                  />
                  <span className="access-tab-perm-label">{ACTION_LABELS[perm.action_key]}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="access-tab-actions">
        <button type="button" className="button primary" onClick={handleSave} disabled={readOnly || saving || !dirty}>
          {saving ? 'Salvando…' : 'Salvar alterações'}
        </button>
        <button type="button" className="button secondary" onClick={handleRevert} disabled={readOnly || !dirty}>
          Reverter
        </button>
      </div>
    </div>
  );
}
