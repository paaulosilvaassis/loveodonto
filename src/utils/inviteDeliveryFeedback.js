export function notifyInviteDeliveryResult(delivery, { onCopyLink, pushToast, serverMessage } = {}) {
  const setupLink = delivery?.setupLink || delivery?.setup_link || null;
  const emailDelivery = delivery?.emailDelivery || delivery?.email_delivery || null;

  if (serverMessage) {
    pushToast('success', serverMessage);
    if (setupLink) onCopyLink?.(setupLink);
    return;
  }

  if (emailDelivery === 'supabase_auth' || emailDelivery === 'backend_resend') {
    pushToast(
      'success',
      'Convite enviado por e-mail. Verifique a caixa de entrada e a pasta de spam/lixo eletrônico.',
    );
    return;
  }

  if (setupLink) {
    onCopyLink?.(setupLink);
    pushToast(
      'success',
      'Link de acesso gerado. Se o e-mail não chegar, copie o link e envie manualmente ao colaborador.',
    );
    return;
  }

  pushToast('success', 'Acesso processado. Se o e-mail não chegar, use Reenviar convite.');
}
