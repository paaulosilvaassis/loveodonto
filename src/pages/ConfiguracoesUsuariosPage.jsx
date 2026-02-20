import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { Section } from '../components/Section.jsx';
import { Field } from '../components/Field.jsx';
import Button from '../components/Button.jsx';
import { getDefaultTenant } from '../services/tenantService.js';
import {
  listMembers,
  updateMemberRole,
  setMemberSystemAccess,
  removeMember,
} from '../services/membershipService.js';
import {
  createInvitation,
  listInvitations,
} from '../services/invitationService.js';
import { MEMBERSHIP_ROLE_LABELS, INVITABLE_ROLES } from '../constants/tenantRoles.js';
import { UserPlus, Copy, Trash2, UserX } from 'lucide-react';

export default function ConfiguracoesUsuariosPage() {
  const { user } = useAuth();
  const tenant = getDefaultTenant();
  const [members, setMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalInvite, setModalInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('atendimento');
  const [inviteAccess, setInviteAccess] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editRoleId, setEditRoleId] = useState(null);
  const [editRoleValue, setEditRoleValue] = useState('');

  const tenantId = tenant?.id;
  const isMaster = user?.isMaster || user?.role === 'admin';

  useEffect(() => {
    if (!tenantId) return;
    setMembers(listMembers(tenantId));
    setInvitations(listInvitations(tenantId, true));
  }, [tenantId, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const showSuccess = (msg) => {
    setSuccess(msg);
    setError('');
    setTimeout(() => setSuccess(''), 3000);
  };
  const showError = (msg) => {
    setError(msg);
    setSuccess('');
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
      showSuccess('Convite criado. Link copiado para a área de transferência.');
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

  const handleCopyInviteUrl = (url) => {
    try {
      navigator.clipboard.writeText(url);
      showSuccess('Link copiado.');
    } catch {
      showError('Não foi possível copiar.');
    }
  };

  const handleUpdateRole = (memberUserId) => {
    if (!editRoleValue) return;
    setSaving(true);
    try {
      updateMemberRole(user, tenantId, memberUserId, editRoleValue);
      showSuccess('Perfil atualizado.');
      setEditRoleId(null);
      setEditRoleValue('');
      refresh();
    } catch (err) {
      showError(err?.message || 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAccess = (memberUserId, current) => {
    setSaving(true);
    try {
      setMemberSystemAccess(user, tenantId, memberUserId, !current);
      showSuccess(current ? 'Acesso desativado.' : 'Acesso ativado.');
      refresh();
    } catch (err) {
      showError(err?.message || 'Erro ao alterar acesso.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (memberUserId, memberName) => {
    if (!window.confirm(`Remover "${memberName}" do acesso à clínica?`)) return;
    setSaving(true);
    try {
      removeMember(user, tenantId, memberUserId);
      showSuccess('Usuário removido.');
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
        description="Convide usuários e gerencie perfis e acesso ao sistema. Apenas o administrador (MASTER) pode alterar."
      >
        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        <div className="list-actions" style={{ marginBottom: '1rem' }}>
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
                  <th>Acesso</th>
                  <th style={{ width: '140px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
                      Nenhum usuário vinculado. Use &quot;Convidar usuário&quot; para começar.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
                    <tr key={m.id}>
                      <td><strong>{m.name}</strong></td>
                      <td>{m.email}</td>
                      <td>
                        {editRoleId === m.user_id ? (
                          <span className="flex gap-sm">
                            <select
                              value={editRoleValue}
                              onChange={(e) => setEditRoleValue(e.target.value)}
                              className="small"
                            >
                              {INVITABLE_ROLES.map((r) => (
                                <option key={r} value={r}>{MEMBERSHIP_ROLE_LABELS[r] || r}</option>
                              ))}
                              <option value="master">{MEMBERSHIP_ROLE_LABELS.master}</option>
                            </select>
                            <button type="button" className="button secondary small" onClick={() => handleUpdateRole(m.user_id)} disabled={saving}>Ok</button>
                            <button type="button" className="button secondary small" onClick={() => { setEditRoleId(null); setEditRoleValue(''); }}>Cancelar</button>
                          </span>
                        ) : (
                          <span>
                            {MEMBERSHIP_ROLE_LABELS[m.role] || m.role}
                            {m.user_id !== user?.id && (
                              <button type="button" className="button link small" style={{ marginLeft: '0.5rem' }} onClick={() => { setEditRoleId(m.user_id); setEditRoleValue(m.role); }}>Editar</button>
                            )}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={m.has_system_access ? 'access-badge on' : 'access-badge off'}>
                          {m.has_system_access ? 'Ativo' : 'Desativado'}
                        </span>
                        {m.user_id !== user?.id && (
                          <button
                            type="button"
                            className="button link small"
                            style={{ marginLeft: '0.5rem' }}
                            onClick={() => handleToggleAccess(m.user_id, m.has_system_access)}
                            disabled={saving}
                          >
                            {m.has_system_access ? 'Desativar' : 'Ativar'}
                          </button>
                        )}
                      </td>
                      <td>
                        {m.user_id !== user?.id ? (
                          <button
                            type="button"
                            className="button secondary small"
                            onClick={() => handleRemove(m.user_id, m.name)}
                            disabled={saving}
                            title="Remover usuário"
                          >
                            <Trash2 size={14} /> Remover
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
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
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => handleCopyInviteUrl(inv.invite_url)}
                    title="Copiar link"
                  >
                    <Copy size={14} /> Copiar link
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {modalInvite && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal card" style={{ maxWidth: '400px' }}>
            <h3 style={{ marginBottom: '1rem' }}>Convidar usuário</h3>
            <form onSubmit={handleInvite} className="stack">
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
              <div className="flex gap-sm" style={{ marginTop: '1rem' }}>
                <Button type="submit" variant="primary" disabled={saving}>
                  {saving ? 'Criando…' : 'Criar convite'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setModalInvite(false); setError(''); }}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
