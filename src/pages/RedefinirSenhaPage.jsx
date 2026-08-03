import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { clearStoredSession } from '../auth/saasSessionResolver.js';
import {
  auditFirstAccess,
  bootstrapPasswordRecoverySession,
  classifyFirstAccessError,
  completePasswordRecovery,
  EXPIRED_LINK_MESSAGE,
  markFirstAccessPasswordPending,
  NO_TOKEN_MESSAGE,
} from '../utils/firstAccessSession.js';
import { evaluatePasswordStrength, validatePasswordPair } from '../utils/passwordStrength.js';
import appLogo from '../assets/love-odonto-logo.png';

function resolveBootstrapError({ supabaseError, errorCode, hadAuthParams }) {
  if (supabaseError) {
    return classifyFirstAccessError(supabaseError).message;
  }
  if (errorCode === 'expired_link' || hadAuthParams) {
    return EXPIRED_LINK_MESSAGE;
  }
  return NO_TOKEN_MESSAGE;
}

function strengthClass(level) {
  if (level === 'strong') return 'password-strength--strong';
  if (level === 'medium') return 'password-strength--medium';
  return 'password-strength--weak';
}

export default function RedefinirSenhaPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');

  const strength = evaluatePasswordStrength(password);

  useEffect(() => {
    markFirstAccessPasswordPending(true);
    let active = true;

    async function bootstrap() {
      if (!supabasePlatformClient) {
        setError('Configuração de autenticação indisponível.');
        setLoading(false);
        return;
      }

      try {
        const { session, urlState, supabaseError, errorCode } = await bootstrapPasswordRecoverySession(
          supabasePlatformClient,
        );
        if (!active) return;

        const hadAuthParams = Boolean(
          urlState.code
          || (urlState.accessToken && urlState.refreshToken)
          || urlState.hasHash,
        );

        if (supabaseError || errorCode || !session?.user) {
          const message = resolveBootstrapError({ supabaseError, errorCode, hadAuthParams });
          auditFirstAccess('RedefinirSenhaPage blocked', {
            setSessionError: supabaseError?.message || null,
            errorCode: errorCode || null,
            hadAuthParams,
          });
          setError(message);
          setLoading(false);
          markFirstAccessPasswordPending(false);
          return;
        }

        setEmail(session.user.email || '');
        setReady(true);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        const classified = classifyFirstAccessError(err);
        setError(classified.message);
        setLoading(false);
        markFirstAccessPasswordPending(false);
      }
    }

    bootstrap();
    return () => {
      active = false;
      markFirstAccessPasswordPending(false);
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    const validation = validatePasswordPair(password, confirmPassword);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    if (!supabasePlatformClient) {
      setError('Configuração de autenticação indisponível.');
      return;
    }

    setLoading(true);
    markFirstAccessPasswordPending(true);
    try {
      const { error: updateError } = await supabasePlatformClient.auth.updateUser({ password });
      if (updateError) {
        const classified = classifyFirstAccessError(updateError);
        setError(classified.message);
        return;
      }

      await completePasswordRecovery(supabasePlatformClient, clearStoredSession);
    } catch (err) {
      const classified = classifyFirstAccessError(err);
      setError(classified.message);
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
          <h2 className="login-form-title">Criar nova senha</h2>
          <p className="login-form-subtitle">
            Defina uma senha segura para acessar o sistema.
          </p>

          {loading && !ready ? (
            <p className="muted">Validando link…</p>
          ) : null}

          {ready ? (
            <form className="login-form" onSubmit={handleSubmit}>
              {email ? (
                <p className="muted password-recovery-email">
                  Conta: <strong>{email}</strong>
                </p>
              ) : null}

              <div className="login-form-field">
                <label className="login-form-label" htmlFor="recovery-password">Nova senha</label>
                <input
                  id="recovery-password"
                  type="password"
                  className="login-form-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="login-form-field">
                <label className="login-form-label" htmlFor="recovery-confirm">Confirmar senha</label>
                <input
                  id="recovery-confirm"
                  type="password"
                  className="login-form-input"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              {password ? (
                <div className={`password-strength ${strengthClass(strength.level)}`} aria-live="polite">
                  <span className="password-strength__label">{strength.label}</span>
                  <ul className="password-strength__rules">
                    <li className={strength.checks.minLength ? 'ok' : ''}>Mínimo 8 caracteres</li>
                    <li className={strength.checks.uppercase ? 'ok' : ''}>1 letra maiúscula</li>
                    <li className={strength.checks.number ? 'ok' : ''}>1 número</li>
                    <li className={strength.checks.special ? 'ok' : ''}>1 caractere especial</li>
                  </ul>
                </div>
              ) : null}

              {error ? <div className="login-form-error">{error}</div> : null}

              <Button type="submit" variant="primary" disabled={loading} className="login-form-button">
                {loading ? 'Salvando…' : 'Salvar senha'}
              </Button>
            </form>
          ) : null}

          {!ready && !loading && error ? <div className="login-form-error">{error}</div> : null}

          <p className="muted password-recovery-back">
            <Link to="/login" className="link">Voltar ao login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
