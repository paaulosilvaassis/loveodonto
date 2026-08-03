import { usePlatformAuth } from '../../auth/PlatformAuthContext.jsx';

export default function PlatformTeamPage() {
  const { canManageTeam } = usePlatformAuth();

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Equipe da Plataforma</h1>
      <p className="mb-6 text-slate-400">
        Gestão de usuários internos foi movida para o Console SaaS (porta 5177).
        Este módulo legado não consulta mais <code className="text-slate-300">platform_users</code>.
        {!canManageTeam && ' (Somente leitura)'}
      </p>
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
        Use o Console oficial para administrar clínicas, planos e equipe da plataforma.
      </div>
    </div>
  );
}
