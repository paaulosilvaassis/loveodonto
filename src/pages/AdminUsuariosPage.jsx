import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { canManageAccess } from '../services/accessService.js';
import { listUsersWithAccess, ROLE_LABELS } from '../services/accessService.js';
import { listUserInvites, createUserInvite } from '../services/userInviteService.js';
import { listCollaborators, getCollaborator } from '../services/collaboratorService.js';
import { loadDb } from '../db/index.js';
import { Section } from '../components/Section.jsx';
import { Field } from '../components/Field.jsx';
import { Tabs } from '../components/Tabs.jsx';
import { INVITABLE_ROLES, MEMBERSHIP_ROLE_LABELS } from '../constants/tenantRoles.js';

const tabs = [
  { value: 'usuarios', label: 'Usuários' },
  { value: 'convites', label: 'Convites' },
];

export default function AdminUsuariosPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('usuarios');
  const [invites, setInvites] = useState([]);
  const [users, setUsers] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteCollaboratorId, setInviteCollaboratorId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('atendimento');
  const [inviteMustChangePassword, setInviteMustChangePassword] = useState(true);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [createdInviteUrl, setCreatedInviteUrl] = useState('');
  const [creating, setCreating] = useState(false);

  const canAccess = canManageAccess(user);

  useEffect(() => {
    if (!canAccess) {
      navigate('/gestao/dashboard', { replace: true });
      return;
    }
    setInvites(listUserInvites({}));
    setUsers(listUsersWithAccess());
    setCollaborators(listCollaborators({ status: 'ativo' }));
  }, [canAccess, navigate]);

  const refreshInvites = () => {
    setInvites(listUserInvites({}));
  };

  const handleCollaboratorChange = (collaboratorId) => {
    setInviteCollaboratorId(collaboratorId);
    if (collaboratorId) {
      const data = getCollaborator(collaboratorId);
      const email = data?.profile?.email || '';
      setInviteEmail(email);
    } else {
      setInviteEmail('');
    }
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    setCreatedInviteUrl('');
    const email = (inviteEmail || '').trim().toLowerCase();
    if (!email) {
      setInviteError('E-mail é obrigatório.');
      return;
    }
    if (!inviteCollaboratorId) {
      setInviteError('Selecione um colaborador.');
      return;
    }
    setCreating(true);
    try {
      const { inviteUrl } = await createUserInvite(user, {
        collaboratorId: inviteCollaboratorId,
        email,
        role: inviteRole,
        mustChangePassword: inviteMustChangePassword,
      });
      setCreatedInviteUrl(inviteUrl);
      setInviteSuccess('Convite criado. Copie o link abaixo para enviar.');
      setInviteCollaboratorId('');
      setInviteEmail('');
      setInviteRole('atendimento');
      refreshInvites();
    } catch (err) {
      setInviteError(err?.message || 'Erro ao criar convite.');
    } finally {
      setCreating(false);
    }
  };

  const copyInviteLink = () => {
    if (createdInviteUrl) {
      navigator.clipboard.writeText(createdInviteUrl);
      setInviteSuccess('Link copiado para a área de transferência.');
    }
  };

  const db = loadDb();
  const collaboratorByUserId = {};
  (db.collaboratorAccess || []).forEach((a) => {
    if (a.userId) collaboratorByUserId[a.userId] = a.collaboratorId;
  });

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  if (!canAccess) {
    return null;
  }

  return (
    <div className="stack">
      <Section
        title="Usuários e Convites"
        description="Gerencie usuários e envie convites para ativação de acesso."
      >
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {activeTab === 'usuarios' && (
          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="table-wrapper">
              <table className="access-list-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Perfil</th>
                    <th>Acesso</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
                        Nenhum usuário cadastrado.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id}>
                        <td><strong>{u.name}</strong></td>
                        <td>{ROLE_LABELS[u.role] || u.role}</td>
                        <td>
                          <span className={u.has_system_access ? 'access-badge on' : 'access-badge off'}>
                            {u.has_system_access ? 'Ativo' : 'Desativado'}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button secondary small"
                            onClick={() => {
                              const cid = collaboratorByUserId[u.id];
                              if (cid) {
                                navigate('/admin/colaboradores', {
                                  state: { openCollaboratorId: cid, tab: 'acessos' },
                                });
                              }
                            }}
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'convites' && (
          <div className="stack" style={{ marginTop: '1rem' }}>
            <div className="list-actions">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setShowInviteForm(true);
                  setInviteError('');
                  setInviteSuccess('');
                  setCreatedInviteUrl('');
                }}
              >
                Enviar convite
              </button>
            </div>

            {showInviteForm && (
              <div className="card">
                <h4 style={{ margin: '0 0 1rem' }}>Novo convite</h4>
                <form onSubmit={handleCreateInvite} className="stack">
                  <Field label="Colaborador">
                    <select
                      value={inviteCollaboratorId}
                      onChange={(e) => handleCollaboratorChange(e.target.value)}
                      required
                    >
                      <option value="">Selecione...</option>
                      {collaborators.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.apelido || c.nomeCompleto} · {c.cargo}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="E-mail">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      required
                    />
                  </Field>
                  <Field label="Perfil de acesso">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                    >
                      {INVITABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {MEMBERSHIP_ROLE_LABELS[r] || r}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={inviteMustChangePassword}
                        onChange={(e) => setInviteMustChangePassword(e.target.checked)}
                      />
                      <span style={{ marginLeft: '0.5rem' }}>Forçar troca de senha no primeiro acesso</span>
                    </label>
                  </div>
                  {inviteError && <div className="error">{inviteError}</div>}
                  {inviteSuccess && <div className="success">{inviteSuccess}</div>}
                  {createdInviteUrl && (
                    <div className="stack">
                      <Field label="Link do convite (copie e envie)">
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input
                            type="text"
                            readOnly
                            value={createdInviteUrl}
                            style={{ flex: 1, fontSize: '0.875rem' }}
                          />
                          <button
                            type="button"
                            className="button secondary"
                            onClick={copyInviteLink}
                          >
                            Copiar
                          </button>
                        </div>
                      </Field>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="submit" className="button primary" disabled={creating}>
                      {creating ? 'Criando…' : 'Criar convite'}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        setShowInviteForm(false);
                        setCreatedInviteUrl('');
                        setInviteError('');
                        setInviteSuccess('');
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="card">
              <h4 style={{ margin: '0 0 1rem' }}>Convites enviados</h4>
              <div className="table-wrapper">
                <table className="access-list-table">
                  <thead>
                    <tr>
                      <th>E-mail</th>
                      <th>Perfil</th>
                      <th>Status</th>
                      <th>Criado em</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
                          Nenhum convite.
                        </td>
                      </tr>
                    ) : (
                      invites.map((inv) => {
                        const collab = collaborators.find((c) => c.id === inv.collaboratorId);
                        return (
                          <tr key={inv.id}>
                            <td>{inv.email}</td>
                            <td>{MEMBERSHIP_ROLE_LABELS[inv.role] || inv.role}</td>
                            <td>
                              {inv.usedAt ? (
                                <span className="access-badge on">Usado</span>
                              ) : new Date(inv.expiresAt) < new Date() ? (
                                <span className="access-badge off">Expirado</span>
                              ) : (
                                <span className="access-badge" style={{ background: '#fef3c7', color: '#92400e' }}>
                                  Pendente
                                </span>
                              )}
                            </td>
                            <td className="muted">{formatDate(inv.createdAt)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
