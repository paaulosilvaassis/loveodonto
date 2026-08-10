/**
 * Mensagens profissionais de UX operacional (Phase 10.17).
 * Sempre: o que aconteceu + o que fazer.
 */

export const UX_MESSAGES = {
  BUDGET_INCOMPLETE: {
    title: 'Orçamento incompleto',
    body: 'Faltam informações do orçamento para gerar o contrato. Abra o orçamento, revise procedimentos e condições e tente novamente.',
  },
  CONTRACT_ALREADY_EXISTS: {
    title: 'Contrato já existe',
    body: 'Já existe um contrato para este orçamento. Use Continuar contrato ou Ver contrato — não será criado outro automaticamente.',
  },
  PATIENT_REQUIRED: {
    title: 'Paciente não identificado',
    body: 'Não foi possível identificar o paciente deste orçamento. Abra o cadastro do paciente e vincule o atendimento antes de gerar o contrato.',
  },
  TREATMENT_REQUIRED: {
    title: 'Tratamento não encontrado',
    body: 'O atendimento vinculado a este orçamento não foi encontrado. Abra o atendimento clínico e confirme o orçamento aprovado.',
  },
  FINANCIAL_INCOMPLETE: {
    title: 'Financeiro incompleto',
    body: 'O valor ou as condições de pagamento do orçamento estão incompletos. Revise o financeiro do orçamento e tente novamente.',
  },
  BUDGET_NOT_APPROVED: {
    title: 'Orçamento ainda não aprovado',
    body: 'Só é possível gerar contrato após a aprovação do orçamento pelo paciente. Registre a aprovação e volte aqui.',
  },
  DOCUMENT_REQUIRED_MISSING: {
    title: 'Documento obrigatório pendente',
    body: 'Há documento obrigatório incompleto no pacote. Complete Contrato, TCLE e privacidade antes de enviar para assinatura.',
  },
  SIGNER_WITHOUT_CONTACT: {
    title: 'Signatário sem contato',
    body: 'Um signatário está sem telefone ou e-mail. Atualize o contato do paciente (ou responsável) e tente enviar novamente.',
  },
  LOAD_FAILED: {
    title: 'Não foi possível carregar',
    body: 'Houve uma falha ao carregar os dados. Atualize a página. Se o problema continuar, avise o administrador.',
  },
  LINK_EXPIRED: {
    title: 'Link expirado',
    body: 'Este link de assinatura não é mais válido. Peça à clínica um novo link de assinatura.',
  },
  LINK_INVALID: {
    title: 'Link inválido',
    body: 'Não encontramos esta solicitação de assinatura. Confira o link recebido ou peça um novo à clínica.',
  },
  SIGNATURE_COMPLETED: {
    title: 'Assinatura concluída',
    body: 'Obrigado. Sua assinatura foi registrada com sucesso. A clínica já pode acompanhar o documento assinado.',
  },
  DOCUMENT_UNAVAILABLE: {
    title: 'Documento indisponível',
    body: 'Não foi possível abrir o documento agora. Tente novamente em instantes ou peça ajuda à clínica.',
  },
  PERMISSION_DENIED: {
    title: 'Permissão insuficiente',
    body: 'Sua conta não tem permissão para esta ação. Peça a um administrador a liberação adequada.',
  },
  QUEUE_EMPTY: {
    title: 'Nenhum contrato encontrado',
    body: 'Ajuste a busca ou os filtros, ou gere um contrato a partir de um orçamento aprovado em Central de Orçamentos.',
  },
  WIZARD_STEP_BLOCKED: {
    title: 'Etapa incompleta',
    body: 'Complete as informações obrigatórias desta etapa para avançar.',
  },
  READY_TO_SEND: {
    title: 'Pronto para assinatura',
    body: 'Revise o resumo. Se estiver tudo certo, envie o link de assinatura ao paciente.',
  },
};

export function formatUxMessage(key, extra = '') {
  const msg = UX_MESSAGES[key] || UX_MESSAGES.LOAD_FAILED;
  const suffix = extra ? ` ${extra}` : '';
  return `${msg.title}. ${msg.body}${suffix}`;
}

/** Labels amigáveis para tipos de documento (nunca enums crus). */
export const DOCUMENT_TYPE_LABELS = {
  CONTRACT_SERVICES: 'Contrato',
  TCLE: 'TCLE',
  LGPD: 'Privacidade (LGPD)',
  IMAGE_USE: 'Uso de imagem',
  ANNEX: 'Anexo',
};

export function labelDocumentType(documentType) {
  return DOCUMENT_TYPE_LABELS[documentType] || 'Documento';
}

export function labelSignerRole(role) {
  const map = {
    patient: 'Paciente',
    PATIENT: 'Paciente',
    guardian: 'Responsável legal',
    GUARDIAN: 'Responsável legal',
    clinic: 'Clínica',
    CLINIC: 'Clínica',
    professional: 'Profissional',
    PROFESSIONAL: 'Profissional',
    witness: 'Testemunha',
    WITNESS: 'Testemunha',
  };
  return map[role] || 'Signatário';
}
