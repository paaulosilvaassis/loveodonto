import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlatformAuth } from '../../auth/PlatformAuthContext.jsx';
import { fetchPlatformTenants } from '../../services/platformApi.js';

export default function PlatformTenantsPage() {
  const { canManageTenants } = usePlatformAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  useEffect(() => {
    let c = false;
    fetchPlatformTenants().then(({ data, error }) => {
      if (!c && !error) setTenants(Array.isArray(data) ? data : []);
      if (!c) setLoading(false);
    });
    return () => { c = true; };
  }, []);
  const filtered = filter ? tenants.filter((t) => t.status === filter) : tenants;
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Clínicas</h1>
      <p className="mb-6 text-slate-400">Gerencie as clínicas. {canManageTenants && 'Criar via Admin API.'}</p>
      <div className="mb-4 flex gap-2">
        <button type="button" onClick={() => setFilter('')} className={'rounded px-3 py-1.5 text-sm ' + (filter === '' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400')}>Todas</button>
        <button type="button" onClick={() => setFilter('active')} className={'rounded px-3 py-1.5 text-sm ' + (filter === 'active' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400')}>Ativas</button>
        <button type="button" onClick={() => setFilter('trial')} className={'rounded px-3 py-1.5 text-sm ' + (filter === 'trial' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400')}>Trial</button>
        <button type="button" onClick={() => setFilter('suspended')} className={'rounded px-3 py-1.5 text-sm ' + (filter === 'suspended' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400')}>Suspensas</button>
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? <div className="p-6 text-slate-500">Carregando…</div> : filtered.length === 0 ? <div className="p-6 text-slate-500">Nenhuma clínica.</div> : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-800/50">
              <tr><th className="p-3 font-medium text-slate-300">Nome</th><th className="p-3 font-medium text-slate-300">Status</th><th className="p-3 font-medium text-slate-300">Plano</th><th className="p-3 font-medium text-slate-300" /></tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-slate-800/50">
                  <td className="p-3 text-white">{t.name}</td><td className="p-3 text-slate-400">{t.status}</td><td className="p-3 text-slate-400">{t.plan_id ?? '—'}</td>
                  <td className="p-3"><Link to={'/platform/tenants/' + t.id} className="text-blue-400 hover:underline">Ver</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
