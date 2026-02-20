import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn, Shield } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { authenticateByEmailPassword } from '../services/userAuthService.js';
import { seedAdminCredentialsIfEmpty, forceSeedAdminCredentials } from '../db/index.js';
import Button from '../components/Button.jsx';
import appLogo from '../assets/love-odonto-logo.png';

export default function LoginPage() {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'LoginPage.jsx:render',message:'LoginPage mounting',data:{},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
  // #endregion
  const { login, ensureSeedUser, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [forceSeedLoading, setForceSeedLoading] = useState(false);
  const [AdminGateModalComponent, setAdminGateModalComponent] = useState(null);
  const shownActivatedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    ensureSeedUser();
    seedAdminCredentialsIfEmpty().catch(() => {});
  }, [ensureSeedUser]);

  useEffect(() => {
    if (import.meta.env?.DEV) {
      console.log('[LoginPage] Componente renderizado');
    }
  }, []);

  // Não redireciona automaticamente quando usuário está logado - permite ver a página de login

  useEffect(() => {
    if (location.state?.activated && !shownActivatedRef.current) {
      shownActivatedRef.current = true;
      setToast({ message: 'Conta ativada com sucesso! Faça login para acessar.', type: 'success' });
      setTimeout(() => setToast(null), 4000);
    }
  }, [location.state?.activated]);

  useEffect(() => {
    if (location.state?.adminBlocked) {
      setAdminModalOpen(true);
      setToast({ message: 'Acesso administrativo bloqueado. Informe o PIN do Administrador.', type: 'error' });
      setTimeout(() => setToast(null), 5000);
    }
  }, [location.state?.adminBlocked]);

  // Carrega AdminGateModal apenas ao abrir o modal (evita dependência no load inicial)
  const [adminModalLoadError, setAdminModalLoadError] = useState(false);
  useEffect(() => {
    if (adminModalOpen && !AdminGateModalComponent && !adminModalLoadError) {
      import('../components/AdminGateModal.jsx')
        .then((mod) => {
          setAdminGateModalComponent(() => mod.default);
          setAdminModalLoadError(false);
        })
        .catch(() => {
          setAdminGateModalComponent(null);
          setAdminModalLoadError(true);
        });
    }
  }, [adminModalOpen, AdminGateModalComponent, adminModalLoadError]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    const emailTrim = (email || '').trim().toLowerCase();
    if (!emailTrim || !password) {
      setError('Preencha e-mail e senha.');
      return;
    }
    setLoading(true);
    try {
      const result = await authenticateByEmailPassword(emailTrim, password);
      if (result) {
        login({ userId: result.userId, tenantId: result.tenantId });
        navigate('/dashboard');
      } else {
        setError('E-mail ou senha inválidos.');
      }
    } catch (err) {
      setError(err?.message || 'Erro ao fazer login.');
    } finally {
      setLoading(false);
    }
  };

  const handleForceSeedAdmin = async () => {
    setForceSeedLoading(true);
    setError('');
    try {
      await forceSeedAdminCredentials();
      setToast({ message: 'Admin recriado: admin@loveodonto.com / admin123', type: 'success' });
      setTimeout(() => setToast(null), 5000);
    } catch (err) {
      setError(err?.message || 'Erro ao recriar admin.');
    } finally {
      setForceSeedLoading(false);
    }
  };

  const handleAdminGateSuccess = () => {
    const role = (user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'master', 'gerente'].includes(role) || user?.isMaster;
    if (user && isAdmin) {
      if (import.meta.env?.DEV) {
        console.debug('[LoginPage] AdminGate OK, navegando para painel admin', { role });
      }
      navigate('/admin/dados-clinica', { replace: true });
    } else {
      setToast({ message: 'PIN válido. Faça login para acessar o painel admin.', type: 'success' });
      setTimeout(() => setToast(null), 4000);
    }
  };

  return (
    <div className="login">
      <button
        type="button"
        className="admin-gate-trigger"
        onClick={() => setAdminModalOpen(true)}
        title="Administração"
      >
        <Shield size={18} />
        <span>Administração</span>
      </button>

      {adminModalOpen && AdminGateModalComponent && (
        <AdminGateModalComponent
          open={adminModalOpen}
          onClose={() => { setAdminModalOpen(false); setAdminModalLoadError(false); }}
          onSuccess={handleAdminGateSuccess}
        />
      )}
      {adminModalOpen && !AdminGateModalComponent && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '1.5rem', borderRadius: 8, textAlign: 'center' }}>
            {adminModalLoadError ? (
              <>
                <p>Erro ao carregar. Tente novamente.</p>
                <button type="button" onClick={() => { setAdminModalLoadError(false); setAdminModalOpen(false); }}>Fechar</button>
              </>
            ) : (
              <p>Carregando…</p>
            )}
          </div>
        </div>
      )}

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
          <h2 className="login-form-title">Acessar Sistema</h2>
          <p className="login-form-subtitle">Use seu e-mail e senha</p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-form-field">
              <label className="login-form-label" htmlFor="login-email">E-mail</label>
              <input
                id="login-email"
                type="email"
                className="login-form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                autoFocus
              />
            </div>

            <div className="login-form-field">
              <label className="login-form-label" htmlFor="login-password">Senha</label>
              <input
                id="login-password"
                type="password"
                className="login-form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="login-form-error">{error}</div>
            )}

            <Button
              variant="primary"
              size="lg"
              icon={LogIn}
              type="submit"
              disabled={loading}
              className="login-form-button"
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>

            <div className="login-form-footer" style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center', fontSize: '0.875rem' }}>
              {user && (
                <Link to="/dashboard" className="link">Já está logado? Ir para o sistema</Link>
              )}
              <Link to="/activate" className="link">Recebeu um convite? Ativar acesso</Link>
              <Link to="/forgot-password" className="link">Esqueci minha senha</Link>
              {import.meta.env?.DEV && (
                <button
                  type="button"
                  className="link"
                  onClick={handleForceSeedAdmin}
                  disabled={forceSeedLoading}
                  style={{ background: 'none', border: 'none', cursor: forceSeedLoading ? 'wait' : 'pointer', padding: 0, font: 'inherit' }}
                >
                  {forceSeedLoading ? 'Recriando admin…' : 'Criar admin (dev)'}
                </button>
              )}
            </div>
          </form>

          {toast && (
            <div
              className={`toast ${toast.type}`}
              role="status"
              style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000 }}
            >
              {toast.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
