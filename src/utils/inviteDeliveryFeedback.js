export function notifyInviteDeliveryResult(delivery, { onCopyLink, pushToast }) {
  const setupLink = delivery?.setupLink || delivery?.setup_link || null;
  const emailDelivery = delivery?.emailDelivery || delivery?.email_delivery || null;

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
      'Este e-mail já existe no Auth. O link de acesso foi copiado — envie manualmente ao colaborador.',
    );
    return;
  }

  pushToast('success', 'Convite processado.');
}
