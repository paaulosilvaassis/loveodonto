import { useState } from 'react';
import { Shield, Lock } from 'lucide-react';
import { verifyPin, setPin, hasPinConfigured } from '../services/adminGateService.js';
import Button from './Button.jsx';

const PIN_LENGTH = 6;

function getInitialIsSetup() {
  try {
    return !hasPinConfigured();
  } catch (e) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/614eba6f-bd1f-4c67-b060-4700f9b57da0',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53053a'},body:JSON.stringify({sessionId:'53053a',location:'AdminGateModal.jsx:hasPinConfigured',message:'hasPinConfigured threw',data:{message:String(e?.message)},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return true;
  }
}
export default function AdminGateModal({ open, onClose, onSuccess }) {
  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(getInitialIsSetup);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    if ((pin || '').trim().length !== PIN_LENGTH) {
      setError('Informe o PIN de 6 dígitos.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPin(pin.trim());
      if (result.needsSetup) {
        setIsSetup(true);
        setError('');
      } else if (result.ok) {
        onSuccess?.();
        onClose?.();
        setPinValue('');
      } else {
        setError(result.error || 'PIN inválido.');
      }
    } catch (err) {
      setError(err?.message || 'Erro ao verificar PIN.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setError('');
    if ((pin || '').trim().length !== PIN_LENGTH) {
      setError('PIN deve ter 6 dígitos.');
      return;
    }
    if (pin !== confirmPin) {
      setError('PIN e confirmação não conferem.');
      return;
    }
    setLoading(true);
    try {
      await setPin(pin, confirmPin);
      setIsSetup(false);
      setPinValue('');
      setConfirmPin('');
      setError('');
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Erro ao definir PIN.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} />
            {isSetup ? 'Definir PIN do Administrador' : 'Acesso restrito'}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
            {isSetup
              ? 'Configure um PIN de 6 dígitos para proteger o painel administrativo.'
              : 'Informe o PIN do Administrador para acessar o painel.'}
          </p>

          <form onSubmit={isSetup ? handleSetup : handleVerify} className="stack">
            <div className="login-form-field">
              <label className="login-form-label" htmlFor="admin-pin">
                PIN do Administrador (6 dígitos)
              </label>
              <input
                id="admin-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={PIN_LENGTH}
                className="login-form-input"
                value={pin}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                placeholder="••••••"
                autoComplete="off"
              />
            </div>

            {isSetup && (
              <div className="login-form-field">
                <label className="login-form-label" htmlFor="admin-pin-confirm">
                  Confirmar PIN
                </label>
                <input
                  id="admin-pin-confirm"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={PIN_LENGTH}
                  className="login-form-input"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
                  placeholder="••••••"
                  autoComplete="off"
                />
              </div>
            )}

            {error && <div className="login-form-error">{error}</div>}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Verificando…' : isSetup ? 'Definir PIN' : 'Acessar painel'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </form>

          <p className="muted" style={{ fontSize: '0.75rem', marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <Lock size={12} />
            Acesso restrito
          </p>
        </div>
      </div>
    </div>
  );
}
