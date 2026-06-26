import { useMemo, useState, useEffect } from 'react';
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
} from '../../services/accessService.js';
import { saveCollaboratorAccessBundleWithRepair, provisionCollaboratorAccessWithRepair, resendCollaboratorInvite, resolveCollaboratorIdForAccessRequest } from '../../services/collaboratorAccessProvisionService.js';
import { tenantUserNeedsAuthRepair } from '../../utils/collaboratorAccessPanel.js';
import { MODULES_SPEC, ACTION_KEYS, ACTION_LABELS } from '../../permissions/catalog.js';
import { Field } from '../Field.jsx';
import Button from '../Button.jsx';
import {
  Search,
  Save,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Info,
  Mail,
  UserX,
  UserCheck,
  RotateCcw,
  Shield,
  KeyRound,
} from 'lucide-react';
import { isSaasModeEnabled } from '../../services/saasAuthService.js';
import { isCollaboratorEmailValid } from '../../utils/collaboratorAccessRole.js';
import {
  accessStatusBadgeClass,
  resolveCollaboratorAccessDisplayStatus,
} from '../../utils/inviteStatus.js';
import {
  normalizeTenantAccessRole,
  resolveAccessTargetUserId,
} from '../../utils/collaboratorAccessPanel.js';
import { isTenantSystemAccessActive } from '../../utils/collaboratorAccessManagement.js';

const FIXED_MATRIX_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'send', 'cancel'];
const DEFAULT_EXPANDED_SECTORS = [];

/**
 * Aba "Acessos" da Ficha do Colaborador: toggle acesso, perfil, permissões granulares, credenciais.
 * Design moderno com header premium, accordion por setor e controles rápidos.
 */
