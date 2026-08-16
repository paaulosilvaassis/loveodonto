function expiryLabel(expiresAt) {
  if (!expiresAt) return 'o prazo informado';
  try {
    return new Date(expiresAt).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'o prazo informado';
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildSignatureInviteEmail({
  patientName,
  treatmentName,
  clinicName,
  signUrl,
  expiresAt,
  contractNumber,
}) {
  const who = patientName || 'paciente';
  const clinic = clinicName || 'Clínica';
  const treatment = treatmentName || 'tratamento odontológico';
  const number = contractNumber ? ` (${contractNumber})` : '';
  const until = expiryLabel(expiresAt);
  const subject = `Contrato odontológico para assinatura - ${clinic}`;
  const text = [
    `Olá, ${who}.`,
    '',
    `Seu contrato de prestação de serviços odontológicos${number} referente ao tratamento ${treatment} está disponível para assinatura eletrônica.`,
    '',
    'Acesse o link abaixo para visualizar e assinar o documento:',
    signUrl || '',
    '',
    `Este link é pessoal, seguro e válido até ${until}.`,
  ].join('\n');
  const html = `
    <p>Olá, <strong>${escapeHtml(who)}</strong>.</p>
    <p>Seu contrato de prestação de serviços odontológicos${escapeHtml(number)} referente ao tratamento
    <strong>${escapeHtml(treatment)}</strong> está disponível para assinatura eletrônica.</p>
    <p>Clique no botão abaixo para visualizar e assinar o documento.</p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(signUrl || '#')}" style="background:#0f766e;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">
        Assinar contrato
      </a>
    </p>
    <p style="color:#64748b;font-size:14px">Este link é pessoal, seguro e válido até ${escapeHtml(until)}.</p>
  `.trim();
  return { subject, text, html };
}
