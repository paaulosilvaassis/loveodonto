import { useEffect, useState } from 'react';
import { usePlatformAuth } from '../../auth/PlatformAuthContext.jsx';
import { fetchPlatformUsers } from '../../services/platformApi.js';

export default function PlatformTeamPage() {
  const { canManageTeam } = usePlatformAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPlatformUsers().then(({ data, error }) => {
      if (!cancelled && !error) setUsers(Array.isArray(data) ? data : []);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Equipe da Plataforma</h1>
      <p className="mb-6 text-slate-400">platform_users. {!canManageTeam && '(Somente leitura)'}</p>
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? <div className="p-6 text-slate-500">Carregando…</div> : users.length === 0 ? <div className="p-6 text-slate-500">Nenhum usuário.</div> : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-800/50">
              <tr><th className="p-3 font-medium text-slate-300">E-mail</th><th className="p-3 font-medium text-slate-300">Nome</th><th className="p-3 font-medium text-slate-300">Role</th><th className="p-3 font-medium text-slate-300">Ativo</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-3 text-white">{u.email}</td><td className="p-3 text-slate-400">{u.name ?? '—'}</td>
                  <td className="p-3"><span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">{u.role}</span></td>
                  <td className="p-3">{u.is_active ? <span className="text-green-400">Sim</span> : <span className="text-slate-500">Não</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
