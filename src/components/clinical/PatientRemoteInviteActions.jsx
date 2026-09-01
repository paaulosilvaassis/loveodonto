import { Copy, Send, RefreshCw, XCircle } from 'lucide-react';
import { ClinicalBtn } from './ClinicalStageShell.jsx';
import { CLINICAL_SIGNER_ROLE } from '../../contracts/clinicalRequiredSigners.js';

export function patientRemoteStatusLabel(slot, invite, access = null) {
  if (slot?.status === 'signed') return 'Assinado';
  if (access?.label && access.kind && access.kind !== 'none') return access.label;
  if (invite?.request && ['sent', 'pending'].includes(String(invite.request.status || ''))) return 'Enviado';
  return 'Pendente';
}

export function PatientRemoteInviteActions({
  slot,
  invite,
  canSend,
  canResend = false,
  canRotate = false,
  canRevoke = false,
  canReplace = false,
  busy = false,
  onSend,
  onResend,
  onCopyLink,
  onCancel,
  onRotate,
  onRevoke,
  onReplace,
}) {
  if (slot?.role !== CLINICAL_SIGNER_ROLE.PATIENT || slot?.status === 'signed') return null;
  if (!canSend && !invite && !canResend && !canRotate && !canRevoke && !canReplace) return null;

  if (canResend || invite?.signUrl) {
    return (
      <>
        {canResend || invite?.signUrl ? (
          <ClinicalBtn
            variant="secondary"
            icon={Send}
            data-testid="clinical-resend-signature-cta"
            disabled={busy || !canResend}
            onClick={onResend || onSend}
          >
            Reenviar acesso
          </ClinicalBtn>
        ) : null}
        {canResend ? (
          <ClinicalBtn variant="secondary" icon={Copy} data-testid="clinical-copy-signature-link-cta" disabled={busy} onClick={onCopyLink}>
            Copiar link
          </ClinicalBtn>
        ) : null}
        {canRotate ? (
          <ClinicalBtn variant="secondary" icon={RefreshCw} data-testid="clinical-rotate-signature-cta" disabled={busy} onClick={onRotate}>
            Gerar novo acesso
          </ClinicalBtn>
        ) : null}
        {canRevoke ? (
          <ClinicalBtn variant="secondary" icon={XCircle} data-testid="clinical-cancel-signature-request-cta" disabled={busy} onClick={onRevoke || onCancel}>
            Revogar acesso
          </ClinicalBtn>
        ) : invite?.signUrl ? (
          <ClinicalBtn variant="secondary" icon={XCircle} data-testid="clinical-cancel-signature-request-cta" disabled={busy} onClick={onCancel}>
            Revogar acesso
          </ClinicalBtn>
        ) : null}
      </>
    );
  }

  if (canRotate) {
    return (
      <ClinicalBtn variant="secondary" icon={RefreshCw} data-testid="clinical-rotate-signature-cta" disabled={busy} onClick={onRotate}>
        Gerar novo acesso
      </ClinicalBtn>
    );
  }

  if (canReplace) {
    return (
      <ClinicalBtn
        variant="secondary"
        icon={RefreshCw}
        data-testid="clinical-replace-revoked-access-cta"
        disabled={busy}
        onClick={onReplace}
      >
        Gerar novo acesso
      </ClinicalBtn>
    );
  }

  if (!canSend) return null;
  return (
    <ClinicalBtn variant="secondary" icon={Send} data-testid="clinical-send-signature-cta" disabled={busy} onClick={onSend}>
      Enviar para assinatura
    </ClinicalBtn>
  );
}
