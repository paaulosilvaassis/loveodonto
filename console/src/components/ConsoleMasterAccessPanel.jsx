import { useState } from 'react';
import { Panel } from './ConsoleUi.jsx';
import { resendClinicOwnerAccess } from '../services/platformConsoleService.js';

function resolveAccessEmail({ masterAccess, legalProfile, clinic }) {
  return masterAccess?.email
    || legalProfile?.legalRepresentativeEmail
    || clinic?.ownerEmail
    || '';
}

function resolveAccessName({ masterAccess, legalProfile, clinic }) {
  return masterAccess?.fullName
    || legalProfile?.legalRepresentativeName
    || clinic?.ownerName
    || '';
}

export default function ConsoleMasterAccessPanel({
  clinic,
  legalProfile,
  masterAccess,
  platformUser,
  canManage = false,
  onResent,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const accessEmail = resolveAccessEmail({ masterAccess, legalProfile, clinic });
  const accessName = resolveAccessName({ masterAccess, legalProfile, clinic });
  const accessRole = masterAccess?.role || 'master';

  const handleResend = async () => {
    if (!canManage || !clinic?.id) return;
    setSaving(true);
    setError('');
    try {
      const response = await resendClinicOwnerAccess(platformUser, clinic.id);
      setResult(response);
      onResent?.(response);
    } catch (err) {
      setError(err?.message || 'Falha ao enviar acesso master.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    if (!result?.setupLink) return;
    await navigator.clipboard.writeText(result.setupLink);
  };

  return (
    <div id="acesso-master">
    <Panel
      title="Acesso master ao SaaS"
      description="Usuário administrador da clínica no Love Odonto — acesso total ao sistema provisionado."
      actions={canManage ? (
        <button
          type="button"
          className="pc-button pc-button--active"
          disabled={saving || !accessEmail}
          onClick={handleResend}
        >
          {saving ? 'Enviando…' : result?.accessEmailSent || result?.sent ? 'Reenviar acesso master' : 'Enviar acesso master'}
        </button>
      ) : null}
    >
      <ul className="pc-info-list">
        <li><span>Responsável</span><strong>{accessName || '—'}</strong></li>
        <li><span>E-mail de acesso</span><strong>{accessEmail || '—'}</strong></li>
        <li><span>Papel</span><strong>{accessRole}</strong></li>
        <li><span>Conta no Auth</span><strong>{masterAccess?.authLinked ? 'Vinculada' : 'Pendente'}</strong></li>
        <li><span>E-mail enviado</span><strong>{
          legalProfile?.onboardingEmailSentAt
            ? String(legalProfile.onboardingEmailSentAt).replace('T', ' ').slice(0, 19)
            : 'Pendente'
        }</strong></li>
      </ul>

      {!accessEmail ? (
        <p className="pc-error">Cadastre o e-mail do responsável legal para liberar o acesso master.</p>
      ) : null}

      {error ? <p className="pc-error">{error}</p> : null}

      {result ? (
        <div className="pc-review-grid">
          {result.accessEmailSent || result.sent ? (
            <p className="pc-success">
              Acesso master enviado para <strong>{result.accessEmail || accessEmail}</strong>.
              {result.emailDelivery === 'supabase_auth'
                ? ' Verifique a caixa de entrada (convite Supabase Auth).'
                : ''}
            </p>
          ) : (
            <p><strong>{result.message || 'E-mail transacional não configurado no backend.'}</strong></p>
          )}
          {result.setupLink ? (
            <>
              <p><strong>Link manual de senha:</strong> {result.setupLink}</p>
              <div className="pc-inline-actions">
                <button type="button" className="pc-button" onClick={handleCopyLink}>
                  Copiar link de acesso
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p style={{ fontSize: '0.9rem', color: 'var(--pc-muted, #94a3b8)' }}>
          O responsável receberá um e-mail para definir a senha e acessar o Love Odonto com permissões master.
        </p>
      )}
    </Panel>
    </div>
  );
}
