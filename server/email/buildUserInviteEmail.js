const PROFILE_ROLE_LABELS = {
  owner: 'Proprietário',
  admin: 'Administrador',
  master: 'Master',
  dentista: 'Dentista',
  atendimento: 'Atendimento',
  financeiro: 'Financeiro',
  marketing: 'Marketing',
};

export function resolveProfileRoleLabel(role) {
  const key = String(role || '').trim().toLowerCase();
  return PROFILE_ROLE_LABELS[key] || key || 'Colaborador';
}

export function buildUserInviteEmail({
  userName,
  clinicName,
  profileRole,
  setupLink,
  appUrl,
}) {
  const safeName = String(userName || 'Colaborador').trim();
  const safeClinic = String(clinicName || 'Love Odonto').trim();
  const roleLabel = resolveProfileRoleLabel(profileRole);
  const link = String(setupLink || '').trim();
  const homeUrl = String(appUrl || 'https://loveodonto.com.br').trim();

  const subject = `Convite de acesso — ${safeClinic}`;
  const text = [
    `Olá, ${safeName}!`,
    '',
    `Você foi convidado(a) para acessar o Love Odonto na clínica ${safeClinic} com o perfil ${roleLabel}.`,
    '',
    'Para definir sua senha e entrar no sistema, acesse o link abaixo:',
    link,
    '',
    'Se o link não abrir, copie e cole no navegador. O convite expira em 7 dias.',
    '',
    homeUrl,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937;">
  <p>Olá, <strong>${escapeHtml(safeName)}</strong>!</p>
  <p>Você foi convidado(a) para acessar o <strong>Love Odonto</strong> na clínica <strong>${escapeHtml(safeClinic)}</strong> com o perfil <strong>${escapeHtml(roleLabel)}</strong>.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;">Definir senha e acessar</a></p>
  <p style="font-size:14px;color:#6b7280;">Se o botão não funcionar, copie este link:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
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
