/**
 * Mensagens de UI para erros de writers. Sem stack, sem IDs internos.
 */
import {
  CANCEL_NOT_ALLOWED,
  CEREMONY_NOT_ABORTABLE,
  CONTRACT_NOT_SIGNABLE,
  LIFECYCLE_ACTOR_REQUIRED,
  LIFECYCLE_REASON_REQUIRED,
  LIFECYCLE_TENANT_MISMATCH,
  PILOT_IMMUTABLE,
  REISSUE_NOT_ALLOWED,
  RESEND_NOT_ALLOWED,
  ROTATE_NOT_ALLOWED,
  ROTATION_RACE,
  SIGNATURE_REQUEST_NOT_SIGNABLE,
  SIGNED_CONTRACT_IMMUTABLE,
  SIGNING_ACCESS_BINDING_INVALID,
  SIGN_LINK_NOT_SIGNABLE,
  VOID_NOT_ALLOWED,
} from './constants.js';

const MESSAGES = Object.freeze({
  [CONTRACT_NOT_SIGNABLE]: 'Este contrato não está disponível para assinatura.',
  [SIGNED_CONTRACT_IMMUTABLE]: 'Contratos assinados não podem ser alterados neste fluxo.',
  [LIFECYCLE_REASON_REQUIRED]: 'Informe o motivo jurídico para continuar.',
  [LIFECYCLE_ACTOR_REQUIRED]: 'É necessário estar autenticado para esta ação.',
  [LIFECYCLE_TENANT_MISMATCH]: 'Esta ação não está disponível para o seu acesso.',
  [SIGNING_ACCESS_BINDING_INVALID]: 'O acesso de assinatura não corresponde a este contrato.',
  [SIGN_LINK_NOT_SIGNABLE]: 'Este acesso não pode ser reenviado. Gere um novo acesso se estiver autorizado.',
  [SIGNATURE_REQUEST_NOT_SIGNABLE]: 'A solicitação de assinatura não está mais assinável.',
  [ROTATION_RACE]: 'Já existe um acesso ativo. Atualize a página antes de gerar outro.',
  [ROTATE_NOT_ALLOWED]: 'Você não tem permissão para substituir o acesso de assinatura.',
  [RESEND_NOT_ALLOWED]: 'Você não tem permissão para reenviar o acesso de assinatura.',
  [VOID_NOT_ALLOWED]: 'Somente admin ou master podem invalidar um contrato assinado.',
  [REISSUE_NOT_ALLOWED]: 'Somente admin ou master podem reemitir este contrato.',
  [CANCEL_NOT_ALLOWED]: 'Você não tem permissão para cancelar este contrato.',
  [CEREMONY_NOT_ABORTABLE]: 'Esta cerimônia não pode ser cancelada neste estado.',
  [PILOT_IMMUTABLE]: 'Contrato histórico de piloto não pode ser alterado.',
  LIFECYCLE_ACTION_FORBIDDEN: 'Você não tem permissão para esta ação jurídica.',
  MULTIPLE_ACTIVE_SIGN_LINKS: 'Já existe um acesso ativo. Atualize a página antes de gerar outro.',
  SIGNING_ACCESS_NOT_ROTATABLE: 'Este acesso não pode ser substituído neste estado.',
  SIGNING_ACCESS_NOT_RESENDABLE: 'Este acesso não pode ser reenviado. Gere um novo acesso se estiver autorizado.',
});

export function mapLifecycleUiError(err) {
  if (!err) return 'Não foi possível concluir a ação.';
  const code = err.code || err.failureCode;
  if (code && MESSAGES[code]) return MESSAGES[code];
  const raw = String(err.message || '').trim();
  if (!raw) return 'Não foi possível concluir a ação.';
  if (/stack|tenant_id|gctr-|csreq-|clnk-|csgn-/i.test(raw)) {
    return 'Não foi possível concluir a ação. Tente novamente ou fale com o administrador.';
  }
  return raw;
}
