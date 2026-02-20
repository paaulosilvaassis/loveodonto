export default function ConsoleTeamPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">Equipe da Plataforma</h1>
      <p className="text-slate-400 mb-6">Usuários internos (platform_users) e permissões.</p>
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <p className="text-slate-500">Lista de platform_users virá do Supabase.</p>
      </div>
    </div>
  );
}
