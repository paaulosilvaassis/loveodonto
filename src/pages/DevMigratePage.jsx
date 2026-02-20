import { useEffect, useState } from 'react';
import { loadDb } from '../db/index.js';

export default function DevMigratePage() {
  const [status, setStatus] = useState('loading');
  const token = import.meta.env?.VITE_DB_MIGRATE_TOKEN;

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
    loadDb();
    setStatus('done');
  }, [token]);

  if (status === 'forbidden') {
    return <div className="dev-db-card">Rota disponível apenas em desenvolvimento.</div>;
  }
  if (status === 'unauthorized') {
    return <div className="dev-db-card">Token inválido para migração do banco DEV.</div>;
  }
  if (status === 'done') {
    return (
      <div className="dev-db-card">
        <h2>Migração aplicada</h2>
        <p>O banco local foi migrado para a versão mais recente.</p>
        <a className="button primary" href="/">
          Voltar ao app
        </a>
      </div>
    );
  }
  return <div className="dev-db-card">Aplicando migração no banco DEV...</div>;
}
