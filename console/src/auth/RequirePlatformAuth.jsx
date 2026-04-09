import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from './PlatformAuthContext.jsx';

const LOADING_HINT_MS = 20000;

export default function RequirePlatformAuth({ children }) {
  const { platformUser, loading } = usePlatformAuth();
  const location = useLocation();
  const [showSlowHint, setShowSlowHint] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSlowHint(false);
      return undefined;
    }
    const t = setTimeout(() => setShowSlowHint(true), LOADING_HINT_MS);
    return () => clearTimeout(t);
  }, [loading]);

  if (loading) {
    return (
      <div className="pc-login">
        <p>Carregando...</p>
        {showSlowHint ? (
          <p className="pc-login__hint" style={{ marginTop: '1rem', maxWidth: '28rem' }}>
            Se ficar muito tempo aqui, verifique o Supabase (RLS, migration 003) e as variáveis de ambiente na Vercel.
            {' '}
            <button type="button" className="pc-button" onClick={() => window.location.reload()}>
              Recarregar página
            </button>
          </p>
        ) : null}
      </div>
    );
  }

  if (!platformUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
