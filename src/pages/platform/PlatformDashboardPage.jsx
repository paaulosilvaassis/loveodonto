import { useEffect, useState } from 'react';
import { usePlatformAuth } from '../../auth/PlatformAuthContext.jsx';
import { fetchPlatformTenants } from '../../services/platformApi.js';

export default function PlatformDashboardPage() {
  const { platformUser } = usePlatformAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let c = false;
    fetchPlatformTenants().then(({ data, error }) => {
      if (!c && !error) setTenants(Array.isArray(data) ? data : []);
      if (!c) setLoading(false);
    });
    return () => { c = true; };
  }, []);
  const active = tenants.filter((t) => t.status === 'active').length;
  const trial = tenants.filter((t) => t.status === 'trial').length;
  const suspended = tenants.filter((t) => t.status === 'suspended').length;
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mb-6 text-slate-400">Bem-vindo, {platformUser?.name || platformUser?.email}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">Clínicas ativas</p>
          <p className="text-2xl font-semibold text-white">{loading ? '…' : active}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">Trial</p>
          <p className="text-2xl font-semibold text-white">{loading ? '…' : trial}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">Suspensas</p>
          <p className="text-2xl font-semibold text-white">{loading ? '…' : suspended}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="text-sm text-slate-400">Inadimplência</p>
          <p className="text-2xl font-semibold text-white">—</p>
        </div>
      </div>
    </div>
  );
}
