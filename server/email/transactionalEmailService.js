/**
 * Fachada transacional da aplicação (assinatura, notificações futuras).
 * Auth (convite/senha) NÃO passa por aqui.
 */
export { sendTransactionalEmail, SmtpTransportError } from './emailProvider.js';
