/**
 * RBAC do pacote jurídico — usa exclusivamente `can()` existente.
 * Recepção: view / generate / send / PDF. Sem edição locked, delete, signed manual ou evidência.
 */

import { can } from '../permissions/permissions.js';

function roleOf(user) {
  return String(user?.role || '').toLowerCase();
}

function isPrivileged(user) {
  const role = roleOf(user);
  return Boolean(
    user?.isMaster
    || role === 'admin'
    || role === 'master'
    || role === 'owner',
  );
}

export function isReceptionRole(user) {
  const role = roleOf(user);
  return role === 'recepcao' || role === 'atendimento';
}

export function resolveLegalPackagePermissions(user) {
  if (!user) {
    return {
      canView: false,
      canGenerate: false,
      canSend: false,
      canResend: false,
      canEditDraft: false,
      canSignNow: false,
      canDownloadPdf: false,
      canViewEvidence: false,
      canCancel: false,
      isReception: false,
    };
  }

  const privileged = isPrivileged(user);
  const reception = isReceptionRole(user);
  const canView = privileged
    || can(user, 'prontuario_contratos:view')
    || can(user, 'admin_contratos:view');
  const canGenerate = privileged
    || can(user, 'admin_contratos:generate')
    || can(user, 'prontuario_contratos:create');
  const canSend = privileged
    || can(user, 'prontuario_contratos:send')
    || can(user, 'admin_contratos:generate');
  const canEditDraft = !reception && (
    privileged
    || can(user, 'prontuario_contratos:edit')
    || can(user, 'admin_contratos:edit')
  );
  const canSignNow = !reception && (
    privileged
    || can(user, 'prontuario_contratos:sign')
    || can(user, 'admin_contratos:sign')
  );
  const canDownloadPdf = privileged
    || canView
    || can(user, 'admin_contratos:export_pdf')
    || can(user, 'admin_contratos:print');
  const canViewEvidence = !reception && (
    privileged
    || can(user, 'admin_contratos:view_audit')
    || can(user, 'contracts:download_evidence')
    || can(user, 'contracts:view_evidence')
  );
  const canCancel = !reception && (
    privileged
    || can(user, 'admin_contratos:cancel')
  );

  return {
    canView,
    canGenerate,
    canSend,
    canResend: canSend,
    canEditDraft,
    canSignNow,
    canDownloadPdf,
    canViewEvidence,
    canCancel,
    isReception: reception,
  };
}

/**
 * Ações disponíveis — SSOT para Atendimento, Orçamento e Prontuário.
 */
export function deriveLegalPackageAvailableActions({
  packageStatus,
  documents = [],
  user,
  locked = false,
} = {}) {
  const perms = resolveLegalPackagePermissions(user);
  const actions = [];
  if (!perms.canView) return actions;

  const requiredPending = documents.filter((d) => d.required && !d.signed && d.status !== 'cancelled');
  const hasContract = documents.some((d) => (
    d.documentType === 'SERVICE_CONTRACT' || d.operationalType === 'CONTRACT_SERVICES'
  ) && d.status !== 'not_started');

  if (packageStatus === 'not_started' && perms.canGenerate) {
    actions.push({ key: 'generate', label: 'Gerar pacote' });
  }
  if (packageStatus === 'preparing') {
    if (!hasContract && perms.canGenerate) {
      actions.push({ key: 'generate', label: 'Gerar pacote' });
    } else if (perms.canView) {
      actions.push({ key: 'review', label: 'Revisar documentos' });
    }
    if (hasContract && requiredPending.length === 0 && perms.canSend && !locked) {
      actions.push({ key: 'send', label: 'Enviar para assinatura' });
    }
  }
  if (packageStatus === 'awaiting_signature' || packageStatus === 'partially_signed') {
    if (perms.canResend) {
      actions.push({ key: 'resend', label: 'Enviar para assinatura' });
    }
    if (perms.canSignNow) {
      actions.push({ key: 'sign_now', label: 'Assinar agora' });
    }
  }
  if (hasContract && perms.canView) {
    actions.push({ key: 'view', label: 'Visualizar' });
  }
  if (hasContract && perms.canDownloadPdf) {
    actions.push({ key: 'download_pdf', label: 'Baixar PDF' });
  }
  if (perms.canViewEvidence && (packageStatus === 'completed' || packageStatus === 'partially_signed' || packageStatus === 'awaiting_signature')) {
    actions.push({ key: 'evidence', label: 'Ver evidências' });
  }

  const seen = new Set();
  return actions.filter((a) => {
    if (seen.has(a.key)) return false;
    seen.add(a.key);
    return true;
  });
}

export function deriveLegalDocumentAction({
  document,
  user,
} = {}) {
  const perms = resolveLegalPackagePermissions(user);
  if (!document || !perms.canView) return null;
  if (document.locked || document.signed) {
    if (perms.canDownloadPdf) return { key: 'download_pdf', label: 'Baixar PDF' };
    return { key: 'view', label: 'Visualizar' };
  }
  if (document.status === 'not_started' && document.required && perms.canGenerate) {
    return { key: 'generate', label: 'Gerar pacote' };
  }
  if (document.status === 'ready' && perms.canSend) {
    return { key: 'send', label: 'Enviar para assinatura' };
  }
  if (document.status === 'draft' && perms.canView) {
    return { key: 'review', label: 'Revisar documentos' };
  }
  return { key: 'view', label: 'Visualizar' };
}
