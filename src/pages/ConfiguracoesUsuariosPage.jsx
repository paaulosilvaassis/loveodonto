import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { useTenant } from '../tenant/useTenant.js';
import { getTenant } from '../services/tenantService.js';
import { DEV_BACKEND_NOT_RUNNING_MSG } from '../config/adminApiBase.js';
import { Field } from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import UsuarioMemberModal from '../components/configuracoes/UsuarioMemberModal.jsx';
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalRoot,
  ModalTitle,
} from '../components/ui/Modal.jsx';
import {
  createTenantUserAccess,
  listTenantUsersAccess,
  provisionCollaboratorSystemAccess,
  resendCollaboratorInvite,
  setTenantUserSystemAccess,
  removeTenantUserAccess,
} from '../services/collaboratorAccessProvisionService.js';
import { listTenantCollaborators } from '../services/tenantCollaboratorService.js';
import { canManageTenantUsers } from '../utils/rbacHelpers.js';
import { ensureSaasUserInLocalDb } from '../services/saasUserSeedService.js';
import {
  buildCollaboratorLookupMaps,
  formatCollaboratorLinkLabel,
  resolveCollaboratorForTenantUser,
} from '../utils/collaboratorTenantLink.js';
import { MEMBERSHIP_ROLE_LABELS, INVITABLE_ROLES } from '../constants/tenantRoles.js';
import { notifyInviteDeliveryResult } from '../utils/inviteDeliveryFeedback.js';
import AppAvatar from '../components/common/AppAvatar.jsx';
import { getUserAvatarUrl } from '../utils/avatarUtils.js';
import { looksLikeEmail } from '../utils/userDisplayName.js';
import {
  UserPlus,
  Trash2,
  Pencil,
  Eye,
  Mail,
  MoreVertical,
  UserX,
  UserCheck,
  Search,
  Users,
  ShieldCheck,
  MailWarning,
  Link2,
  RefreshCw,
} from 'lucide-react';

function formatUpdatedAt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

function isMemberAccessActive(m) {
  return m.has_system_access !== false && m.user_active !== false;
}

function resolveInvitationStatus(invitation, member) {
  if (member?.user_id && isMemberAccessActive(member)) {
    if (!invitation || invitation.accepted_at || invitation.status === 'accepted') {
      return 'aceito';
    }
  }
  if (!invitation) return 'sem_convite';
  if (invitation.accepted_at) return 'aceito';
  if (invitation.status === 'sent') return 'enviado';
  if (invitation.status === 'accepted') return 'aceito';
  if (invitation.expires_at && invitation.expires_at <= new Date().toISOString()) return 'expirado';
  return 'pendente';
}

function invitationStatusLabel(status) {
  if (status === 'sem_convite') return 'Sem convite';
  if (status === 'aceito') return 'Acesso ativo';
  if (status === 'enviado') return 'Convite enviado';
  if (status === 'pendente') return 'Convite pendente';
  if (status === 'expirado') return 'Convite expirado';
  return status;
}

function getUserInitials(name, email) {
  const display = String(name || '').trim();
  if (display && !looksLikeEmail(display)) {
    const parts = display.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const second = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return `${first}${second}`.toUpperCase() || '?';
  }
  return String(email || '?')[0].toUpperCase();
}

function resolveMemberUnifiedStatus(member, invitation) {
  const active = isMemberAccessActive(member);
  const inviteStatus = resolveInvitationStatus(invitation, member);

  if (!active) {
    return { label: 'Inativo', tone: 'muted' };
  }
  if (inviteStatus === 'expirado') {
    return { label: 'Convite expirado', tone: 'warning' };
  }
  if (inviteStatus === 'pendente' || inviteStatus === 'enviado') {
    return { label: invitationStatusLabel(inviteStatus), tone: 'warning' };
  }
  if (inviteStatus === 'aceito' || member?.user_id) {
    return { label: 'Acesso ativo', tone: 'success' };
  }
  return { label: 'Sem convite', tone: 'muted' };
}

