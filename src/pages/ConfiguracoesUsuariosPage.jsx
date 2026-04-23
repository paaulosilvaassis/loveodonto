import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth.js';
import { Section } from '../components/Section.jsx';
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
import { getDefaultTenant } from '../services/tenantService.js';
import {
  listMembers,
  setMemberSystemAccess,
  removeMember,
} from '../services/membershipService.js';
import {
  createInvitation,
  listInvitations,
  refreshInvitation,
  findPendingInvitationByEmail,
} from '../services/invitationService.js';
import { createTenantUserWithPassword } from '../services/userAuthService.js';
import { MEMBERSHIP_ROLE_LABELS, INVITABLE_ROLES } from '../constants/tenantRoles.js';
import { UserPlus, Copy, Trash2, Pencil, Eye, Power, Mail } from 'lucide-react';

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

export default function ConfiguracoesUsuariosPage() {
  const { user } = useAuth();
  const tenant = getDefaultTenant();
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

  const tenantId = tenant?.id;
  const isMaster = user?.isMaster || user?.role === 'admin';

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
    const m = listMembers(tenantId);
    setMembers(m);
    setInvitations(listInvitations(tenantId, true));
  }, [tenantId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const showError = (msg) => {
    setError(msg);
    setToast(null);
  };

  const openMemberModal = (member, mode) => {
    setMemberModal({ open: true, member, mode });
  };

  const handleInvite = (e) => {
    e.preventDefault();
    setError('');
    if (!inviteEmail.trim()) {
      showError('E-mail é obrigatório.');
      return;
    }
    setSaving(true);
    try {
      const result = createInvitation(user, tenantId, {
        email: inviteEmail.trim(),
        role: inviteRole,
        has_system_access: inviteAccess,
      });
      pushToast('success', 'Convite criado. Link copiado.');
      try {
        if (result.invite_url) navigator.clipboard.writeText(result.invite_url);
      } catch (_) {}
      setModalInvite(false);
      setInviteEmail('');
      setInviteRole('atendimento');
      setInviteAccess(true);
      refresh();
    } catch (err) {
      showError(err?.message || 'Erro ao criar convite.');
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
      await createTenantUserWithPassword(user, {
        tenantId,
        fullName: nameTrim,
        email: emailTrim,
        password: newUserPassword,
        role: newUserRole,
        status: newUserStatus,
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
      showError(err?.message || 'Erro ao criar usuário.');
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

  const handleRefreshInvite = (invitationId) => {
    setSaving(true);
    try {
      const result = refreshInvitation(user, tenantId, invitationId);
      pushToast('success', 'Convite renovado. Novo link copiado.');
      try {
        if (result.invite_url) navigator.clipboard.writeText(result.invite_url);
      } catch (_) {}
      refresh();
    } catch (err) {
      showError(err?.message || 'Erro ao renovar convite.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAccessClick = (m) => {
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
      setMemberSystemAccess(user, tenantId, m.user_id, nextAccess);
      pushToast('success', nextAccess ? 'Acesso ativado.' : 'Acesso desativado.');
      refresh();
    } catch (err) {
      showError(err?.message || 'Erro ao alterar acesso.');
    } finally {
      setSaving(false);
    }
  };

  const handleResendInviteForMember = (m) => {
    const pending = findPendingInvitationByEmail(tenantId, m.email);
    if (!pending?.id) {
      showError('Não há convite pendente para este e-mail.');
      return;
    }
    handleRefreshInvite(pending.id);
  };

  const handleRemove = (memberUserId, memberName) => {
    if (!window.confirm(`Remover o vínculo de "${memberName}" com esta clínica? O usuário perderá o acesso mas o cadastro permanece.`)) return;
    setSaving(true);
    try {
      removeMember(user, tenantId, memberUserId);
      pushToast('success', 'Vínculo removido.');
      refresh();
    } catch (err) {
      showError(err?.message || 'Erro ao remover.');
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId) {
    return (
      <div className="stack" style={{ padding: '2rem' }}>
        <p className="muted">Nenhuma clínica encontrada.</p>
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
    <div className="stack">
      <Section
        title="Usuários e acessos"
        description="Gerencie perfis, dados cadastrais e acesso ao sistema. Apenas o administrador (MASTER) pode alterar."
      >
        {error && <div className="error">{error}</div>}
        {toast && (
          <div className={`toast ${toast.type}`} role="status">
            {toast.message}
          </div>
        )}

        <div className="list-actions" style={{ marginBottom: '1rem' }}>
          <Button variant="primary" icon={UserPlus} onClick={() => setModalCreateUser(true)}>
            Novo usuário
          </Button>
          <Button variant="primary" icon={UserPlus} onClick={() => setModalInvite(true)}>
            Convidar usuário
          </Button>
        </div>

        <div className="card">
          <div className="table-wrapper">
            <table className="access-list-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Última atualização</th>
                  <th style={{ minWidth: '220px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
                      Nenhum usuário vinculado. Use &quot;Convidar usuário&quot; para começar.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => {
                    const active = isMemberAccessActive(m);
                    const canManageRow = m.user_id !== user?.id;
                    const hasPendingInvite = Boolean(findPendingInvitationByEmail(tenantId, m.email));
                    return (
                      <tr key={m.id}>
                        <td>
                          <button
                            type="button"
                            className="button link"
                            style={{ fontWeight: 600, padding: 0, textAlign: 'left' }}
                            onClick={() => openMemberModal(m, 'view')}
                          >
                            {m.name}
                          </button>
                        </td>
                        <td>{m.email}</td>
                        <td>{MEMBERSHIP_ROLE_LABELS[m.role] || m.role}</td>
                        <td>
                          <span className={active ? 'access-badge on' : 'access-badge off'}>
                            {active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="muted" style={{ fontSize: '0.9rem' }}>{formatUpdatedAt(m.updated_at)}</td>
                        <td>
                          <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="button secondary small"
                              onClick={() => openMemberModal(m, 'view')}
                              disabled={saving}
                              title="Ver detalhes"
                            >
                              <Eye size={14} /> Ver
                            </button>
                            <button
                              type="button"
                              className="button secondary small"
                              onClick={() => openMemberModal(m, 'edit')}
                              disabled={saving}
                              title="Editar"
                            >
                              <Pencil size={14} /> Editar
                            </button>
                            {canManageRow ? (
                              <button
                                type="button"
                                className="button secondary small"
                                onClick={() => handleToggleAccessClick(m)}
                                disabled={saving}
                                title={active ? 'Desativar acesso' : 'Ativar acesso'}
                              >
                                <Power size={14} /> {active ? 'Desativar' : 'Ativar'}
                              </button>
                            ) : null}
                            {hasPendingInvite ? (
                              <button
                                type="button"
                                className="button secondary small"
                                onClick={() => handleResendInviteForMember(m)}
                                disabled={saving}
                                title="Redefinir e copiar novo link do convite"
                              >
                                <Mail size={14} /> Convite
                              </button>
                            ) : null}
                            {canManageRow ? (
                              <button
                                type="button"
                                className="button secondary small"
                                onClick={() => handleRemove(m.user_id, m.name)}
                                disabled={saving}
                                title="Remover vínculo com a clínica"
                              >
                                <Trash2 size={14} /> Remover
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {invitations.length > 0 && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <h4 style={{ marginBottom: '0.75rem' }}>Convites pendentes</h4>
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {invitations.map((inv) => (
                <li key={inv.id} className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <span>{inv.email}</span>
                  <span className="muted">({MEMBERSHIP_ROLE_LABELS[inv.role] || inv.role})</span>
                  <span className="access-badge on">Pendente</span>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => handleCopyInviteUrl(inv.invite_url)}
                    title="Copiar link"
                  >
                    <Copy size={14} /> Copiar link
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => handleRefreshInvite(inv.id)}
                    disabled={saving}
                    title="Gerar novo token e copiar link"
                  >
                    <Mail size={14} /> Reenviar / renovar
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

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
