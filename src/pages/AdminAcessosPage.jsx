import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Section } from '../components/Section.jsx';
import { listUsersWithAccess, ROLE_LABELS } from '../services/accessService.js';
import { loadDb } from '../db/index.js';

export default function AdminAcessosPage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const db = loadDb();
  const usersWithAccess = useMemo(() => listUsersWithAccess(), [refreshKey]);
  const collaboratorByUserId = useMemo(() => {
    const map = {};
    (db.collaboratorAccess || []).forEach((a) => { if (a.userId) map[a.userId] = a.collaboratorId; });
    return map;
  }, [db.collaboratorAccess]);

  const handleEdit = (userId) => {
    const collaboratorId = collaboratorByUserId[userId];
    if (collaboratorId) {
      navigate('/admin/colaboradores', { state: { openCollaboratorId: collaboratorId, tab: 'acessos' } });
    } else {
      navigate('/admin/colaboradores', { state: { editUserId: userId } });
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="stack">
      <Section
        title="Configurações de Acesso"
        description="Lista de usuários, status de acesso e perfil. Apenas Administrador pode alterar. Clique em Editar para abrir a Ficha do Colaborador na aba Acessos."
      >
        <div className="list-actions" style={{ marginBottom: '1rem' }}>
          <button type="button" className="button secondary" onClick={() => setRefreshKey((k) => k + 1)}>
            Atualizar
          </button>
        </div>
        <div className="card">
          <div className="table-wrapper">
            <table className="access-list-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Perfil</th>
                  <th>Acesso</th>
                  <th>Última alteração</th>
                  <th style={{ width: '100px' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usersWithAccess.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted" style={{ padding: '1.5rem', textAlign: 'center' }}>
                      Nenhum usuário cadastrado.
                    </td>
                  </tr>
                ) : (
                  usersWithAccess.map((u) => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong></td>
                      <td>{ROLE_LABELS[u.role] || u.role}</td>
                      <td>
                        <span className={u.has_system_access ? 'access-badge on' : 'access-badge off'}>
                          {u.has_system_access ? 'Ativo' : 'Desativado'}
                        </span>
                      </td>
                      <td className="muted">{formatDate(u.lastAccessChange)}</td>
                      <td>
                        <button type="button" className="button secondary small" onClick={() => handleEdit(u.id)}>
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
      </Section>
    </div>
  );
}
