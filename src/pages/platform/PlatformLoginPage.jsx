import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from '../../auth/PlatformAuthContext.jsx';

export default function PlatformLoginPage() {
  const { platformUser, loading, login } = usePlatformAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const from = location.state?.from?.pathname || '/platform/dashboard';

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-950"><p className="text-slate-400">Carregando...</p></div>;
  if (platformUser) return <Navigate to={from} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err?.message || 'Falha no login.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h1 className="mb-1 text-xl font-semibold text-white">Painel da Plataforma</h1>
        <p className="mb-6 text-sm text-slate-400">Acesso restrito à equipe interna</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="platform-email" className="mb-1 block text-sm text-slate-300">E-mail</label>
            <input id="platform-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="seu@email.com" />
          </div>
          <div>
            <label htmlFor="platform-password" className="mb-1 block text-sm text-slate-300">Senha</label>
            <input id="platform-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={submitting} className="w-full rounded bg-blue-600 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Entrando...' : 'Entrar'}</button>
        </form>
      </div>
    </div>
  );
}
