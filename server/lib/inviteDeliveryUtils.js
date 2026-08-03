/**
 * Phase 4.10 Wave 3E — utilitário de entrega de convite (identity/provisionamento).
 */

export function isInviteEmailDelivered(delivery) {
  return ['supabase_auth', 'backend_resend'].includes(delivery?.emailDelivery);
}
