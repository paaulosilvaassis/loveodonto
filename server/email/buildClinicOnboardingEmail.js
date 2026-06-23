import {
  USABILITY_TERMS_TITLE,
  USABILITY_TERMS_VERSION,
  getUsabilityTermsPlainText,
} from '../contracts/usabilityTerms.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildClinicOnboardingEmail({
  userName,
  clinicName,
  planLabel,
  setupLink,
  acceptTermsLink,
  appUrl,
  includeSetupLink = true,
}) {
  const safeName = String(userName || 'Responsável').trim();
  const safeClinic = String(clinicName || 'Love Odonto').trim();
  const safePlan = String(planLabel || '—').trim();
  const setup = String(setupLink || '').trim();
  const accept = String(acceptTermsLink || '').trim();
  const homeUrl = String(appUrl || 'https://loveodonto.com.br').trim();
  const termsText = getUsabilityTermsPlainText();
  const showSetupLink = includeSetupLink && Boolean(setup);

  const subject = showSetupLink
    ? `Primeiro acesso — ${safeClinic} | Love Odonto`
    : `Contrato de usabilidade — ${safeClinic} | Love Odonto`;

  const textLines = [
    `Olá, ${safeName}!`,
    '',
    `A clínica ${safeClinic} foi provisionada na Love Odonto com o plano ${safePlan}.`,
    '',
  ];

  if (showSetupLink) {
    textLines.push(
      '1) Defina sua senha de acesso:',
      setup,
      '',
      '2) Leia e aceite o contrato de usabilidade do sistema:',
      accept,
    );
  } else {
    textLines.push(
      'Você receberá (ou já recebeu) um e-mail separado para definir sua senha de acesso.',
      '',
      'Leia e aceite o contrato de usabilidade do sistema:',
      accept,
    );
  }

  textLines.push(
    '',
    USABILITY_TERMS_TITLE,
    termsText,
    '',
    `Versão dos termos: ${USABILITY_TERMS_VERSION}`,
    '',
    homeUrl,
  );

  const text = textLines.join('\n');

  const setupHtml = showSetupLink
    ? `<p><strong>Passo 1 — Primeiro acesso</strong><br>Defina sua senha para entrar no sistema:</p>
  <p><a href="${escapeHtml(setup)}" style="display:inline-block;padding:12px 20px;background:#0f766e;color:#fff;text-decoration:none;border-radius:8px;">Definir senha e acessar</a></p>
  <p><strong>Passo 2 — Contrato de usabilidade</strong><br>Leia e aceite o contrato para concluir a ativação:</p>`
    : `<p><strong>Contrato de usabilidade</strong><br>Leia e aceite o contrato para concluir a ativação:</p>`;

  const fallbackLinksHtml = showSetupLink
    ? `Senha: <a href="${escapeHtml(setup)}">${escapeHtml(setup)}</a><br>
  Contrato: <a href="${escapeHtml(accept)}">${escapeHtml(accept)}</a>`
    : `Contrato: <a href="${escapeHtml(accept)}">${escapeHtml(accept)}</a>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:640px;">
  <p>Olá, <strong>${escapeHtml(safeName)}</strong>!</p>
  <p>A clínica <strong>${escapeHtml(safeClinic)}</strong> foi provisionada na Love Odonto com o plano <strong>${escapeHtml(safePlan)}</strong>.</p>
  ${setupHtml}
  <p><a href="${escapeHtml(accept)}" style="display:inline-block;padding:12px 20px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:8px;">Ler e aceitar contrato</a></p>
  <div style="margin-top:24px;padding:16px;border:1px solid #fbbf24;background:#fffbeb;border-radius:10px;">
    <p style="margin:0 0 8px;font-weight:700;">${escapeHtml(USABILITY_TERMS_TITLE)}</p>
    <p style="margin:0;font-size:14px;color:#92400e;white-space:pre-line;">${escapeHtml(termsText)}</p>
    <p style="margin:12px 0 0;font-size:12px;color:#78350f;">Versão: ${escapeHtml(USABILITY_TERMS_VERSION)}</p>
  </div>
  <p style="font-size:13px;color:#6b7280;margin-top:24px;">Se os botões não funcionarem, copie os links:<br>
  ${fallbackLinksHtml}</p>
</body>
</html>`;

  return { subject, text, html };
}
