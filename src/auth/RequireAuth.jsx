import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './useAuth.js';

const AUTH_SPINNER_MAX_MS = 14000;

export const RequireAuth = ({ children }) => {
  const { user, logout } = useAuth();
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    if (user !== undefined) {
      setShowRecovery(false);
      return undefined;
    }
    const t = setTimeout(() => setShowRecovery(true), AUTH_SPINNER_MAX_MS);
    return () => clearTimeout(t);
  }, [user]);

  if (user === undefined) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          color: 'var(--text-secondary, #94a3b8)',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <div>Carregando…</div>
        {showRecovery ? (
          <div style={{ maxWidth: '28rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
            <p style={{ margin: '0 0 0.75rem' }}>
              A validação da sessão está demorando (rede, Supabase ou backend local). Você pode tentar
              limpar a sessão e ir ao login.
            </p>
            <button
              type="button"
              className="button primary"
              style={{ marginRight: '0.5rem' }}
              onClick={() => {
                logout();
                window.location.assign('/login');
              }}
            >
              Limpar sessão e abrir login
            </button>
            <Link to="/login" className="link" style={{ display: 'inline-block' }}>
              Só ir ao login
            </Link>
          </div>
        ) : null}
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};
