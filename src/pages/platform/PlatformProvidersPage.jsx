import { useEffect, useState } from 'react';
import { usePlatformAuth } from '../../auth/PlatformAuthContext.jsx';
import { fetchPaymentProviders } from '../../services/platformApi.js';

export default function PlatformProvidersPage() {
  const { canManageProviders } = usePlatformAuth();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPaymentProviders().then(({ data, error }) => {
      if (!cancelled && !error) setProviders(Array.isArray(data) ? data : []);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Provedores de Pagamento</h1>
      <p className="mb-6 text-slate-400">Stripe, Pagarme e webhooks. {!canManageProviders && '(Somente PLATFORM_OWNER/ADMIN)'}</p>
      <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-500">Carregando…</div>
        ) : providers.length === 0 ? (
          <div className="p-6 text-slate-500">Nenhum provedor configurado.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-800/50">
              <tr>
                <th className="p-3 font-medium text-slate-300">Provider</th>
                <th className="p-3 font-medium text-slate-300">Ativo</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-3 text-white">{p.provider}</td>
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
