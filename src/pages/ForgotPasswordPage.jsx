import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { isSaasModeEnabled, requestSelfServicePasswordReset } from '../services/saasAuthService.js';
import appLogo from '../assets/love-odonto-logo.png';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [toast, setToast] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setToast(null);

    if (!isSaasModeEnabled()) {
      setError('Recuperação de senha indisponível. Entre em contato com o administrador.');
      return;
    }

    setLoading(true);
    try {
      const result = await requestSelfServicePasswordReset(email);
      setSent(true);
      setToast({
        type: 'success',
        message: `Se o e-mail estiver cadastrado, você receberá um link de redefinição em: ${result.email}`,
      });
    } catch (err) {
      setError(err?.message || 'Não foi possível enviar o e-mail. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login">
      <div className="login-form-container login-form-container--recovery">
        <div className="login-form-card login-form-card--recovery">
          <div className="login-form-brand">
            <img className="login-form-logo" src={appLogo} alt="LOVE ODONTO" />
            <span className="login-form-brand-name">LOVE ODONTO</span>
          </div>
          <h2 className="login-form-title">Esqueceu sua senha?</h2>
          <p className="login-form-subtitle">
            Informe seu e-mail de acesso. Enviaremos um link seguro para criar uma nova senha.
          </p>

          {sent ? (
            <div className="password-recovery-success" role="status">
              <p>Verifique sua caixa de entrada e siga as instruções do e-mail.</p>
              <Link to="/login" className="link">Voltar ao login</Link>
            </div>
          ) : (
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-form-field">
                <label className="login-form-label" htmlFor="forgot-email">E-mail</label>
                <input
                  id="forgot-email"
                  type="email"
                  className="login-form-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  autoComplete="email"
                  required
                />
              </div>

              {error ? <div className="login-form-error">{error}</div> : null}

              <Button type="submit" variant="primary" disabled={loading} className="login-form-button">
                {loading ? 'Enviando…' : 'Enviar recuperação'}
              </Button>
            </form>
          )}

          <p className="muted password-recovery-back">
            <Link to="/login" className="link">Voltar ao login</Link>
          </p>

          {toast ? (
            <div className={`toast ${toast.type}`} role="status">
              {toast.message}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
