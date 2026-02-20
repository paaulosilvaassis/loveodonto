import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { activateUserInvite } from '../services/userInviteService.js';
import appLogo from '../assets/love-odonto-logo.png';

const MIN_PASSWORD_LENGTH = 8;

export default function ActivatePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get('token') || '';

  const [email, setEmail] = useState('');
  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [activating, setActivating] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const emailTrim = (email || '').trim().toLowerCase();
    if (!emailTrim) {
      setError('E-mail é obrigatório.');
      return;
    }
    if (!token.trim()) {
      setError('Código do convite é obrigatório.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Senha deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Senha e confirmar senha devem ser iguais.');
      return;
    }
    setActivating(true);
    try {
      await activateUserInvite(token.trim(), { email: emailTrim, password });
      navigate('/login', { state: { activated: true }, replace: true });
    } catch (err) {
      setError(err?.message || 'Erro ao ativar conta.');
    } finally {
      setActivating(false);
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
          <h2 className="login-form-title">Ativar acesso</h2>
          <p className="login-form-subtitle">
            Informe o e-mail do convite, o código recebido e defina sua senha.
          </p>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-form-field">
              <label className="login-form-label" htmlFor="activate-email">E-mail</label>
              <input
                id="activate-email"
                type="email"
                className="login-form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                required
              />
            </div>

            <div className="login-form-field">
              <label className="login-form-label" htmlFor="activate-token">Código do convite</label>
              <input
                id="activate-token"
                type="text"
                className="login-form-input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cole o código do convite"
              />
            </div>

            <div className="login-form-field">
              <label className="login-form-label" htmlFor="activate-password">Nova senha</label>
              <input
                id="activate-password"
                type="password"
                className="login-form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>

            <div className="login-form-field">
              <label className="login-form-label" htmlFor="activate-confirm">Confirmar senha</label>
              <input
                id="activate-confirm"
                type="password"
                className="login-form-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a senha"
              />
            </div>

            {error && <div className="login-form-error">{error}</div>}

            <Button type="submit" variant="primary" disabled={activating} className="login-form-button">
              {activating ? 'Ativando…' : 'Ativar conta'}
            </Button>

            <p className="muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link to="/login" className="link">Voltar ao login</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
