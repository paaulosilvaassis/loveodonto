import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';

export default function ConsoleLoginPage() {
  const { platformUser, loading, login, configError } = usePlatformAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-slate-400">Carregando...</p>
      </div>
    );
  }

  if (platformUser) {
    return <Navigate to={from} replace />;
  }

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
    <div className="pc-login">
      <div className="pc-login__card">
        <h1>Platform Console</h1>
        <p>Acesso restrito ao time operador do SaaS Love Odonto.</p>
        {configError ? (
          <div className="pc-login__hint pc-login__hint--error" role="alert">
            <strong>Não foi possível conectar ao Supabase.</strong>
            {' '}
            {configError}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="pc-login__form">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={Boolean(configError)}
            placeholder="admin@loveodonto.com"
          />
          <label htmlFor="password">Senha</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={Boolean(configError)}
          />
          {error ? <p className="pc-error">{error}</p> : null}
          <button type="submit" className="pc-button pc-button--full" disabled={submitting || Boolean(configError)}>
            {submitting ? 'Entrando...' : 'Entrar na Console'}
          </button>
        </form>
      </div>
    </div>
  );
}
