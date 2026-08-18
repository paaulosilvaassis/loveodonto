import { loadDb } from '../db/index.js';
import { formatFriendlyContractNumber } from '../utils/friendlyNumbers.js';
import { buildSignatureInviteEmail } from '../../server/email/buildSignatureInviteEmail.js';
import { resolveClinicEmailIdentity } from './clinicEmailIdentity.js';

export function buildSignatureEmailContent(input = {}) {
  const built = buildSignatureInviteEmail(input);
  return {
    subject: built.subject,
    textBody: built.text,
    htmlBody: built.html,
    patientName: input.patientName,
    treatmentName: built.treatmentName,
    clinicName: built.clinicName,
    clinicIdentity: built.fromName ? input.clinicIdentity : input.clinicIdentity,
    contractNumber: input.contractNumber,
    signUrl: built.signUrl,
    expiresAt: built.expiresAt,
  };
}

export function resolveClinicEmail(settings = {}) {
  if (settings.clinicNotificationEmail) return settings.clinicNotificationEmail;
  const identity = resolveClinicEmailIdentity();
  if (identity.email) return identity.email;
  const db = loadDb();
  const clinic = db.clinicProfile || {};
  return clinic.email || clinic.emailPrincipal || clinic.contatoEmail || '';
}

export function buildContractEmailPreview(contract, formData) {
  return buildSignatureEmailContent({
    patientName: formData.patientName,
    treatmentName: formData.treatmentName,
    clinicIdentity: resolveClinicEmailIdentity(),
    signUrl: formData.signUrlPreview || '',
    expiresAt: formData.expiresAt,
    contractNumber: formatFriendlyContractNumber(contract?.contractNumber, 1),
  });
}
