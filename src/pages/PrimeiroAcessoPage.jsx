import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { supabasePlatformClient } from '../lib/supabaseClients.js';
import { clearStoredSession } from '../auth/saasSessionResolver.js';
import {
  auditFirstAccess,
  bootstrapFirstAccessSession,
  captureAuthCallbackFromUrl,
  classifyFirstAccessError,
  completeFirstAccess,
  EXPIRED_LINK_MESSAGE,
  isAbortError,
  markFirstAccessPasswordPending,
  NO_TOKEN_MESSAGE,
} from '../utils/firstAccessSession.js';
import appLogo from '../assets/love-odonto-logo.png';

const MIN_PASSWORD_LENGTH = 8;

function resolveBootstrapError({ supabaseError, errorCode, hadAuthParams }) {
  if (supabaseError && isAbortError(supabaseError)) {
    // Abort transitório nunca deve aparecer como falha final ao usuário.
    return null;
  }
  if (errorCode === 'aborted') {
    return null;
  }
  if (supabaseError) {
    return classifyFirstAccessError(supabaseError).message;
  }
  if (errorCode === 'expired_link' || hadAuthParams) {
    return EXPIRED_LINK_MESSAGE;
  }
  return NO_TOKEN_MESSAGE;
}

export default function PrimeiroAcessoPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    // Captura o hash imediatamente (antes de qualquer cleanup/StrictMode).
    captureAuthCallbackFromUrl();
    markFirstAccessPasswordPending(true);
    let active = true;

    async function bootstrap() {
      if (!supabasePlatformClient) {
        if (!active) return;
        setError('Configuração de autenticação indisponível.');
        setLoading(false);
        return;
      }

      try {
        const {
          session,
          urlState,
          supabaseError,
          errorCode,
        } = await bootstrapFirstAccessSession(supabasePlatformClient);

        // StrictMode: 1ª execução pode ter active=false; a 2ª reutiliza o mesmo resultado.
        if (!active) return;

        const hadAuthParams = Boolean(
          urlState.code
          || (urlState.accessToken && urlState.refreshToken)
          || urlState.hasHash,
        );

        if (supabaseError || errorCode || !session?.user) {
          if (isAbortError(supabaseError) || errorCode === 'aborted') {
            auditFirstAccess('PrimeiroAcessoPage abort ignored — retry', {
              setSessionError: supabaseError?.message || null,
            });
            // Re-tenta uma vez após o single-flight liberar (StrictMode/race).
            await new Promise((r) => { setTimeout(r, 200); });
            if (!active) return;
            const retry = await bootstrapFirstAccessSession(supabasePlatformClient);
            if (!active) return;
            if (retry.session?.user) {
              bootstrappedRef.current = true;
              setEmail(retry.session.user.email || '');
              setReady(true);
              setLoading(false);
              setError('');
              return;
            }
          }

          const message = resolveBootstrapError({
            supabaseError,
            errorCode,
            hadAuthParams,
          });
          auditFirstAccess('PrimeiroAcessoPage blocked', {
            setSessionError: supabaseError?.message || null,
            errorCode: errorCode || classifyFirstAccessError(supabaseError)?.code || null,
            hadAuthParams,
          });
          if (message) setError(message);
          setLoading(false);
          return;
        }

        auditFirstAccess('PrimeiroAcessoPage ready', {
          sessionUserId: session.user.id,
          sessionUserEmail: session.user.email || null,
        });
        bootstrappedRef.current = true;
        setEmail(session.user.email || '');
        setReady(true);
        setLoading(false);
        setError('');
      } catch (err) {
        if (!active) return;
        if (isAbortError(err)) {
          auditFirstAccess('PrimeiroAcessoPage catch abort ignored', {
            setSessionError: err?.message || null,
          });
          // Mantém "Validando convite…" e tenta de novo.
          try {
            const retry = await bootstrapFirstAccessSession(supabasePlatformClient);
            if (!active) return;
            if (retry.session?.user) {
              bootstrappedRef.current = true;
              setEmail(retry.session.user.email || '');
              setReady(true);
              setLoading(false);
              setError('');
              return;
            }
          } catch {
            /* cai no erro amigável abaixo */
          }
          if (!active) return;
          setError(EXPIRED_LINK_MESSAGE);
          setLoading(false);
          return;
        }
        const classified = classifyFirstAccessError(err);
        setError(classified.message);
        setLoading(false);
      }
    }

    bootstrap();
    return () => {
      active = false;
      // Libera lock de montagem; isFirstAccessProtected continua true pela pathname.
      markFirstAccessPasswordPending(false);
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
    markFirstAccessPasswordPending(true);
    try {
      const { data, error: updateError } = await supabasePlatformClient.auth.updateUser({ password });
      auditFirstAccess('updateUser', {
        updateUserError: updateError?.message || null,
        updateUserSuccess: !updateError,
        sessionUserId: data?.user?.id || null,
        sessionUserEmail: data?.user?.email || null,
      });
      if (updateError) {
        if (isAbortError(updateError)) {
          setError('Não foi possível salvar a senha (requisição interrompida). Tente novamente.');
          return;
        }
        const classified = classifyFirstAccessError(updateError);
        setError(classified.message);
        return;
      }

      await completeFirstAccess(supabasePlatformClient, clearStoredSession);
    } catch (err) {
      const classified = classifyFirstAccessError(err);
      auditFirstAccess('updateUser exception', { updateUserError: err?.message || null });
      setError(classified.message);
    } finally {
      setLoading(false);
      markFirstAccessPasswordPending(false);
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
