import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePlatformAuth } from './usePlatformAuth.js';

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
            Se ficar muito tempo aqui, verifique se o backend da plataforma está no ar (porta 3001), o .env da Console
            e se existe linha ativa em platform_admin_users para seu usuário.
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
