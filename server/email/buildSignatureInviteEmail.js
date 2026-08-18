import {
  resolveTreatmentName,
  sanitizeClinicIdentity,
  sanitizeFromDisplayName,
} from './signatureInviteClinicIdentity.js';

function expiryLabel(expiresAt) {
  if (!expiresAt) return '';
  try {
    const date = new Date(expiresAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
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

function joinSections(sections) {
  return sections
    .map((block) => block.filter(Boolean).join('\n'))
    .filter((block) => block.trim())
    .join('\n\n');
}

export function buildSignatureInviteEmail({
  patientName,
  treatmentName,
  clinicName,
  clinicIdentity,
  signUrl,
  expiresAt,
  contractNumber,
} = {}) {
  const clinic = sanitizeClinicIdentity({
    ...(clinicIdentity || {}),
    name: (clinicIdentity && clinicIdentity.name) || clinicName,
  });
  const displayClinic = clinic.name || 'clínica responsável pelo seu atendimento';
  const who = String(patientName || '').trim();
  const treatment = resolveTreatmentName(treatmentName);
  const number = String(contractNumber || '').trim();
  const until = expiryLabel(expiresAt);
  const href = String(signUrl || '').trim();
  const subject = `Assinatura de contrato — ${sanitizeFromDisplayName(displayClinic)}`;

  const greeting = who ? `Olá, ${who},` : 'Olá,';
  const intro = `A ${displayClinic} disponibilizou um documento para sua assinatura eletrônica.`;

  const text = joinSections([
    [greeting, intro],
    [
      'Contrato de Prestação de Serviços Odontológicos',
      number ? `Contrato: ${number}` : '',
      treatment ? `Tratamento: ${treatment}` : '',
    ],
    [
      'Para revisar o documento completo e realizar sua assinatura, utilize o link abaixo.',
      href,
    ],
    [
      'Assinatura segura',
      'Este é um link individual e destinado exclusivamente ao signatário. Por segurança, não encaminhe este e-mail para outras pessoas.',
      until ? `Prazo para assinatura: ${until}` : '',
    ],
    ['Caso tenha alguma dúvida sobre o tratamento ou sobre o documento, entre em contato diretamente com a clínica antes de realizar a assinatura.'],
    [
      'Atenciosamente,',
      displayClinic,
      clinic.legalName,
      clinic.address,
      clinic.cityState,
      clinic.phone,
      clinic.email,
      clinic.technicalResponsible
        ? `Responsável técnico: ${clinic.technicalResponsible}${clinic.cro ? ` — ${clinic.cro}` : ''}`
        : '',
    ],
    [
      'Documento enviado eletronicamente por meio do Love Odonto.',
      'Esta é uma mensagem transacional relacionada ao seu atendimento odontológico.',
    ],
  ]);

  const logoBlock = clinic.logoUrl
    ? `<img src="${escapeHtml(clinic.logoUrl)}" alt="${escapeHtml(displayClinic)}" width="160" style="display:block;margin:0 auto;max-width:160px;height:auto;border:0;" />`
    : `<p style="margin:0;font-size:20px;letter-spacing:0.04em;color:#1c1917;font-weight:600;">${escapeHtml(displayClinic)}</p>`;

  const treatmentRow = treatment
    ? `<tr><td style="padding:6px 0;font-size:14px;color:#57534e;">Tratamento</td></tr>
       <tr><td style="padding:0 0 8px;font-size:15px;color:#1c1917;font-weight:600;">${escapeHtml(treatment)}</td></tr>`
    : '';

  const contractRow = number
    ? `<tr><td style="padding:6px 0;font-size:14px;color:#57534e;">Contrato</td></tr>
       <tr><td style="padding:0 0 8px;font-size:15px;color:#1c1917;font-weight:600;">${escapeHtml(number)}</td></tr>`
    : '';

  const expiryBlock = until
    ? `<p style="margin:0 0 4px;font-size:13px;color:#57534e;">Prazo para assinatura</p>
       <p style="margin:0;font-size:14px;color:#1c1917;">${escapeHtml(until)}</p>`
    : '';

  const contactLines = [
    clinic.address,
    clinic.cityState,
    clinic.phone,
    clinic.email,
    clinic.technicalResponsible
      ? `Responsável técnico: ${clinic.technicalResponsible}${clinic.cro ? ` — ${clinic.cro}` : ''}`
      : '',
  ].filter(Boolean).map((item) => `<p style="margin:0 0 4px;font-size:13px;color:#57534e;">${escapeHtml(item)}</p>`).join('');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0ea;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f0ea;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:36px 40px 24px;text-align:center;background:#ffffff;">
              ${logoBlock}
              <p style="margin:18px 0 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#0f766e;font-family:Arial,Helvetica,sans-serif;">Documento para assinatura eletrônica</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 40px 28px;color:#1c1917;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${escapeHtml(greeting)}</p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#44403c;">${escapeHtml(intro)}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf7f2;border:1px solid #e7e0d6;border-radius:12px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#1c1917;">Contrato de Prestação de Serviços Odontológicos</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      ${contractRow}
                      ${treatmentRow}
                    </table>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0;font-size:15px;line-height:1.7;color:#44403c;">Para revisar o documento completo e realizar sua assinatura, utilize o botão abaixo.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto 28px;">
                <tr>
                  <td style="background:#0f766e;border-radius:8px;">
                    <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:0.08em;font-weight:700;">REVISAR E ASSINAR CONTRATO</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1c1917;font-family:Arial,Helvetica,sans-serif;">Assinatura segura</p>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#78716c;">Este é um link individual e destinado exclusivamente ao signatário. Por segurança, não encaminhe este e-mail para outras pessoas.</p>
              ${expiryBlock}
              <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#44403c;">Caso tenha alguma dúvida sobre o tratamento ou sobre o documento, entre em contato diretamente com a clínica antes de realizar a assinatura.</p>
              <p style="margin:24px 0 4px;font-size:15px;">Atenciosamente,</p>
              <p style="margin:0 0 12px;font-size:15px;font-weight:600;">${escapeHtml(displayClinic)}</p>
              ${contactLines}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #e7e0d6;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#a8a29e;font-family:Arial,Helvetica,sans-serif;">Documento enviado eletronicamente por meio do Love Odonto.</p>
              <p style="margin:0;font-size:12px;color:#a8a29e;font-family:Arial,Helvetica,sans-serif;">Esta é uma mensagem transacional relacionada ao seu atendimento odontológico.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return {
    subject,
    text,
    html,
    fromName: clinic.name,
    replyTo: clinic.email,
    treatmentName: treatment,
    clinicName: displayClinic,
    signUrl: href,
    expiresAt: expiresAt || null,
  };
}
