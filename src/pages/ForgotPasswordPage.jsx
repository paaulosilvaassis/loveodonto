import { Link } from 'react-router-dom';
import appLogo from '../assets/love-odonto-logo.png';

/**
 * Placeholder para recuperação de senha.
 * Pode ser implementado posteriormente com envio de e-mail.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="login">
      <div className="login-form-container" style={{ gridColumn: '1 / -1' }}>
        <div className="login-form-card">
          <div className="login-form-brand">
            <img className="login-form-logo" src={appLogo} alt="LOVE ODONTO" />
            <span className="login-form-brand-name">LOVE ODONTO</span>
          </div>
          <h2 className="login-form-title">Esqueci minha senha</h2>
          <p className="login-form-subtitle">
            Entre em contato com o administrador para redefinir sua senha.
          </p>
          <p className="muted" style={{ marginTop: '1rem' }}>
            <Link to="/login" className="link">Voltar ao login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