export default function AccessTab({
  collaboratorId,
  targetUserId,
  tenantUser = null,
  collaboratorEmail = '',
  saasTenantId,
  linkedDisplayName,
  currentUser,
  canEdit,
  onSaveSuccess,
  onSaveError,
  onAccessChanged,
  onToggleSystemAccess,
  accessActive: accessActiveProp,
  accessDisplayStatus = null,
  onGoToProfile,
  section = 'full',
}) {
  const [hasSystemAccess, setHasSystemAccess] = useState(true);
  const [role, setRole] = useState('');
  const [overrides, setOverrides] = useState({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [initialSnapshot, setInitialSnapshot] = useState(null);
  const [expandedSectors, setExpandedSectors] = useState(new Set(DEFAULT_EXPANDED_SECTORS));

  const [credEmail, setCredEmail] = useState('');

  const catalog = useMemo(() => getPermissionsCatalog(), []);
  const effectiveTargetUserId = useMemo(
    () => resolveAccessTargetUserId({
      localUserId: targetUserId,
      tenantUser,
      saasMode: isSaasModeEnabled(),
    }),
    [targetUserId, tenantUser],
  );
  const roleDefaultIds = useMemo(
    () => (role ? new Set(getRoleDefaultPermissionIds(role)) : new Set()),
    [role]
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
        collaboratorId: collaboratorId || '',
      });
    }

    const serverHasAccess = isSaasModeEnabled() && tenantUser?.id
      ? isTenantSystemAccessActive(tenantUser)
      : null;

    const access = getUserAccess(effectiveTargetUserId);
    if (access) {
      setHasSystemAccess(serverHasAccess !== null ? serverHasAccess : access.has_system_access);
      setRole(normalizeTenantAccessRole(access.role));
      setOverrides(access.overrides || {});
      setInitialSnapshot(JSON.stringify({
        ...access,
        has_system_access: serverHasAccess !== null ? serverHasAccess : access.has_system_access,
      }));
      setDirty(false);
    } else if (tenantUser) {
      setHasSystemAccess(serverHasAccess !== null ? serverHasAccess : tenantUser.has_system_access !== false);
      setRole(normalizeTenantAccessRole(tenantUser.role));
      setOverrides({});
      setInitialSnapshot(null);
      setDirty(false);
    }

    setCredEmail(emailFromTenant);
  }, [effectiveTargetUserId, tenantUser, collaboratorId, collaboratorEmail, linkedDisplayName, saasTenantId]);

  const effectivePermission = (permId) => {
    if (overrides[permId] !== undefined) return overrides[permId];
    return roleDefaultIds.has(permId);
  };

  const setPermission = (permId, allowed) => {
    const base = roleDefaultIds.has(permId);
    if (allowed === base) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[permId];
        return next;
      });
    } else {
      setOverrides((prev) => ({ ...prev, [permId]: allowed }));
    }
    setDirty(true);
  };

  const totalPerms = catalog.length;
  const allowedCount = useMemo(() => {
    let n = 0;
    for (const p of catalog) {
      if (effectivePermission(p.id)) n++;
    }
    return n;
  }, [catalog, role, roleDefaultIds, overrides]);

  const sectorsWithPerms = useMemo(() => {
    const searchLower = (search || '').toLowerCase().trim();
    return MODULES_SPEC.map((sector) => {
      const baseRows = (sector.children || []).map((base) => {
        const perms = catalog.filter((p) => p.module_key === base.key);
        const permByAction = perms.reduce((acc, perm) => {
          acc[perm.action_key] = perm;
          return acc;
        }, {});
        return {
          key: base.key,
          label: base.label,
          actions: base.actions || [],
          perms,
          permByAction,
        };
      });
      const filteredRows = searchLower
        ? baseRows.filter((row) => {
            if (row.label.toLowerCase().includes(searchLower)) return true;
            if (sector.label.toLowerCase().includes(searchLower)) return true;
            return row.actions.some((action) => (ACTION_LABELS[action] || action).toLowerCase().includes(searchLower));
          })
        : baseRows;
      const allPerms = baseRows.flatMap((row) => row.perms);
      const filteredPerms = filteredRows.flatMap((row) => row.perms);
      return {
        key: sector.key,
        label: sector.label,
        rows: filteredRows,
        allRows: baseRows,
        allPerms,
        perms: filteredPerms,
      };
    }).filter((sector) => sector.rows.length > 0);
  }, [catalog, search]);

  const selectAllInSector = (sectorKey) => {
    const sector = sectorsWithPerms.find((s) => s.key === sectorKey);
    if (!sector) return;
    sector.allPerms.forEach((p) => setPermission(p.id, true));
  };

  const clearAllInSector = (sectorKey) => {
    const sector = sectorsWithPerms.find((s) => s.key === sectorKey);
    if (!sector) return;
    sector.allPerms.forEach((p) => setPermission(p.id, false));
  };

  const selectAll = () => {
    catalog.forEach((p) => setPermission(p.id, true));
  };

  const clearAll = () => {
    catalog.forEach((p) => setPermission(p.id, false));
  };

  const restoreRoleDefaults = () => {
    setOverrides({});
    setDirty(true);
  };

  const formatInviteDate = (value) => {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value));
    } catch {
      return '—';
    }
  };

  const toggleSector = (key) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sectorCount = (sectorKey) => {
    const sector = sectorsWithPerms.find((s) => s.key === sectorKey);
    if (!sector) return { selected: 0, total: 0 };
    const perms = sector.allPerms || [];
    const selected = perms.filter((p) => effectivePermission(p.id)).length;
    return { selected, total: perms.length };
  };

  const validateCredentials = () => {
    if (!hasSystemAccess) return null;
    const email = (credEmail || '').trim().toLowerCase();
    if (!email) return 'E-mail é obrigatório.';
    if (!isCollaboratorEmailValid(email)) return 'Informe um e-mail válido.';
    return null;
  };

  const handleSave = async () => {
    if (!currentUser || !canManageAccess(currentUser)) return;
    const credErr = validateCredentials();
    if (credErr) {
      onSaveError?.(credErr);
      return;
    }
    setSaving(true);
    let inviteSent = false;
    try {
      let resolvedTargetUserId = effectiveTargetUserId;
      const normalizedEmail = (credEmail || '').trim().toLowerCase();

      if (isSaasModeEnabled() && hasSystemAccess) {
        if (!saasTenantId) {
          throw new Error('Clínica não identificada para salvar no servidor. Faça login novamente.');
        }
        const mustProvision = !resolvedTargetUserId || tenantUserNeedsAuthRepair(tenantUser);
        if (mustProvision) {
          if (!collaboratorId) {
            throw new Error('Colaborador não identificado para criar acesso.');
          }
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
          });
          resolvedTargetUserId = provisionResult.authUserId
            || provisionResult.tenant_user?.user_id
            || null;
          if (!resolvedTargetUserId) {
            throw new Error('Acesso criado, mas o usuário não foi vinculado. Tente novamente.');
          }
          inviteSent = Boolean(provisionResult.inviteSent ?? provisionResult.emailSent ?? true);
          onAccessChanged?.();
        }

        await saveCollaboratorAccessBundleWithRepair({
          tenant_id: saasTenantId,
          collaborator_id: collaboratorId || '',
          target_user_id: resolvedTargetUserId,
          email: normalizedEmail,
          role: role || 'atendimento',
          has_system_access: hasSystemAccess,
          permission_overrides: overrides || {},
        }, { tenantUser });
      } else if (hasSystemAccess && !resolvedTargetUserId) {
        onSaveError?.('Crie o acesso do colaborador antes de salvar permissões individuais.');
        return;
      }

      if (resolvedTargetUserId) {
        if (isSaasModeEnabled() && !getUserAccess(resolvedTargetUserId)) {
          ensureLocalUserForSaasAccess(resolvedTargetUserId, {
            email: normalizedEmail,
            role: role || 'atendimento',
            has_system_access: hasSystemAccess,
            displayName: (linkedDisplayName || '').trim(),
            tenantId: saasTenantId || '',
            collaboratorId: collaboratorId || '',
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

  const roleOptions = ROLES.filter((r) => r !== ROLE_ADMIN);
  const canManage = canManageAccess(currentUser);
  const readOnly = !canEdit || !canManage;
  const accessActive = typeof accessActiveProp === 'boolean'
    ? accessActiveProp
    : (tenantUser?.id ? isTenantSystemAccessActive(tenantUser) : hasSystemAccess);
  const inviteTargetEmail = (credEmail || collaboratorEmail || '').trim().toLowerCase();
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
  const disabledTooltip = readOnly
    ? 'Você não tem permissão para editar acessos. Entre em contato com o administrador.'
    : null;
  const canResendInvite = Boolean(
    isSaasModeEnabled()
    && saasTenantId
    && inviteTargetEmail
    && tenantUser?.id
    && (
      ['sent', 'pending', 'expired', 'failed'].includes(resolvedAccessStatus.key)
      || !tenantUser?.user_id
    ),
  );
  const canSavePermissions = isSaasModeEnabled()
    ? Boolean(collaboratorId && (effectiveTargetUserId || (hasSystemAccess && inviteTargetEmail)))
    : Boolean(effectiveTargetUserId);

  const handleResendInvite = async () => {
    if (!canResendInvite || !currentUser || saving) return;
    setSaving(true);
    try {
      if (isSaasModeEnabled() && saasTenantId) {
        await resendCollaboratorInvite({
          tenant_id: saasTenantId,
          email: inviteTargetEmail,
          collaborator_id: resolveCollaboratorIdForAccessRequest({ tenantUser, collaboratorId }),
        });
        onAccessChanged?.();
        onSaveSuccess?.({ inviteSent: true });
      }
    } catch (err) {
      onSaveError?.(err?.message || 'Erro ao reenviar convite.');
    } finally {
      setSaving(false);
    }
  };

  if (!collaboratorId && !collaboratorEmail && !tenantUser) {
    return (
      <div className="access-tab access-tab-empty">
        <p className="muted">Selecione um colaborador para configurar permissões.</p>
      </div>
    );
  }

  const showAccess = section === 'full' || section === 'access';
  const showPermissions = section === 'full' || section === 'permissions';

  return (
    <div className={`access-tab access-tab--saas ${section !== 'full' ? `access-tab--${section}` : ''}`}>
      {!tenantUser?.id && !effectiveTargetUserId && hasSystemAccess ? (
        <p className="access-tab-info-banner" role="status">
          <Info size={16} aria-hidden />
          Este colaborador ainda não possui acesso ao sistema. Informe o e-mail e salve para enviar o convite.
        </p>
      ) : null}

      {showAccess ? (
      <section className="access-card access-card--security">
        <header className="access-card__header">
          <div className="access-card__title-row">
            <Shield size={18} className="access-card__icon" aria-hidden />
            <h3 className="access-card__title">{section === 'access' ? 'Central de segurança' : 'Acesso ao sistema'}</h3>
          </div>
          <div className="access-tab-toggle-row">
            <button
              type="button"
              role="switch"
              aria-checked={hasSystemAccess}
              aria-label="Acesso ao sistema"
              title={disabledTooltip}
              className={`access-tab-toggle ${hasSystemAccess ? 'on' : 'off'}`}
              disabled={readOnly}
              onClick={() => {
                setHasSystemAccess((v) => !v);
                setDirty(true);
              }}
            >
              <span className="access-tab-toggle-slider" />
            </button>
            <span className="access-tab-toggle-caption">{hasSystemAccess ? 'Ativo' : 'Desativado'}</span>
          </div>
        </header>

        {hasSystemAccess ? (
          <div className="access-card__body">
            <div className="access-card__grid">
              <Field label="E-mail de acesso" error={!credEmail.trim() && dirty ? 'Obrigatório' : null}>
                <input
                  type="email"
                  value={credEmail}
                  onChange={(e) => {
                    setCredEmail(e.target.value);
                    setDirty(true);
                  }}
                  disabled={readOnly}
                  className="access-tab-input"
                  placeholder="email@exemplo.com"
                  autoComplete="off"
                />
              </Field>
              <div className="access-card__stat">
                <span className="access-card__stat-label">Status do acesso</span>
                <span className={accessStatusBadgeClass(resolvedAccessStatus.key)}>
                  {resolvedAccessStatus.label}
                </span>
              </div>
              <div className="access-card__stat">
                <span className="access-card__stat-label">Perfil no sistema</span>
                <span className="access-card__stat-value">{ROLE_LABELS[role] || role || '—'}</span>
              </div>
              <div className="access-card__stat">
                <span className="access-card__stat-label">Último convite</span>
                <span className="access-card__stat-value">{lastInviteLabel}</span>
              </div>
            </div>
            <p className="access-card__hint">
              <KeyRound size={14} aria-hidden />
              A senha será criada pelo colaborador no primeiro acesso.
            </p>
            {!credEmail.trim() && onGoToProfile ? (
              <button type="button" className="access-card__link-btn" onClick={onGoToProfile}>
                Informar e-mail no cadastro
              </button>
            ) : null}
          </div>
        ) : (
          <p className="access-card__muted">O colaborador não terá login no sistema enquanto o acesso estiver desativado.</p>
        )}
      </section>
      ) : null}

      {showAccess && section === 'access' ? (
        <section className="access-card access-card--security-stats">
          <header className="access-card__header">
            <div className="access-card__title-row">
              <KeyRound size={18} className="access-card__icon" aria-hidden />
              <h3 className="access-card__title">Status</h3>
            </div>
          </header>
          <div className="access-card__body access-security-grid">
            <div className="access-card__stat"><span className="access-card__stat-label">Acesso</span><span className={accessStatusBadgeClass(resolvedAccessStatus.key)}>{hasSystemAccess ? 'Ativo' : 'Desativado'}</span></div>
            <div className="access-card__stat"><span className="access-card__stat-label">Perfil</span><span className="access-card__stat-value">{ROLE_LABELS[role] || role || '—'}</span></div>
            <div className="access-card__stat"><span className="access-card__stat-label">Último convite</span><span className="access-card__stat-value">{lastInviteLabel}</span></div>
            <div className="access-card__stat"><span className="access-card__stat-label">E-mail de acesso</span><span className="access-card__stat-value">{credEmail || '—'}</span></div>
          </div>
        </section>
      ) : null}

      {showPermissions ? (
      <>
      <section className="access-card">
        <header className="access-card__header">
          <div className="access-card__title-row">
            <Shield size={18} className="access-card__icon" aria-hidden />
            <h3 className="access-card__title">{section === 'permissions' ? 'Central de permissões' : 'Perfil e permissões'}</h3>
          </div>
          <span className="access-tab-total-counter" aria-live="polite">
            {allowedCount}/{totalPerms} permissões
          </span>
        </header>
        <div className="access-card__body">
          <div className="access-card__toolbar">
            <div className="access-tab-profile-row access-card__profile-row">
              <label className="access-tab-label" htmlFor="access-role-select">Perfil de acesso</label>
              <select
                id="access-role-select"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setDirty(true);
                }}
                disabled={readOnly}
                className="access-tab-select"
                title={disabledTooltip}
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                ))}
              </select>
            </div>
            <div className="access-tab-search-row">
              <Search size={18} className="access-tab-search-icon" aria-hidden />
              <input
                type="search"
                placeholder="Buscar permissão"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="access-tab-search-input"
                aria-label="Buscar permissão"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="access-tab-quick-controls access-card__quick-controls">
            <div className="access-tab-quick-buttons">
              <button type="button" className="access-tab-quick-btn" onClick={selectAll} disabled={readOnly}>
                <CheckSquare size={16} aria-hidden />
                Selecionar tudo
              </button>
              <button type="button" className="access-tab-quick-btn" onClick={clearAll} disabled={readOnly}>
                <Square size={16} aria-hidden />
                Limpar tudo
              </button>
              <button type="button" className="access-tab-quick-btn" onClick={restoreRoleDefaults} disabled={readOnly}>
                <RotateCcw size={16} aria-hidden />
                Restaurar padrão do perfil
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={`access-card access-card--matrix ${section === 'permissions' ? 'access-card--modules' : ''}`}>
        <div className={`access-tab-permissions-list ${section === 'permissions' ? 'access-tab-permissions-list--modules' : ''}`}>
          {sectorsWithPerms.map((sector) => {
            const { selected, total } = sectorCount(sector.key);
            const isExpanded = section === 'permissions' ? true : expandedSectors.has(sector.key);
            if (section === 'permissions') {
              return (
                <div key={sector.key} className="access-module-card">
                  <header className="access-module-card__header">
                    <h4 className="access-module-card__title">{sector.label}</h4>
                    <span className="access-module-card__counter">{selected}/{total}</span>
                  </header>
                  <div className="access-module-card__body">
                    {sector.rows.map((row) => (
                      <div key={row.key} className="access-module-row">
                        <span className="access-module-row__label">{row.label}</span>
                        <div className="access-module-row__toggles">
                          {FIXED_MATRIX_ACTIONS.map((actionKey) => {
                            const perm = row.permByAction[actionKey];
                            if (!perm) return null;
                            const checkboxId = `perm-${row.key}-${actionKey}`;
                            const checked = effectivePermission(perm.id);
                            return (
                              <label key={actionKey} className="access-module-toggle" htmlFor={checkboxId}>
                                <input
                                  id={checkboxId}
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => setPermission(perm.id, e.target.checked)}
                                  disabled={readOnly}
                                />
                                <span className="access-module-toggle__track" aria-hidden />
                                <span className="access-module-toggle__label">{ACTION_LABELS[actionKey] || actionKey}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="access-module-card__actions">
                    <button type="button" className="access-tab-sector-btn" onClick={() => selectAllInSector(sector.key)} disabled={readOnly}>Selecionar módulo</button>
                    <button type="button" className="access-tab-sector-btn" onClick={() => clearAllInSector(sector.key)} disabled={readOnly}>Limpar módulo</button>
                  </div>
                </div>
              );
            }
            return (
              <div key={sector.key} className="access-tab-sector-card">
                <button
                  type="button"
                  className="access-tab-sector-header"
                  onClick={() => toggleSector(sector.key)}
                  aria-expanded={isExpanded}
                  aria-controls={`access-sector-${sector.key}`}
                  id={`access-sector-btn-${sector.key}`}
                >
                  <span className="access-tab-sector-icon">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </span>
                  <span className="access-tab-sector-label">{sector.label}</span>
                  <span className="access-tab-sector-counter">{selected}/{total}</span>
                  <div
                    className="access-tab-sector-actions"
                    onClick={(e) => e.stopPropagation()}
                    role="group"
                    aria-label={`Ações do setor ${sector.label}`}
                  >
                    <button
                      type="button"
                      className="access-tab-sector-btn"
                      onClick={() => selectAllInSector(sector.key)}
                      disabled={readOnly}
                    >
                      Selecionar módulo
                    </button>
                    <button
                      type="button"
                      className="access-tab-sector-btn"
                      onClick={() => clearAllInSector(sector.key)}
                      disabled={readOnly}
                    >
                      Limpar módulo
                    </button>
                  </div>
                </button>
                <div
                  id={`access-sector-${sector.key}`}
                  className={`access-tab-sector-content ${isExpanded ? 'expanded' : ''}`}
                  role="region"
                  aria-labelledby={`access-sector-btn-${sector.key}`}
                  hidden={!isExpanded}
                >
                  <div className="access-tab-matrix-wrap">
                    <table className="access-tab-matrix-table">
                      <thead>
                        <tr>
                          <th scope="col" className="access-tab-matrix-base-col">Base / Função</th>
                          {FIXED_MATRIX_ACTIONS.map((actionKey) => (
                            <th key={`${sector.key}-${actionKey}`} scope="col" className="access-tab-matrix-action-col">
                              {ACTION_LABELS[actionKey] || actionKey}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sector.rows.map((row) => (
                          <tr key={`${sector.key}-${row.key}`}>
                            <th scope="row" className="access-tab-matrix-base-cell">{row.label}</th>
                            {FIXED_MATRIX_ACTIONS.map((actionKey) => {
                              const perm = row.permByAction[actionKey];
                              const checkboxId = `perm-${row.key}-${actionKey}`;
                              return (
                                <td key={`${row.key}-${actionKey}`} className="access-tab-matrix-check-cell">
                                  <input
                                    id={checkboxId}
                                    type="checkbox"
                                    checked={perm ? effectivePermission(perm.id) : false}
                                    onChange={(e) => {
                                      if (!perm) return;
                                      setPermission(perm.id, e.target.checked);
                                    }}
                                    disabled={readOnly || !perm}
                                    aria-label={`${row.label} - ${ACTION_LABELS[actionKey] || actionKey}`}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {sectorsWithPerms.length === 0 && search.trim() ? (
          <p className="access-tab-no-results">Nenhuma permissão encontrada para &quot;{search}&quot;.</p>
        ) : null}
      </section>
      </>
      ) : null}

      {disabledTooltip ? (
        <p className="access-tab-disabled-hint" role="status">
          <Info size={14} aria-hidden /> {disabledTooltip}
        </p>
      ) : null}
      {!canSavePermissions && hasSystemAccess ? (
        <p className="access-tab-disabled-hint" role="status">
          <Info size={14} aria-hidden /> Informe um e-mail válido para salvar permissões e enviar o convite.
        </p>
      ) : null}

      <footer className="access-tab-footer">
        <div className="access-tab-footer__secondary">
          {canResendInvite ? (
            <Button variant="secondary" icon={Mail} onClick={handleResendInvite} disabled={readOnly || saving}>
              Reenviar convite
            </Button>
          ) : null}
          {onToggleSystemAccess && tenantUser?.id ? (
            <Button
              variant="secondary"
              icon={accessActive ? UserX : UserCheck}
              onClick={onToggleSystemAccess}
              disabled={readOnly || saving}
            >
              {accessActive ? 'Desativar acesso' : 'Ativar acesso'}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={handleRevert} disabled={readOnly || !dirty}>
            Cancelar
          </Button>
        </div>
        <Button
          variant="primary"
          icon={Save}
          loading={saving}
          onClick={handleSave}
          disabled={readOnly || saving || !dirty || !canSavePermissions}
        >
          Salvar permissões
        </Button>
      </footer>
    </div>
  );
}
