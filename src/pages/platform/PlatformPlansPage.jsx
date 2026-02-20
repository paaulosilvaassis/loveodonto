import { useEffect, useState } from 'react';
import { usePlatformAuth } from '../../auth/PlatformAuthContext.jsx';
import { fetchPlatformPlans } from '../../services/platformApi.js';

export default function PlatformPlansPage() {
  const { canManagePlans } = usePlatformAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let c = false;
    fetchPlatformPlans().then(({ data, error }) => {
      if (!c && !error) setPlans(Array.isArray(data) ? data : []);
      if (!c) setLoading(false);
    });
    return () => { c = true; };
  }, []);
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Planos</h1>
      <p className="mb-6 text-slate-400">Planos da plataforma. {!canManagePlans && '(Somente leitura)'}</p>
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? <div className="p-6 text-slate-500">Carregando…</div> : plans.length === 0 ? <div className="p-6 text-slate-500">Nenhum plano.</div> : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-800/50">
              <tr><th className="p-3 font-medium text-slate-300">ID</th><th className="p-3 font-medium text-slate-300">Nome</th><th className="p-3 font-medium text-slate-300">Preço</th><th className="p-3 font-medium text-slate-300">Ativo</th></tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50">
                  <td className="p-3 text-white">{p.id}</td><td className="p-3 text-white">{p.name}</td>
                  <td className="p-3 text-slate-400">{p.price != null ? (p.price / 100).toFixed(2) : '—'}</td>
                  <td className="p-3">{p.is_active ? <span className="text-green-400">Sim</span> : <span className="text-slate-500">Não</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