function resolveCollaboratorCell(member) {
  if (!member?.linked_collaborator && !member?.collaborator_id) {
    return { text: '—', linked: false };
  }
  const label = member.linked_collaborator
    ? formatCollaboratorLinkLabel(member.linked_collaborator)
    : 'Colaborador vinculado';
  const sameAsUser = label === member.full_name;
  return {
    text: sameAsUser ? 'Vinculado ao RH' : label,
    linked: true,
  };
}

function normalizeUiAccessErrorMessage(message) {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return 'Falha ao processar a solicitação.';
  if (lower.includes('backend saas') || lower.includes('porta 3001')) {
    return 'Não foi possível conectar ao backend SaaS.';
  }
  if (lower.includes('este e-mail já possui acesso')) {
    return 'Este e-mail já possui acesso.';
  }
  if (lower.includes('tenant_users_user_id_required') || lower.includes('sem conta no auth')) {
    return 'Conta no Auth ausente. Tente convidar novamente — o sistema recria a conta automaticamente.';
  }
  if (lower.includes('convite') && lower.includes('sent')) {
    return 'Convite já enviado para este e-mail.';
  }
  if (lower.includes('tenant') && (lower.includes('não encontrado') || lower.includes('obrigatório'))) {
    return 'Tenant não encontrado.';
  }
  if (lower.includes('supabase da plataforma não configurado') || lower.includes('configurado')) {
    return 'Configuração do backend ausente.';
  }
  if (lower.includes('collaborator_id') && lower.includes('tenant_users') && lower.includes('schema cache')) {
    return 'Migration pendente: invitation_status/collaborator_id não existe no banco atual. Aplique a migration 005_app_collaborator_access_invites.sql no projeto Supabase do backend.';
  }
  return raw;
}

