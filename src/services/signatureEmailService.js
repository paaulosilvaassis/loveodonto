import { loadDb } from '../db/index.js';
import { formatFriendlyContractNumber } from '../utils/friendlyNumbers.js';

export function buildSignatureEmailContent({
  patientName,
  treatmentName,
  clinicName,
  signUrl,
  expiresAt,
}) {
  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : 'o prazo informado';

  const subject = `Contrato odontológico para assinatura - ${clinicName || 'Clínica'}`;

  const textBody = [
    `Olá, ${patientName || 'paciente'}.`,
    '',
    `Seu contrato de prestação de serviços odontológicos referente ao tratamento ${treatmentName || 'odontológico'} está disponível para assinatura eletrônica.`,
    '',
    'Clique no link abaixo para visualizar e assinar o documento:',
    signUrl || '[link de assinatura]',
    '',
    `Este link é pessoal, seguro e válido até ${expiryLabel}.`,
  ].join('\n');

  const htmlBody = `
    <p>Olá, <strong>${patientName || 'paciente'}</strong>.</p>
    <p>Seu contrato de prestação de serviços odontológicos referente ao tratamento
    <strong>${treatmentName || 'odontológico'}</strong> está disponível para assinatura eletrônica.</p>
    <p>Clique no botão abaixo para visualizar e assinar o documento.</p>
    <p style="margin:24px 0">
      <a href="${signUrl || '#'}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
        Assinar contrato
      </a>
    </p>
    <p style="color:#64748b;font-size:14px">Este link é pessoal, seguro e válido até ${expiryLabel}.</p>
  `.trim();

  return { subject, textBody, htmlBody };
}

export function resolveClinicEmail(settings = {}) {
  if (settings.clinicNotificationEmail) return settings.clinicNotificationEmail;
  const db = loadDb();
  const clinic = db.clinicProfile || {};
  return clinic.email || clinic.contatoEmail || '';
}

export function buildContractEmailPreview(contract, formData) {
  const db = loadDb();
  const clinicName = db.clinicProfile?.nomeFantasia || db.clinicProfile?.razaoSocial || 'Clínica';
  return buildSignatureEmailContent({
    patientName: formData.patientName,
    treatmentName: contract?.planName || contract?.title || 'Tratamento odontológico',
    clinicName,
    signUrl: formData.signUrlPreview || '',
    expiresAt: formData.expiresAt,
    contractNumber: formatFriendlyContractNumber(contract?.contractNumber, 1),
  });
}
