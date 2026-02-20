import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { loadDb } from '../db/index.js';
import Button from '../components/Button.jsx';
import appLogo from '../assets/love-odonto-logo.png';

export default function LoginPage() {
  const { login, ensureSeedUser, user } = useAuth();
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    ensureSeedUser();
    const db = loadDb();
    const defaultTenantId = (db.tenants || [])[0]?.id;
    const memberIds = new Set(
      (db.memberships || [])
        .filter((m) => m.tenant_id === defaultTenantId && m.status === 'active' && m.has_system_access !== false)
        .map((m) => m.user_id)
    );
    const list = (db.users || []).filter((item) => item.active && (!defaultTenantId || memberIds.has(item.id)));
    setUsers(list);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'LoginPage.jsx:17',message:'login:users',data:{activeUserCount:db.users.filter((item) => item.active).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H11'})}).catch(()=>{});
    // #endregion
  }, [ensureSeedUser]);

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/56ea22fe-9ec4-4d67-9a0f-1f3b37662bbd',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'src/pages/LoginPage.jsx:26',message:'login:render',data:{hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',runId:'menu-white-screen-pre-7',hypothesisId:'H11'})}).catch(()=>{});
    // #endregion
  }, [user]);

  const handleSubmit = (event) => {
    event.preventDefault();
    setError('');
    try {
      login({ userId: selected });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="login">
      {/* Hero Section - Lado Esquerdo */}
      <div className="login-hero">
        <div className="login-hero-content">
          <div className="login-hero-brand">
            <img className="login-hero-logo" src={appLogo} alt="LOVE ODONTO" />
            <span className="login-hero-brand-name">LOVE ODONTO</span>
          </div>
          <h1 className="login-hero-title">Bem-vindo de volta!</h1>
          <p className="login-hero-subtitle">
            Sistema completo de gestão para clínicas odontológicas modernas.
            Gerencie pacientes, agenda, tratamentos e muito mais em um só lugar.
          </p>
          <ul className="login-hero-features">
            <li>Gestão completa de pacientes e prontuários</li>
            <li>Agenda inteligente e otimizada</li>
            <li>Controle financeiro integrado</li>
            <li>Relatórios e análises detalhadas</li>
          </ul>
        </div>
      </div>

      {/* Form Section - Lado Direito */}
      <div className="login-form-container">
        <div className="login-form-card">
          <div className="login-form-brand">
            <img className="login-form-logo" src={appLogo} alt="LOVE ODONTO" />
            <span className="login-form-brand-name">LOVE ODONTO</span>
          </div>
          <h2 className="login-form-title">Bem-vindo de volta!</h2>
          <p className="login-form-subtitle">Selecione seu usuário para acessar o sistema</p>
          
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-form-field">
              <label className="login-form-label">Usuário</label>
              <select
                className="login-form-select"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
              >
                <option value="">Selecione um usuário...</option>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.role})
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="login-form-error">
                {error}
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              icon={LogIn}
              type="submit"
              disabled={!selected}
              className="login-form-button"
            >
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
