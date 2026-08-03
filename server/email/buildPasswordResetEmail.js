export function buildPasswordResetEmail({ userName, resetLink }) {
  const safeName = String(userName || 'Colaborador').trim();
  const link = String(resetLink || '').trim();

  const subject = 'Redefinição de senha • Love Odonto';
  const text = [
    `Olá, ${safeName}.`,
    '',
    'Recebemos uma solicitação para redefinir sua senha de acesso.',
    '',
    'Clique no link abaixo para criar uma nova senha:',
    link,
    '',
    'Caso não tenha solicitado, ignore este e-mail.',
    '',
    'Love Odonto',
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:560px;margin:0 auto;padding:24px;">
  <p>Olá, <strong>${escapeHtml(safeName)}</strong>.</p>
  <p>Recebemos uma solicitação para redefinir sua senha de acesso.</p>
  <p>Clique no botão abaixo.</p>
  <p style="margin:28px 0;">
    <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 24px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Criar nova senha</a>
  </p>
  <p style="font-size:14px;color:#6b7280;">Caso não tenha solicitado, ignore este e-mail.</p>
  <p style="margin-top:32px;color:#374151;">Love Odonto</p>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
