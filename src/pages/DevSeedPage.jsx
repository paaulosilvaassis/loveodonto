import { useEffect, useState } from 'react';
import { seedDevDb } from '../db/index.js';

export default function DevSeedPage() {
  const [status, setStatus] = useState('loading');
  const token = import.meta.env?.VITE_DB_SEED_TOKEN;

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
    seedDevDb();
    setStatus('done');
  }, [token]);

  if (status === 'forbidden') {
    return <div className="dev-db-card">Rota disponível apenas em desenvolvimento.</div>;
  }
  if (status === 'unauthorized') {
    return <div className="dev-db-card">Token inválido para seed do banco DEV.</div>;
  }
  if (status === 'done') {
    return (
      <div className="dev-db-card">
        <h2>Seed aplicado</h2>
        <p>Dados básicos adicionados ao banco DEV sem limpar registros existentes.</p>
        <a className="button primary" href="/pacientes/busca">
          Ir para Buscar Paciente
        </a>
      </div>
    );
  }
  return <div className="dev-db-card">Aplicando seed no banco DEV...</div>;
}
