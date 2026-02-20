import { useEffect, useState } from 'react';
import { resetDb } from '../db/index.js';

export default function DevResetPage() {
  const [status, setStatus] = useState('loading');
  const token = import.meta.env?.VITE_DB_RESET_TOKEN;

  useEffect(() => {
    if (!import.meta.env?.DEV) {
      setStatus('forbidden');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (token && params.get('token') !== token) {
      setStatus('unauthorized');
      return;
    }
    resetDb();
    setStatus('done');
  }, [token]);

  if (status === 'forbidden') {
    return <div className="dev-db-card">Rota disponível apenas em desenvolvimento.</div>;
  }
  if (status === 'unauthorized') {
    return <div className="dev-db-card">Token inválido para reset do banco DEV.</div>;
  }
  if (status === 'done') {
    return (
      <div className="dev-db-card">
        <h2>Banco DEV resetado</h2>
        <p>O banco local foi limpo manualmente. Você pode voltar ao app.</p>
        <a className="button primary" href="/">
          Voltar ao app
        </a>
      </div>
    );
  }
  return <div className="dev-db-card">Resetando banco DEV...</div>;
}
