import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import appLogo from '../assets/love-odonto-logo.png';

const MIN_PASSWORD_LENGTH = 8;

export default function PrimeiroAcessoPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!supabasePlatformClient) {
        setError('Configuração de autenticação indisponível.');
        setLoading(false);
        return;
      }

      const { data, error: sessionError } = await supabasePlatformClient.auth.getSession();
      if (!active) return;

      if (sessionError) {
        setError(sessionError.message || 'Não foi possível validar o convite.');
        setLoading(false);
        return;
      }

      const session = data?.session;
      if (!session?.user) {
        setError('Link inválido ou expirado. Solicite um novo convite ao administrador.');
        setLoading(false);
        return;
      }

      setEmail(session.user.email || '');
      setReady(true);
      setLoading(false);
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Senha e confirmação devem ser iguais.');
      return;
    }
    if (!supabasePlatformClient) {
      setError('Configuração de autenticação indisponível.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabasePlatformClient.auth.updateUser({ password });
      if (updateError) throw updateError;
      await supabasePlatformClient.auth.signOut();
      navigate('/login', { replace: true, state: { passwordSet: true } });
    } catch (err) {
      setError(err?.message || 'Não foi possível definir a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-form-container" style={{ gridColumn: '1 / -1', minHeight: '100vh' }}>
        <div className="login-form-card">
          <div className="login-form-brand">
            <img className="login-form-logo" src={appLogo} alt="LOVE ODONTO" />
            <span className="login-form-brand-name">LOVE ODONTO</span>
          </div>
          <h2 className="login-form-title">Primeiro acesso</h2>
          <p className="login-form-subtitle">
            Defina sua senha para concluir o convite e entrar no sistema.
          </p>

          {loading && !ready ? (
            <p className="muted">Validando convite…</p>
          ) : null}

          {ready ? (
            <form className="login-form" onSubmit={handleSubmit}>
              {email ? (
                <p className="muted" style={{ marginBottom: '1rem' }}>
                  Conta: <strong>{email}</strong>
                </p>
              ) : null}

              <div className="login-form-field">
                <label className="login-form-label" htmlFor="primeiro-acesso-password">Nova senha</label>
                <input
                  id="primeiro-acesso-password"
                  type="password"
                  className="login-form-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>

              <div className="login-form-field">
                <label className="login-form-label" htmlFor="primeiro-acesso-confirm">Confirmar senha</label>
                <input
                  id="primeiro-acesso-confirm"
                  type="password"
                  className="login-form-input"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>

              {error ? <div className="login-form-error">{error}</div> : null}

              <Button type="submit" variant="primary" disabled={loading} className="login-form-button">
                {loading ? 'Salvando…' : 'Definir senha e continuar'}
              </Button>
            </form>
          ) : null}

          {!ready && !loading && error ? <div className="login-form-error">{error}</div> : null}

          <p className="muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/login" className="link">Voltar ao login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
