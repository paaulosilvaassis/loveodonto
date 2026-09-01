import { Copy, Send, RefreshCw, XCircle, ChevronDown } from 'lucide-react';
import { ClinicalBtn } from './ClinicalStageShell.jsx';
import { CLINICAL_SIGNER_ROLE } from '../../contracts/clinicalRequiredSigners.js';

/** Labels de UX. Não alteram writers nem lifecycle. */
export const SIGNING_ACCESS_ACTION_LABELS = Object.freeze({
  signNow: 'Assinar agora',
  send: 'Enviar para assinatura',
  resend: 'Reenviar acesso',
  copy: 'Copiar link',
  rotate: 'Substituir link de assinatura',
  replace: 'Gerar novo acesso',
  revoke: 'Revogar acesso',
  more: 'Mais ações',
});

export function patientRemoteStatusLabel(slot, invite, access = null) {
  if (slot?.status === 'signed') return 'Assinado';
  if (access?.label && access.kind && access.kind !== 'none') return access.label;
  if (invite?.request && ['sent', 'pending'].includes(String(invite.request.status || ''))) return 'Enviado';
  return 'Pendente';
}

function MoreActions({ children, busy }) {
  return (
    <details className="clinical-access-more" data-testid="clinical-access-more-actions">
      <summary className="clinical-btn clinical-btn--secondary clinical-btn--sm" disabled={busy}>
        <ChevronDown size={15} aria-hidden="true" />
        <span>{SIGNING_ACCESS_ACTION_LABELS.more}</span>
      </summary>
      <div className="clinical-access-more-panel" role="group" aria-label={SIGNING_ACCESS_ACTION_LABELS.more}>
        {children}
      </div>
    </details>
  );
}

export function PatientRemoteInviteActions({
  slot,
  canSend,
  canResend = false,
  canRotate = false,
  canRevoke = false,
  canReplace = false,
  busy = false,
  onSend,
  onResend,
  onCopyLink,
  onRotate,
  onRevoke,
  onReplace,
}) {
  if (slot?.role !== CLINICAL_SIGNER_ROLE.PATIENT || slot?.status === 'signed') return null;

  if (canReplace) {
    return (
      <div className="clinical-signer-access-ops" data-testid="clinical-access-ops-revoked">
        <ClinicalBtn
          variant="primary"
          icon={RefreshCw}
          data-testid="clinical-replace-revoked-access-cta"
          disabled={busy}
          onClick={onReplace}
        >
          {SIGNING_ACCESS_ACTION_LABELS.replace}
        </ClinicalBtn>
      </div>
    );
  }

  const overflow = [];
  if (canResend) {
    overflow.push(
      <ClinicalBtn key="copy" variant="secondary" icon={Copy} data-testid="clinical-copy-signature-link-cta" disabled={busy} onClick={onCopyLink}>
        {SIGNING_ACCESS_ACTION_LABELS.copy}
      </ClinicalBtn>,
    );
  }
  if (canRotate) {
    overflow.push(
      <ClinicalBtn key="rotate" variant="secondary" icon={RefreshCw} data-testid="clinical-rotate-signature-cta" disabled={busy} onClick={onRotate}>
        {SIGNING_ACCESS_ACTION_LABELS.rotate}
      </ClinicalBtn>,
    );
  }
  if (canRevoke) {
    overflow.push(
      <ClinicalBtn
        key="revoke"
        variant="danger"
        icon={XCircle}
        data-testid="clinical-cancel-signature-request-cta"
        disabled={busy}
        onClick={onRevoke}
        aria-label={`${SIGNING_ACCESS_ACTION_LABELS.revoke}. Esta ação invalida o link atual.`}
      >
        {SIGNING_ACCESS_ACTION_LABELS.revoke}
      </ClinicalBtn>,
    );
  }

  if (canResend) {
    return (
      <div className="clinical-signer-access-ops" data-testid="clinical-access-ops-active">
        <ClinicalBtn variant="secondary" icon={Send} data-testid="clinical-resend-signature-cta" disabled={busy} onClick={onResend || onSend}>
          {SIGNING_ACCESS_ACTION_LABELS.resend}
        </ClinicalBtn>
        {overflow.length ? <MoreActions busy={busy}>{overflow}</MoreActions> : null}
      </div>
    );
  }

  if (canRotate) {
    return (
      <div className="clinical-signer-access-ops" data-testid="clinical-access-ops-rotate">
        <ClinicalBtn variant="secondary" icon={RefreshCw} data-testid="clinical-rotate-signature-cta" disabled={busy} onClick={onRotate}>
          {SIGNING_ACCESS_ACTION_LABELS.rotate}
        </ClinicalBtn>
        {canRevoke ? <MoreActions busy={busy}>{overflow.filter((node) => node.key === 'revoke')}</MoreActions> : null}
      </div>
    );
  }

  if (canRevoke) {
    return (
      <div className="clinical-signer-access-ops" data-testid="clinical-access-ops-revoke">
        <ClinicalBtn
          variant="danger"
          icon={XCircle}
          data-testid="clinical-cancel-signature-request-cta"
          disabled={busy}
          onClick={onRevoke}
          aria-label={`${SIGNING_ACCESS_ACTION_LABELS.revoke}. Esta ação invalida o link atual.`}
        >
          {SIGNING_ACCESS_ACTION_LABELS.revoke}
        </ClinicalBtn>
      </div>
    );
  }

  if (!canSend) return null;
  return (
    <ClinicalBtn variant="secondary" icon={Send} data-testid="clinical-send-signature-cta" disabled={busy} onClick={onSend}>
      {SIGNING_ACCESS_ACTION_LABELS.send}
    </ClinicalBtn>
  );
}
