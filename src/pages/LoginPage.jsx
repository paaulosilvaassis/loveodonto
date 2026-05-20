import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { consumeLogoutReason } from '../auth/logoutReason.js';
import { authenticateByEmailPassword } from '../services/userAuthService.js';
import { isSaasModeEnabled, signInSaasWithPassword } from '../services/saasAuthService.js';
import { getAdminApiBaseConfigError } from '../config/adminApiBase.js';
import { seedAdminCredentialsIfEmpty, forceSeedAdminCredentials } from '../db/index.js';
import Button from '../components/Button.jsx';
import appLogo from '../assets/love-odonto-logo.png';

function isAbortLikeError(error) {
  if (String(error?.name || '') === 'AbortError') return true;
  return String(error?.message || '').toLowerCase().includes('abort');
}

function formatLoginErrorMessage(error) {
  if (String(error?.name || '') === 'AbortError') {
    return 'A conexão foi interrompida ao validar o acesso. Tente entrar novamente.';
  }
  const raw = String(error?.message || error || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return 'Erro ao fazer login.';
  if (lower.includes('abort')) {
    return 'A conexão foi interrompida ao validar o acesso. Tente entrar novamente.';
  }
  if (
    lower.includes('backend saas não configurado')
    || lower.includes('vite_platform_api_base_url')
    || lower.includes('variável de ambiente do backend')
  ) {
    return raw;
  }
  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('network request failed')
    || lower.includes('fetch failed')
  ) {
    const backendConfigError = getAdminApiBaseConfigError();
    if (backendConfigError) return backendConfigError;
    if (import.meta.env.PROD) {
      return (
        'Erro de rede no login. Verifique Supabase e se VITE_PLATFORM_API_BASE_URL aponta para a Admin API publicada.'
      );
    }
    return (
      'Erro de rede no login. Verifique Supabase e se a Admin API local (porta 3001) está em execução.'
    );
  }
  if (
    lower.includes('supabase da plataforma não configurado')
    || lower.includes('vite_supabase_platform_url')
    || lower.includes('vite_supabase_platform_anon_key')
  ) {
    return (
      'Configuração do Supabase ausente no app principal. '
      + 'Defina VITE_SUPABASE_PLATFORM_URL e VITE_SUPABASE_PLATFORM_ANON_KEY.'
    );
  }
  if (
    lower.includes('invalid login credentials')
    || lower.includes('e-mail ou senha inválidos')
    || lower.includes('email ou senha invalidos')
  ) {
    return 'E-mail ou senha inválidos.';
  }
  if (lower.includes('stack depth limit exceeded')) {
    return (
      'O backend SaaS entrou em recursão no banco ao validar seu acesso. '
      + 'Verifique se SUPABASE_SERVICE_ROLE_KEY no backend é a service role key correta do mesmo projeto Supabase.'
    );
  }
  return raw;
}

export default function LoginPage() {
  const { login, ensureSeedUser, user } = useAuth();
  const saasEnabled = isSaasModeEnabled();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [forceSeedLoading, setForceSeedLoading] = useState(false);
  const shownActivatedRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (saasEnabled) return;
    ensureSeedUser();
    seedAdminCredentialsIfEmpty().catch(() => {});
  }, [ensureSeedUser, saasEnabled]);

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
    const reason = consumeLogoutReason();
    if (reason) setError(reason);
  }, []);

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
      if (saasEnabled) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const result = await signInSaasWithPassword(emailTrim, password);
            await login({ userId: result.authUserId, tenantId: result.tenantId });
            navigate('/gestao/dashboard');
            return;
          } catch (err) {
            lastErr = err;
            if (attempt === 0 && isAbortLikeError(err)) continue;
            throw err;
          }
        }
        throw lastErr;
      }

      const result = await authenticateByEmailPassword(emailTrim, password);
      if (result) {
        await login({ userId: result.userId, tenantId: result.tenantId });
        navigate('/dashboard');
      } else {
        setError('E-mail ou senha inválidos.');
      }
    } catch (err) {
      setError(formatLoginErrorMessage(err));
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
                <>
                  <Link to="/dashboard" className="link">Já está logado? Ir para o sistema</Link>
                  <Link to="/admin" className="link">Área administrativa</Link>
                </>
              )}
              <Link to="/activate" className="link">Recebeu um convite? Ativar acesso</Link>
              <Link to="/forgot-password" className="link">Esqueci minha senha</Link>
              <Link to="/platform/login" className="link">
                É operador da plataforma (Console)? Entrar aqui
              </Link>
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
            <div className={`toast ${toast.type}`} role="status">
              {toast.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
