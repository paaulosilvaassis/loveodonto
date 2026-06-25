function normalizeText(value) {
  return String(value || '').trim();
}

export function getEmailConfig() {
  const provider = normalizeText(process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  const apiKey = normalizeText(process.env.EMAIL_API_KEY);
  const fromName = normalizeText(process.env.EMAIL_FROM_NAME) || 'Love Odonto';
  const fromAddress = normalizeText(process.env.EMAIL_FROM_ADDRESS);
  return {
    provider,
    apiKey,
    fromName,
    fromAddress,
    isConfigured: Boolean(apiKey && fromAddress),
  };
}

export function getInviteRedirectTo() {
  const explicit = normalizeText(process.env.APP_INVITE_REDIRECT_TO);
  if (explicit) return explicit;
  const appUrl = normalizeText(process.env.APP_URL)
    || (process.env.NODE_ENV === 'production' ? 'https://loveodonto.com.br' : 'http://localhost:5176');
  return `${appUrl.replace(/\/+$/, '')}/primeiro-acesso`;
}

export function getPasswordResetRedirectTo() {
  const explicit = normalizeText(process.env.APP_PASSWORD_RESET_REDIRECT_TO);
  if (explicit) return explicit;
  const appUrl = normalizeText(process.env.APP_URL)
    || (process.env.NODE_ENV === 'production' ? 'https://loveodonto.com.br' : 'http://localhost:5176');
  return `${appUrl.replace(/\/+$/, '')}/redefinir-senha`;
}
