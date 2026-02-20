import { useParams, Link } from 'react-router-dom';

export default function PlatformTenantDetailPage() {
  const { id } = useParams();
  return (
    <div>
      <Link to="/platform/tenants" className="mb-4 inline-block text-sm text-blue-400 hover:text-blue-300">Voltar</Link>
      <h1 className="mb-2 text-2xl font-semibold text-white">Clínica: {id}</h1>
      <p className="mb-6 text-slate-400">Visão geral, usuários, plano e cobrança, auditoria, uso.</p>
    </div>
  );
}
