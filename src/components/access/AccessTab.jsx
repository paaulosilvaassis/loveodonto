import { useMemo, useState, useEffect } from 'react';
import {
  getPermissionsCatalog,
  getUserAccess,
  getRoleDefaultPermissionIds,
  updateUserAccess,
  canManageAccess,
  ROLES,
  ROLE_LABELS,
  ROLE_ADMIN,
} from '../../services/accessService.js';
import { getUserAuthByCollaborator, saveUserAuth } from '../../services/userAuthService.js';
import { MODULES_SPEC, ACTION_LABELS } from '../../permissions/catalog.js';
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
} from 'lucide-react';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Mapeamento de setores para agrupar permissões (accordion).
 * Ajustado aos módulos reais do app conforme MODULES_SPEC.
 */
const SECTORS = [
  { key: 'dashboard', label: 'Dashboard', moduleKeys: ['dashboard'] },
  { key: 'patients', label: 'Pacientes', moduleKeys: ['patients'] },
  {
    key: 'prontuario',
    label: 'Prontuário',
    moduleKeys: [
      'prontuario_atendimento',
      'prontuario_planejamento',
      'prontuario_procedimentos',
      'prontuario_orcamentos',
      'prontuario_contratos',
      'prontuario_documentos',
      'prontuario_dados_clinicos',
    ],
  },
  { key: 'agenda', label: 'Agenda', moduleKeys: ['agenda'] },
  {
    key: 'financeiro',
    label: 'Financeiro',
    moduleKeys: ['financeiro_contas_receber', 'financeiro_contas_pagar', 'financeiro_caixa', 'financeiro_relatorios'],
  },
  { key: 'crm', label: 'CRM', moduleKeys: ['pipeline_crm', 'comercial'] },
  { key: 'estoque', label: 'Estoque', moduleKeys: ['estoque'] },
  { key: 'administracao', label: 'Administração', moduleKeys: ['equipe', 'configuracoes'] },
  { key: 'relatorios', label: 'Relatórios', moduleKeys: ['relatorios'] },
];

/**
 * Aba "Acessos" da Ficha do Colaborador: toggle acesso, perfil, permissões granulares, credenciais.
 * Design moderno com header premium, accordion por setor e controles rápidos.
 */
export default function AccessTab({
  collaboratorId,
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
  const [expandedSectors, setExpandedSectors] = useState(new Set(['dashboard', 'patients', 'prontuario']));

  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credConfirmPassword, setCredConfirmPassword] = useState('');
  const [credMustChangePassword, setCredMustChangePassword] = useState(true);

  const catalog = useMemo(() => getPermissionsCatalog(), []);
  const roleDefaultIds = useMemo(
    () => (role ? new Set(getRoleDefaultPermissionIds(role)) : new Set()),
    [role]
  );

  useEffect(() => {
    if (!targetUserId) {
      setHasSystemAccess(true);
      setRole('');
      setOverrides({});
      setInitialSnapshot(null);
      setDirty(false);
      setCredEmail('');
      setCredPassword('');
      setCredConfirmPassword('');
      setCredMustChangePassword(true);
      return;
    }
    const access = getUserAccess(targetUserId);
    if (!access) return;
    setHasSystemAccess(access.has_system_access);
    setRole(access.role);
    setOverrides(access.overrides || {});
    setInitialSnapshot(JSON.stringify(access));
    setDirty(false);
    const auth = collaboratorId ? getUserAuthByCollaborator(collaboratorId) : null;
    if (auth) {
      setCredEmail(auth.email || '');
      setCredPassword('');
      setCredConfirmPassword('');
      setCredMustChangePassword(auth.mustChangePassword !== false);
    } else {
      setCredEmail('');
      setCredPassword('');
      setCredConfirmPassword('');
      setCredMustChangePassword(true);
    }
  }, [targetUserId, collaboratorId]);

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
    return SECTORS.map((sector) => {
      const allPerms = catalog.filter((p) => sector.moduleKeys.includes(p.module_key));
      const perms = searchLower
        ? allPerms.filter(
            (p) =>
              sector.label.toLowerCase().includes(searchLower) ||
              p.description?.toLowerCase().includes(searchLower) ||
              ACTION_LABELS[p.action_key]?.toLowerCase().includes(searchLower)
          )
        : allPerms;
      return { ...sector, perms, allPerms };
    }).filter((s) => s.perms.length > 0);
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
    const sector = SECTORS.find((s) => s.key === sectorKey);
    if (!sector) return { selected: 0, total: 0 };
    const perms = catalog.filter((p) => sector.moduleKeys.includes(p.module_key));
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
    if (!targetUserId || !currentUser || !canManageAccess(currentUser)) return;
    const credErr = validateCredentials();
    if (credErr) {
      onSaveError?.(credErr);
      return;
    }
    setSaving(true);
    try {
      updateUserAccess(currentUser, targetUserId, {
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
      setInitialSnapshot(JSON.stringify(getUserAccess(targetUserId)));
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

  if (!targetUserId) {
    return (
      <div className="access-tab access-tab-empty">
        <p className="muted" style={{ marginBottom: '1rem' }}>
          Nenhum usuário vinculado. Vincule para definir perfil e permissões de login.
        </p>
        {onVincularUsuario && (
          <Button variant="primary" onClick={onVincularUsuario}>
            Vincular usuário
          </Button>
        )}
      </div>
    );
  }

  const roleOptions = ROLES.filter((r) => r !== ROLE_ADMIN);
  const canManage = canManageAccess(currentUser);
  const readOnly = !canEdit || !canManage;
  const disabledTooltip = readOnly
    ? 'Você não tem permissão para editar acessos. Entre em contato com o administrador.'
    : null;

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
            <Button variant="ghost" onClick={handleRevert} disabled={readOnly || !dirty} title={disabledTooltip}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={Save}
              loading={saving}
              onClick={handleSave}
              disabled={readOnly || saving || !dirty}
              title={disabledTooltip}
            >
              Salvar alterações
            </Button>
          </div>
        </div>
        {disabledTooltip && (
          <p id="access-disabled-tooltip" className="access-tab-disabled-hint" role="status">
            <Info size={14} aria-hidden /> {disabledTooltip}
          </p>
        )}
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
          const searchLower = (search || '').toLowerCase().trim();

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
                <div className="access-tab-grid">
                  {sector.perms.map((perm) => {
                    const actionLabel = ACTION_LABELS[perm.action_key];
                    const searchMatch =
                      searchLower &&
                      (actionLabel?.toLowerCase().includes(searchLower) ||
                        perm.description?.toLowerCase().includes(searchLower));
                    return (
                      <label
                        key={perm.id}
                        className={`access-tab-perm-row ${searchMatch ? 'access-tab-perm-highlight' : ''}`}
                        title={perm.description}
                      >
                        <input
                          type="checkbox"
                          checked={effectivePermission(perm.id)}
                          onChange={(e) => setPermission(perm.id, e.target.checked)}
                          disabled={readOnly}
                          aria-label={perm.description}
                          title={disabledTooltip}
                        />
                        <span className="access-tab-perm-label">{actionLabel || perm.action_key}</span>
                      </label>
                    );
                  })}
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
