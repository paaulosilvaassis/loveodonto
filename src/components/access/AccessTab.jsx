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
import { getUserAuthByCollaborator, saveUserAuth } from '../../services/userAuthService.js';
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
} from 'lucide-react';
import { getDefaultTenant } from '../../services/tenantService.js';
import { findPendingInvitationByEmail, listInvitations, refreshInvitation } from '../../services/invitationService.js';
import { isSaasModeEnabled } from '../../services/saasAuthService.js';
import { saveCollaboratorAccessBundle } from '../../services/collaboratorAccessProvisionService.js';
import {
  normalizeTenantAccessRole,
  resolveAccessTargetUserId,
} from '../../utils/collaboratorAccessPanel.js';

const MIN_PASSWORD_LENGTH = 8;
const FIXED_MATRIX_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'send', 'cancel'];

function resolveInvitationStatus(invitation) {
  if (!invitation) return 'sem convite';
  if (invitation.accepted_at || invitation.status === 'accepted') return 'aceito';
  if (invitation.status === 'sent') return 'enviado';
  if (invitation.expires_at && invitation.expires_at <= new Date().toISOString()) return 'expirado';
  return 'pendente';
}

const DEFAULT_EXPANDED_SECTORS = MODULES_SPEC.slice(0, 3).map((sector) => sector.key);

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
  onVincularUsuario,
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
  const [credPassword, setCredPassword] = useState('');
  const [credConfirmPassword, setCredConfirmPassword] = useState('');
  const [credMustChangePassword, setCredMustChangePassword] = useState(true);

  const catalog = useMemo(() => getPermissionsCatalog(), []);
  const effectiveTargetUserId = useMemo(
    () => resolveAccessTargetUserId({ localUserId: targetUserId, tenantUser }),
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
      setCredPassword('');
      setCredConfirmPassword('');
      setCredMustChangePassword(true);
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

    const auth = collaboratorId ? getUserAuthByCollaborator(collaboratorId) : null;
    if (auth) {
      setCredEmail(auth.email || emailFromTenant);
      setCredPassword('');
      setCredConfirmPassword('');
      setCredMustChangePassword(auth.mustChangePassword !== false);
    } else {
      setCredEmail(emailFromTenant);
      setCredPassword('');
      setCredConfirmPassword('');
      setCredMustChangePassword(true);
    }
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
    const auth = collaboratorId ? getUserAuthByCollaborator(collaboratorId) : null;
    const isNewOrChangingPassword = !auth || credPassword.length > 0;
    if (isNewOrChangingPassword) {
      if (credPassword.length < MIN_PASSWORD_LENGTH) return 'Senha deve ter no mínimo 8 caracteres.';
      if (credPassword !== credConfirmPassword) return 'Senha e confirmar senha devem ser iguais.';
    }
    return null;
  };

  const handleSave = async () => {
    if (!currentUser || !canManageAccess(currentUser)) return;
    if (!effectiveTargetUserId) {
      onSaveError?.('Crie o acesso do colaborador antes de salvar permissões individuais.');
      return;
    }
    const credErr = validateCredentials();
    if (credErr) {
      onSaveError?.(credErr);
      return;
    }
    setSaving(true);
    try {
      if (isSaasModeEnabled()) {
        if (!saasTenantId) {
          throw new Error('Clínica não identificada para salvar no servidor. Faça login novamente.');
        }
        await saveCollaboratorAccessBundle({
          tenant_id: saasTenantId,
          collaborator_id: collaboratorId || '',
          target_user_id: effectiveTargetUserId,
          email: credEmail.trim().toLowerCase(),
          password: credPassword || '',
          role: role || 'atendimento',
          has_system_access: hasSystemAccess,
          permission_overrides: overrides || {},
        });
      }
      if (isSaasModeEnabled() && !getUserAccess(effectiveTargetUserId)) {
        ensureLocalUserForSaasAccess(effectiveTargetUserId, {
          email: (credEmail || '').trim().toLowerCase(),
          role: role || 'atendimento',
          has_system_access: hasSystemAccess,
          displayName: (linkedDisplayName || '').trim(),
          tenantId: saasTenantId || '',
        });
      }
      updateUserAccess(currentUser, effectiveTargetUserId, {
        has_system_access: hasSystemAccess,
        role: role || 'atendimento',
        overrides,
      });
      if (hasSystemAccess && (credEmail || '').trim()) {
        const auth = collaboratorId ? getUserAuthByCollaborator(collaboratorId) : null;
        const isNewPassword = !auth || credPassword.length > 0;
        await saveUserAuth(
          currentUser,
          collaboratorId,
          {
            email: credEmail.trim().toLowerCase(),
            password: credPassword || '',
            mustChangePassword: credMustChangePassword,
          },
          isNewPassword
        );
      }
      setInitialSnapshot(JSON.stringify(getUserAccess(effectiveTargetUserId)));
      setDirty(false);
      setCredPassword('');
      setCredConfirmPassword('');
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

  const roleOptions = ROLES.filter((r) => r !== ROLE_ADMIN);
  const canManage = canManageAccess(currentUser);
  const readOnly = !canEdit || !canManage;
  const tenantId = getDefaultTenant()?.id || saasTenantId || '';
  const inviteTargetEmail = (credEmail || collaboratorEmail || '').trim().toLowerCase();
  const invitationForEmail = useMemo(() => {
    if (!tenantId || !inviteTargetEmail) return null;
    const invitations = listInvitations(tenantId, false)
      .filter((inv) => (inv.email || '').trim().toLowerCase() === inviteTargetEmail)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    return invitations[0] || null;
  }, [tenantId, inviteTargetEmail]);
  const inviteStatus = resolveInvitationStatus(invitationForEmail);
  const disabledTooltip = readOnly
    ? 'Você não tem permissão para editar acessos. Entre em contato com o administrador.'
    : null;
  const canResendInvite = Boolean(tenantId && inviteTargetEmail && ['pendente', 'enviado', 'expirado'].includes(inviteStatus));
  const canSavePermissions = Boolean(effectiveTargetUserId);

  const handleResendInvite = () => {
    if (!canResendInvite || !currentUser) return;
    try {
      const pending = findPendingInvitationByEmail(tenantId, inviteTargetEmail);
      if (!pending?.id) {
        onSaveError?.('Não há convite pendente para este usuário.');
        return;
      }
      refreshInvitation(currentUser, tenantId, pending.id);
      onSaveSuccess?.();
    } catch (err) {
      onSaveError?.(err?.message || 'Erro ao reenviar convite.');
    }
  };

  if (!collaboratorId && !collaboratorEmail && !tenantUser) {
    return (
      <div className="access-tab access-tab-empty">
        <p className="muted">Selecione um colaborador para configurar permissões.</p>
      </div>
    );
  }

  return (
    <div className="access-tab access-tab-v2">
      {/* Header premium */}
      <header className="access-tab-header-premium">
        <div className="access-tab-header-row">
          <div className="access-tab-toggle-row">
            <label className="access-tab-toggle-label">Acesso ao sistema</label>
            <button
              type="button"
              role="switch"
              aria-checked={hasSystemAccess}
              aria-describedby={disabledTooltip ? 'access-disabled-tooltip' : undefined}
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
          <div className="access-tab-profile-row">
            <label className="access-tab-label" htmlFor="access-role-select">
              Perfil de Acesso
            </label>
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
              aria-describedby={disabledTooltip ? 'access-disabled-tooltip' : undefined}
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r] || r}
                </option>
              ))}
            </select>
          </div>
          <div className="access-tab-search-row">
            <Search size={18} className="access-tab-search-icon" aria-hidden />
            <input
              type="search"
              id="access-search"
              placeholder="Buscar permissão"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="access-tab-search-input"
              aria-label="Buscar permissão"
              autoComplete="off"
            />
          </div>
          <div className="access-tab-header-actions">
            <span className={`access-badge ${inviteStatus === 'aceito' ? 'on' : 'off'}`}>
              Convite: {inviteStatus}
            </span>
            {canResendInvite ? (
              <Button variant="ghost" icon={Mail} onClick={handleResendInvite} disabled={readOnly || saving}>
                Reenviar convite
              </Button>
            ) : null}
            <Button variant="ghost" onClick={handleRevert} disabled={readOnly || !dirty} title={disabledTooltip}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={Save}
              loading={saving}
              onClick={handleSave}
              disabled={readOnly || saving || !dirty || !canSavePermissions}
              title={!canSavePermissions ? 'Crie o acesso antes de salvar permissões.' : disabledTooltip}
            >
              Salvar permissões
            </Button>
          </div>
        </div>
        {disabledTooltip && (
          <p id="access-disabled-tooltip" className="access-tab-disabled-hint" role="status">
            <Info size={14} aria-hidden /> {disabledTooltip}
          </p>
        )}
        {!canSavePermissions ? (
          <p className="access-tab-disabled-hint" role="status">
            <Info size={14} aria-hidden /> Use &quot;Criar acesso&quot; para habilitar o salvamento das permissões no servidor.
          </p>
        ) : null}
      </header>

      {hasSystemAccess && (
        <section className="access-tab-credentials access-tab-card">
          <h4 className="access-tab-section-title">Credenciais de Acesso</h4>
          <div className="access-tab-credentials-grid">
            <Field label="E-mail" error={!credEmail.trim() && dirty ? 'Obrigatório' : null}>
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
              />
            </Field>
            <Field
              label="Senha"
              error={
                credPassword.length > 0 && credPassword.length < MIN_PASSWORD_LENGTH
                  ? `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`
                  : null
              }
            >
              <input
                type="password"
                value={credPassword}
                onChange={(e) => {
                  setCredPassword(e.target.value);
                  setDirty(true);
                }}
                disabled={readOnly}
                className="access-tab-input"
                placeholder="Deixe em branco para manter a atual"
              />
            </Field>
            <Field
              label="Confirmar senha"
              error={credPassword !== credConfirmPassword && credConfirmPassword.length > 0 ? 'Senhas não conferem' : null}
            >
              <input
                type="password"
                value={credConfirmPassword}
                onChange={(e) => {
                  setCredConfirmPassword(e.target.value);
                  setDirty(true);
                }}
                disabled={readOnly}
                className="access-tab-input"
              />
            </Field>
            <div className="access-tab-must-change-row">
              <label>
                <input
                  type="checkbox"
                  checked={credMustChangePassword}
                  onChange={(e) => {
                    setCredMustChangePassword(e.target.checked);
                    setDirty(true);
                  }}
                  disabled={readOnly}
                />
                <span>Forçar troca de senha no primeiro acesso</span>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* Controles rápidos + contador total */}
      <div className="access-tab-quick-controls">
        <div className="access-tab-quick-buttons">
          <button
            type="button"
            className="access-tab-quick-btn"
            onClick={selectAll}
            disabled={readOnly}
            title={disabledTooltip || 'Selecionar todas as permissões'}
          >
            <CheckSquare size={16} aria-hidden />
            Selecionar tudo
          </button>
          <button
            type="button"
            className="access-tab-quick-btn"
            onClick={clearAll}
            disabled={readOnly}
            title={disabledTooltip || 'Limpar todas as permissões'}
          >
            <Square size={16} aria-hidden />
            Limpar tudo
          </button>
        </div>
        <span className="access-tab-total-counter" aria-live="polite">
          {allowedCount}/{totalPerms} permissões
        </span>
      </div>

      {/* Accordion por setor */}
      <div className="access-tab-permissions-list">
        {sectorsWithPerms.map((sector) => {
          const { selected, total } = sectorCount(sector.key);
          const isExpanded = expandedSectors.has(sector.key);

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
                <span className="access-tab-sector-counter">
                  {selected}/{total}
                </span>
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
                    title={disabledTooltip || `Selecionar tudo em ${sector.label}`}
                  >
                    Selecionar setor
                  </button>
                  <button
                    type="button"
                    className="access-tab-sector-btn"
                    onClick={() => clearAllInSector(sector.key)}
                    disabled={readOnly}
                    title={disabledTooltip || `Limpar tudo em ${sector.label}`}
                  >
                    Limpar setor
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
                          <th scope="row" className="access-tab-matrix-base-cell">
                            {row.label}
                          </th>
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
                                  title={disabledTooltip || perm?.description || `${ACTION_LABELS[actionKey] || actionKey}: ação não aplicável para esta base`}
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

      {sectorsWithPerms.length === 0 && search.trim() && (
        <p className="access-tab-no-results">Nenhuma permissão encontrada para &quot;{search}&quot;.</p>
      )}
    </div>
  );
}