function UsuarioRowActions({
  active,
  canManageRow,
  canResendInvite,
  saving,
  onView,
  onEdit,
  onToggleAccess,
  onResendInvite,
  onRemove,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const hasSecondaryActions = canResendInvite || canManageRow;

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

  return (
    <div className="collaborator-row-actions collaborator-row-actions--icons access-user-row-actions">
      <button
        type="button"
        className="collaborator-icon-btn"
        title="Ver detalhes"
        aria-label="Ver detalhes"
        onClick={onView}
        disabled={saving}
      >
        <Eye size={16} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        className="collaborator-icon-btn"
        title="Editar"
        aria-label="Editar"
        onClick={onEdit}
        disabled={saving}
      >
        <Pencil size={16} strokeWidth={2} aria-hidden />
      </button>
      {canManageRow ? (
        <button
          type="button"
          className={`collaborator-icon-btn ${active ? 'collaborator-icon-btn--deactivate' : 'collaborator-icon-btn--activate'}`}
          title={active ? 'Desativar acesso' : 'Ativar acesso'}
          aria-label={active ? 'Desativar acesso' : 'Ativar acesso'}
          onClick={onToggleAccess}
          disabled={saving}
        >
          {active ? (
            <UserX size={16} strokeWidth={2} aria-hidden />
          ) : (
            <UserCheck size={16} strokeWidth={2} aria-hidden />
          )}
        </button>
      ) : null}
      {hasSecondaryActions ? (
        <div className="access-user-row-menu" ref={menuRef}>
          <button
            type="button"
            className="collaborator-icon-btn"
            title="Mais ações"
            aria-label="Mais ações"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            disabled={saving}
          >
            <MoreVertical size={16} strokeWidth={2} aria-hidden />
          </button>
          {menuOpen ? (
            <div className="access-user-row-menu-dropdown" role="menu">
              {canResendInvite ? (
                <button
                  type="button"
                  className="access-user-row-menu-item"
                  role="menuitem"
                  onClick={() => {
                    onResendInvite();
                    setMenuOpen(false);
                  }}
                >
                  <Mail size={14} aria-hidden />
                  <span>Reenviar convite</span>
                </button>
              ) : null}
              {canManageRow ? (
                <button
                  type="button"
                  className="access-user-row-menu-item access-user-row-menu-item--danger"
                  role="menuitem"
                  onClick={() => {
                    onRemove();
                    setMenuOpen(false);
                  }}
                >
                  <Trash2 size={14} aria-hidden />
                  <span>Remover vínculo</span>
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ConfiguracoesUsuariosPage() {
  const { user } = useAuth();
  const { tenant, currentUser, loading: tenantLoading, error: tenantError, refreshTenantContext } = useTenant();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [modalInvite, setModalInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('atendimento');
  const [inviteAccess, setInviteAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [memberModal, setMemberModal] = useState({ open: false, member: null, mode: 'view' });
  const [modalCreateUser, setModalCreateUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('dentista');
  const [newUserStatus, setNewUserStatus] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');

  const tenantId = user?.tenantId || null;
  const tenantLabel = tenant?.trade_name
    || tenant?.name
    || (tenantId ? getTenant(tenantId)?.name : null)
    || 'Clínica';
  const isMaster = canManageTenantUsers(user, tenantId, currentUser);

  const pageStats = useMemo(() => {
    let activeCount = 0;
    let pendingCount = 0;
    members.forEach((member) => {
      if (isMemberAccessActive(member)) activeCount += 1;
      const invitationForMember = invitations.find(
        (inv) => (inv.email || '').trim().toLowerCase() === (member.email || '').trim().toLowerCase(),
      );
      const inviteStatus = resolveInvitationStatus(invitationForMember, member);
      if (['pendente', 'enviado', 'expirado'].includes(inviteStatus)) pendingCount += 1;
    });
    return {
      total: members.length,
      active: activeCount,
      pending: pendingCount,
    };
  }, [members, invitations]);

  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return members;
    return members.filter((member) => {
      const roleLabel = (MEMBERSHIP_ROLE_LABELS[member.role] || member.role || '').toLowerCase();
      const collaboratorLabel = member.linked_collaborator
        ? formatCollaboratorLinkLabel(member.linked_collaborator).toLowerCase()
        : '';
      return (
        String(member.full_name || '').toLowerCase().includes(query)
        || String(member.email || '').toLowerCase().includes(query)
        || roleLabel.includes(query)
        || collaboratorLabel.includes(query)
      );
    });
  }, [members, searchQuery]);

  useEffect(() => {
    if (!user?.id || !tenantId || user.authMode !== 'saas') return;
    try {
      ensureSaasUserInLocalDb(user);
    } catch {
      /* non-blocking */
    }
  }, [user?.id, user?.role, user?.isMaster, user?.saasAppRole, tenantId, user?.authMode]);

  const pushToast = (type, message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    setError('');
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3800);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;
    setSaving(true);
    setError('');

    listTenantCollaborators(tenantId, { bundle: true, reconcileLinks: true })
      .then((bundle) => {
        if (!active) return;
        const collaborators = bundle.collaborators || [];
        const collaboratorMaps = buildCollaboratorLookupMaps(collaborators);
        const users = (bundle.tenantUsers || []).filter(
          (row) => String(row?.tenant_id || tenantId) === tenantId,
        );
        setMembers(users.map((u) => ({
          ...u,
          name: u.full_name || '',
          phone: u.phone || '',
          internal_notes: u.internal_notes || '',
          tenant_name: tenantLabel,
          linked_collaborator: resolveCollaboratorForTenantUser(u, collaboratorMaps),
        })));
        const invs = users
          .map((u) => u?.invitation)
          .filter(Boolean)
          .sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
        setInvitations(invs);
      })
      .catch((err) => {
        if (!active) return;
        showError(normalizeUiAccessErrorMessage(err?.message || 'Não foi possível carregar colaboradores da clínica.'));
      })
      .finally(() => {
        if (!active) return;
        setSaving(false);
      });
    return () => {
      active = false;
    };
  }, [tenantId, refreshKey, tenantLabel]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const showError = (msg) => {
    setError(msg);
    setToast(null);
  };

  const openMemberModal = (member, mode) => {
    setMemberModal({ open: true, member, mode });
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setError('');
    if (!inviteEmail.trim()) {
      showError('E-mail é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      const email = inviteEmail.trim().toLowerCase();
      const result = await provisionCollaboratorSystemAccess({
        tenant_id: tenantId,
        create_system_access: inviteAccess,
        email,
        profile_role: inviteRole,
        send_invite: true,
      });
      notifyInviteDeliveryResult(result?.invite_delivery, {
        onCopyLink: handleCopyInviteUrl,
        pushToast,
      });
      setModalInvite(false);
      setInviteEmail('');
      setInviteRole('atendimento');
      setInviteAccess(true);
      refresh();
    } catch (err) {
      showError(normalizeUiAccessErrorMessage(err?.message || 'Erro ao criar convite.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    const nameTrim = newUserName.trim();
    const emailTrim = newUserEmail.trim().toLowerCase();
    if (!tenantId) {
      showError('Não foi possível identificar a clínica.');
      return;
    }
    if (!nameTrim) {
      showError('Nome é obrigatório.');
      return;
    }
    if (!emailTrim) {
      showError('E-mail é obrigatório.');
      return;
    }
    if (!newUserPassword || newUserPassword.length < 8) {
      showError('Senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setCreatingUser(true);
    try {
      await createTenantUserAccess({
        tenant_id: tenantId,
        full_name: nameTrim,
        email: emailTrim,
        password: newUserPassword,
        profile_role: newUserRole,
        status: newUserStatus,
        send_invite: false,
      });
      pushToast('success', 'Usuário criado com sucesso e vinculado à clínica.');
      setModalCreateUser(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('dentista');
      setNewUserStatus('active');
      refresh();
    } catch (err) {
      showError(normalizeUiAccessErrorMessage(err?.message || 'Erro ao criar usuário.'));
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCopyInviteUrl = (url) => {
    try {
      navigator.clipboard.writeText(url);
      pushToast('success', 'Link copiado.');
    } catch {
      showError('Não foi possível copiar.');
    }
  };

  const handleToggleAccessClick = async (m) => {
    if (m.user_id === user?.id) return;
    const active = isMemberAccessActive(m);
    const nextAccess = !active;
    if (!nextAccess) {
      if (
        !window.confirm(
          'Desativar o acesso deste usuário ao sistema? O login ficará bloqueado até reativar. O cadastro não será apagado.'
        )
      ) {
        return;
      }
    }
    setSaving(true);
    try {
      await setTenantUserSystemAccess(m.id, { tenant_id: tenantId, has_system_access: nextAccess });
      pushToast('success', nextAccess ? 'Acesso ativado.' : 'Acesso desativado.');
      refresh();
    } catch (err) {
      showError(err?.message || 'Erro ao alterar acesso.');
    } finally {
      setSaving(false);
    }
  };

  const handleResendInviteForMember = async (m) => {
    setSaving(true);
    try {
      const result = await resendCollaboratorInvite({
        tenant_id: tenantId,
        email: m.email,
        collaborator_id: m.collaborator_id || null,
      });
      notifyInviteDeliveryResult(result?.invite_delivery, {
        onCopyLink: handleCopyInviteUrl,
        pushToast,
      });
      refresh();
    } catch (err) {
      showError(normalizeUiAccessErrorMessage(err?.message || 'Não foi possível reenviar o convite.'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (member) => {
    const memberName = member?.full_name || member?.email || 'Usuário';
    if (!member?.id) {
      showError('Não foi possível identificar o vínculo deste usuário.');
      return;
    }
    if (!window.confirm(`Remover o vínculo de "${memberName}" com esta clínica? O usuário perderá o acesso aqui, mas a conta no Auth não será apagada.`)) {
      return;
    }
    setSaving(true);
    try {
      await removeTenantUserAccess(member.id, { tenant_id: tenantId });
      pushToast('success', 'Vínculo removido. Você pode convidar este e-mail novamente.');
      refresh();
    } catch (err) {
      showError(normalizeUiAccessErrorMessage(err?.message || 'Não foi possível remover o vínculo.'));
    } finally {
      setSaving(false);
    }
  };

  if (tenantLoading && !tenantId) {
    return (
      <div className="stack" style={{ padding: '2rem' }}>
        <p className="muted">Carregando dados da clínica…</p>
      </div>
    );
  }

  if (!tenantId) {
    return (
      <div className="stack" style={{ padding: '2rem', maxWidth: '36rem' }}>
        <p className="form-error">Usuário sem vínculo com clínica. Entre em contato com o administrador.</p>
        {tenantError ? (
          <p className="error" style={{ marginTop: '0.75rem' }}>{tenantError}</p>
        ) : null}
        <p className="muted" style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
          {import.meta.env.DEV
            ? DEV_BACKEND_NOT_RUNNING_MSG
            : 'Verifique se sua conta está vinculada a uma clínica ativa.'}
        </p>
        <div className="flex gap-sm" style={{ marginTop: '1rem' }}>
          <Button type="button" variant="primary" onClick={() => refreshTenantContext(false)}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (!isMaster && tenantLoading) {
    return (
      <div className="stack" style={{ padding: '2rem' }}>
        <p className="muted">Validando permissões de administrador…</p>
      </div>
    );
  }

  if (!isMaster) {
    return (
      <div className="stack" style={{ padding: '2rem' }}>
        <p className="error">Apenas o administrador (MASTER) pode gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="tenant-users-page">
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.message}
        </div>
      )}

      <header className="tenant-users-page__header">
        <div className="tenant-users-page__intro">
          <h1 className="tenant-users-page__title">Usuários e acessos</h1>
          <p className="tenant-users-page__subtitle">
            Gerencie quem acessa <strong>{tenantLabel}</strong>, perfis de permissão e convites de primeiro acesso.
          </p>
        </div>
        <div className="tenant-users-page__header-actions">
          <Button
            variant="secondary"
            icon={Mail}
            onClick={() => { setError(''); setModalInvite(true); }}
          >
            Convidar usuário
          </Button>
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={() => { setError(''); setModalCreateUser(true); }}
          >
            Novo usuário
          </Button>
        </div>
      </header>

      {error ? (
        <div className="tenant-users-page__alert error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="tenant-users-page__kpis">
        <article className="tenant-users-kpi">
          <span className="tenant-users-kpi__icon" aria-hidden>
            <Users size={18} />
          </span>
          <div>
            <p className="tenant-users-kpi__value">{pageStats.total}</p>
            <p className="tenant-users-kpi__label">Usuários vinculados</p>
          </div>
        </article>
        <article className="tenant-users-kpi">
          <span className="tenant-users-kpi__icon tenant-users-kpi__icon--success" aria-hidden>
            <ShieldCheck size={18} />
          </span>
          <div>
            <p className="tenant-users-kpi__value">{pageStats.active}</p>
            <p className="tenant-users-kpi__label">Com acesso ativo</p>
          </div>
        </article>
        <article className="tenant-users-kpi">
          <span className="tenant-users-kpi__icon tenant-users-kpi__icon--warning" aria-hidden>
            <MailWarning size={18} />
          </span>
          <div>
            <p className="tenant-users-kpi__value">{pageStats.pending}</p>
            <p className="tenant-users-kpi__label">Convites pendentes</p>
          </div>
        </article>
      </div>

      <section className="tenant-users-panel" aria-labelledby="tenant-users-list-title">
        <div className="tenant-users-panel__toolbar">
          <h2 id="tenant-users-list-title" className="tenant-users-panel__title">
            Equipe com acesso ao sistema
          </h2>
          <div className="tenant-users-panel__toolbar-actions">
            <label className="tenant-users-search">
              <Search size={16} aria-hidden className="tenant-users-search__icon" />
              <input
                type="search"
                className="tenant-users-search__input"
                placeholder="Buscar por nome, e-mail ou perfil…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label="Buscar usuários"
              />
            </label>
            <button
              type="button"
              className="tenant-users-refresh-btn"
              onClick={refresh}
              disabled={saving}
              title="Atualizar lista"
              aria-label="Atualizar lista"
            >
              <RefreshCw size={16} className={saving ? 'is-spinning' : ''} />
            </button>
          </div>
        </div>

        <div className="tenant-users-grid-wrap">
          <div className="tenant-users-grid" role="table" aria-label="Usuários da clínica">
            <div className="tenant-users-grid__header" role="row">
              <div role="columnheader">Usuário</div>
              <div role="columnheader">Colaborador RH</div>
              <div role="columnheader">Perfil</div>
              <div role="columnheader">Status</div>
              <div role="columnheader">Atualizado</div>
              <div className="tenant-users-grid__actions-head" role="columnheader">Ações</div>
            </div>

            {saving && members.length === 0 ? (
              <div className="tenant-users-empty" role="row">
                <p>Carregando usuários…</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <div className="tenant-users-empty" role="row">
                <p>
                  {members.length === 0
                    ? 'Nenhum usuário vinculado ainda. Convide a equipe ou crie um acesso manualmente.'
                    : 'Nenhum resultado para a busca atual.'}
                </p>
                {members.length === 0 ? (
                  <div className="tenant-users-empty__actions">
                    <Button variant="primary" icon={Mail} onClick={() => setModalInvite(true)}>
                      Convidar usuário
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : (
              filteredMembers.map((member) => {
                const active = isMemberAccessActive(member);
                const canManageRow = member.user_id !== user?.id;
                const invitationForMember = invitations
                  .filter((inv) => (inv.email || '').trim().toLowerCase() === (member.email || '').trim().toLowerCase())
                  .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0] || null;
                const inviteStatus = resolveInvitationStatus(invitationForMember, member);
                const canResendInvite = ['pendente', 'enviado', 'expirado'].includes(inviteStatus);
                const unifiedStatus = resolveMemberUnifiedStatus(member, invitationForMember);
                const collaboratorCell = resolveCollaboratorCell(member);

                return (
                  <div key={member.id} className="tenant-users-grid__row" role="row">
                    <div className="tenant-users-grid__user" role="cell">
                      <AppAvatar
                        photoUrl={getUserAvatarUrl(member)}
                        name={member.full_name || member.email}
                        email={member.email}
                        className="tenant-users-avatar"
                        size="inherit"
                      />
                      <div className="tenant-users-grid__user-text">
                        <button
                          type="button"
                          className="tenant-users-grid__name-btn"
                          onClick={() => openMemberModal(member, 'view')}
                        >
                          {member.full_name || '—'}
                        </button>
                        <span className="tenant-users-grid__email">{member.email || '—'}</span>
                      </div>
                    </div>

                    <div className="tenant-users-grid__cell" role="cell">
                      {collaboratorCell.linked ? (
                        <span className="tenant-users-rh-link" title={collaboratorCell.text}>
                          <Link2 size={14} aria-hidden />
                          <span className="tenant-users-cell-truncate">{collaboratorCell.text}</span>
                        </span>
                      ) : (
                        <span className="tenant-users-grid__muted">—</span>
                      )}
                    </div>

                    <div className="tenant-users-grid__cell" role="cell">
                      <span className="tenant-users-role-pill">
                        {MEMBERSHIP_ROLE_LABELS[member.role] || member.role || '—'}
                      </span>
                    </div>

                    <div className="tenant-users-grid__cell" role="cell">
                      <span className={`tenant-users-status tenant-users-status--${unifiedStatus.tone}`}>
                        {unifiedStatus.label}
                      </span>
                    </div>

                    <div className="tenant-users-grid__cell tenant-users-grid__date" role="cell">
                      {formatUpdatedAt(member.updated_at)}
                    </div>

                    <div className="tenant-users-grid__actions" role="cell">
                      <UsuarioRowActions
                        active={active}
                        canManageRow={canManageRow}
                        canResendInvite={canResendInvite}
                        saving={saving}
                        onView={() => openMemberModal(member, 'view')}
                        onEdit={() => openMemberModal(member, 'edit')}
                        onToggleAccess={() => handleToggleAccessClick(member)}
                        onResendInvite={() => handleResendInviteForMember(member)}
                        onRemove={() => handleRemove(member)}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <ModalRoot open={modalInvite} onOpenChange={(next) => { if (!next) { setModalInvite(false); setError(''); } }}>
        <ModalContent size="sm" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader>
            <ModalTitle>Convidar usuário</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleInvite} id="invite-form">
            <ModalBody className="stack">
              <Field label="E-mail">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  required
                />
              </Field>
              <Field label="Perfil">
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  {INVITABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{MEMBERSHIP_ROLE_LABELS[r] || r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Acesso ao sistema">
                <label>
                  <input type="checkbox" checked={inviteAccess} onChange={(e) => setInviteAccess(e.target.checked)} />
                  {' '}Ativo
                </label>
              </Field>
            </ModalBody>
          </form>
          <ModalFooter>
            <Button type="submit" form="invite-form" variant="primary" disabled={saving}>
              {saving ? 'Criando…' : 'Criar convite'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => { setModalInvite(false); setError(''); }}>
              Cancelar
            </Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>

      <ModalRoot open={modalCreateUser} onOpenChange={(next) => { if (!next) { setModalCreateUser(false); setError(''); } }}>
        <ModalContent size="sm" onInteractOutside={(e) => e.preventDefault()}>
          <ModalHeader>
            <ModalTitle>Novo usuário</ModalTitle>
          </ModalHeader>
          <form onSubmit={handleCreateUser} id="create-user-form">
            <ModalBody className="stack">
              <Field label="Nome">
                <input
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Nome completo"
                  required
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="email@exemplo.com"
                  required
                />
              </Field>
              <Field label="Senha">
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                  minLength={8}
                  required
                />
              </Field>
              <Field label="Cargo">
                <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}>
                  <option value="dentista">Dentista</option>
                  <option value="recepcao">Recepção</option>
                  <option value="financeiro">Financeiro</option>
                  <option value="master">Admin</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={newUserStatus} onChange={(e) => setNewUserStatus(e.target.value)}>
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </Field>
            </ModalBody>
          </form>
          <ModalFooter>
            <Button type="submit" form="create-user-form" variant="primary" disabled={creatingUser}>
              {creatingUser ? 'Criando…' : 'Criar usuário'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalCreateUser(false);
                setError('');
              }}
              disabled={creatingUser}
            >
              Cancelar
            </Button>
          </ModalFooter>
        </ModalContent>
      </ModalRoot>

      {memberModal.open && memberModal.member ? (
        <UsuarioMemberModal
          open={memberModal.open}
          member={memberModal.member}
          mode={memberModal.mode}
          onClose={() => setMemberModal({ open: false, member: null, mode: 'view' })}
          onSwitchMode={(next) => setMemberModal((prev) => ({ ...prev, mode: next }))}
          tenantId={tenantId}
          actor={user}
          onAfterSave={refresh}
          onNotify={pushToast}
        />
      ) : null}
    </div>
  );
}
