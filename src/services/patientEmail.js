/**
 * E-mail civil do paciente. SSOT do cadastro é patientDocuments.personal_email.
 * Nunca inventa destinatário.
 */
export function resolvePatientEmail(bundle) {
  if (!bundle || typeof bundle !== 'object') return '';
  const docs = bundle.documents && typeof bundle.documents === 'object' ? bundle.documents : {};
  const profile = bundle.profile && typeof bundle.profile === 'object' ? bundle.profile : {};
  const access = bundle.access && typeof bundle.access === 'object' ? bundle.access : {};
  const patient = bundle.patient && typeof bundle.patient === 'object' ? bundle.patient : {};
  const candidates = [
    docs.personal_email,
    docs.email,
    profile.personal_email,
    profile.email,
    patient.email,
    access.access_email,
  ];
  for (const value of candidates) {
    const email = String(value || '').trim();
    if (email.includes('@')) return email;
  }
  return '';
}

export const PATIENT_EMAIL_REQUIRED_MSG = 'Informe o e-mail do paciente para enviar o link de assinatura.';
