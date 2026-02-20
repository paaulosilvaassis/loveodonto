import { useParams, Link } from 'react-router-dom';

export default function ConsoleTenantDetailPage() {
  const { id } = useParams();
  return (
    <div>
      <Link to="/tenants" className="text-blue-400 hover:text-blue-300 text-sm mb-4 inline-block">Voltar</Link>
      <h1 className="text-2xl font-semibold text-slate-100 mb-2">Clínica: {id}</h1>
    </div>
  );
}
