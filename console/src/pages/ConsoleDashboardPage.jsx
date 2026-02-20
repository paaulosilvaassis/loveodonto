import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';

export default function ConsoleDashboardPage() {
  const { platformUser } = usePlatformAuth();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">Dashboard</h1>
      <p className="text-slate-400 mb-6">Bem-vindo, {platformUser?.name || platformUser?.email}</p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-slate-400">Clínicas ativas</p>
          <p className="text-2xl font-semibold text-slate-100">—</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-slate-400">Assinaturas ativas</p>
          <p className="text-2xl font-semibold text-slate-100">—</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-slate-400">Faturas pendentes</p>
          <p className="text-2xl font-semibold text-slate-100">—</p>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <p className="text-sm text-slate-400">Inadimplência</p>
          <p className="text-2xl font-semibold text-slate-100">—</p>
        </div>
      </div>
    </div>
  );
}
