import { Copy, Send, XCircle } from 'lucide-react';
import { ClinicalBtn } from './ClinicalStageShell.jsx';
import { CLINICAL_SIGNER_ROLE } from '../../contracts/clinicalRequiredSigners.js';

export function patientRemoteStatusLabel(slot, invite) {
  if (slot?.status === 'signed') return 'Assinado';
  if (invite?.request && ['sent', 'pending'].includes(String(invite.request.status || ''))) return 'Enviado';
  return 'Pendente';
}

export function PatientRemoteInviteActions({
  slot,
  invite,
  canSend,
  onSend,
  onResend,
  onCopyLink,
  onCancel,
}) {
  if (slot?.role !== CLINICAL_SIGNER_ROLE.PATIENT || slot?.status === 'signed') return null;
  if (!canSend && !invite) return null;
  if (invite?.signUrl) {
    return (
      <>
        <ClinicalBtn variant="secondary" icon={Send} data-testid="clinical-resend-signature-cta" onClick={onResend || onSend}>
          Reenviar e-mail
        </ClinicalBtn>
        <ClinicalBtn variant="secondary" icon={Copy} data-testid="clinical-copy-signature-link-cta" onClick={onCopyLink}>
          Copiar link
        </ClinicalBtn>
        <ClinicalBtn variant="secondary" icon={XCircle} data-testid="clinical-cancel-signature-request-cta" onClick={onCancel}>
          Cancelar solicitação
        </ClinicalBtn>
      </>
    );
  }
  if (!canSend) return null;
  return (
    <ClinicalBtn variant="secondary" icon={Send} data-testid="clinical-send-signature-cta" onClick={onSend}>
      Enviar para assinatura
    </ClinicalBtn>
  );
}
