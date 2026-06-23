import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import { buildAdminApiUrl } from '../config/adminApiBase.js';
import {
  buildPrimeiroAcessoPathWithAuth,
  hasSupabaseAuthCallback,
} from '../utils/firstAccessSession.js';
import appLogo from '../assets/love-odonto-logo.png';

const ACCESS_EMAIL_HINT = 'Abra o e-mail de primeiro acesso enviado pela Love Odonto e clique no link para definir sua senha. Esse link contém seu acesso seguro — não acesse /primeiro-acesso diretamente pelo navegador.';

export default function AceitarTermosPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [acceptedAt, setAcceptedAt] = useState('');
  const canContinueToPrimeiroAcesso = hasSupabaseAuthCallback();

  const termsUrl = useMemo(
    () => buildAdminApiUrl(`/public/platform/onboarding/terms?token=${encodeURIComponent(token)}`),
    [token],
  );
  const acceptUrl = useMemo(() => buildAdminApiUrl('/public/platform/onboarding/accept-terms'), []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError('');
        const response = await fetch(termsUrl);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json?.error || 'Link inválido ou expirado.');
        if (!active) return;
        setPreview(json);
        if (json.alreadyAccepted) {
          setAccepted(true);
          setAcceptedAt(json.acceptedAt || '');
        }
      } catch (err) {
        if (active) setError(err?.message || 'Não foi possível carregar o contrato.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, termsUrl]);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      const response = await fetch(acceptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || 'Falha ao registrar aceite.');
      setAccepted(true);
      setAcceptedAt(json.acceptedAt || new Date().toISOString());
    } catch (err) {
      setError(err?.message || 'Falha ao registrar aceite.');
    } finally {
      setAccepting(false);
    }
  };

  const handleGoToPrimeiroAcesso = () => {
    const target = buildPrimeiroAcessoPathWithAuth();
    if (target) {
      navigate(target, { replace: true });
      return;
    }
    setError(ACCESS_EMAIL_HINT);
  };

  return (
    <div className="login">
      <div className="login-form-container" style={{ gridColumn: '1 / -1', minHeight: '100vh' }}>
        <div className="login-form-card" style={{ maxWidth: '720px' }}>
          <div className="login-form-brand">
            <img className="login-form-logo" src={appLogo} alt="LOVE ODONTO" />
            <span className="login-form-brand-name">LOVE ODONTO</span>
          </div>
          <h2 className="login-form-title">Contrato de usabilidade</h2>
          <p className="login-form-subtitle">
            Aceite eletrônico vinculado ao primeiro acesso da clínica na plataforma.
          </p>

          {loading ? <p className="muted">Carregando contrato…</p> : null}

          {!loading && !token ? (
            <div className="login-form-error">Link inválido. Verifique o e-mail recebido após o cadastro da clínica.</div>
          ) : null}

          {!loading && preview ? (
            <div className="stack" style={{ gap: '1rem' }}>
              <p className="muted">
                Clínica: <strong>{preview.clinicName}</strong><br />
                Responsável: <strong>{preview.representativeName}</strong> · {preview.representativeEmail}
              </p>
              <div style={{ border: '1px solid rgba(251, 191, 36, 0.35)', background: 'rgba(251, 191, 36, 0.08)', borderRadius: '12px', padding: '1rem' }}>
                <strong>{preview.termsTitle}</strong>
                <p style={{ whiteSpace: 'pre-line', marginTop: '0.75rem' }}>{preview.termsText}</p>
                <p className="muted" style={{ marginTop: '0.75rem' }}>Versão: {preview.termsVersion}</p>
              </div>

              {preview.expired ? (
                <div className="login-form-error">Este link expirou. Solicite um novo envio à equipe Love Odonto.</div>
              ) : null}

              {accepted ? (
                <>
                  <p className="muted">
                    Aceite registrado{acceptedAt ? ` em ${String(acceptedAt).replace('T', ' ').slice(0, 19)}` : ''}.
                  </p>
                  {canContinueToPrimeiroAcesso ? (
                    <Button variant="primary" onClick={handleGoToPrimeiroAcesso}>
                      Continuar para definir senha
                    </Button>
                  ) : (
                    <p className="login-form-error" style={{ marginTop: 0 }}>
                      {ACCESS_EMAIL_HINT}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {error ? <div className="login-form-error">{error}</div> : null}
                  <Button variant="primary" onClick={handleAccept} disabled={accepting || preview.expired}>
                    {accepting ? 'Registrando aceite…' : 'Li e aceito o contrato de usabilidade'}
                  </Button>
                </>
              )}
            </div>
          ) : null}

          {!loading && !preview && error ? <div className="login-form-error">{error}</div> : null}

          <p className="muted" style={{ marginTop: '1rem', textAlign: 'center' }}>
            <Link to="/login" className="link">Voltar ao login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
