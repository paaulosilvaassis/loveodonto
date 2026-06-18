/** Categorias de documentos do módulo Contratos & Consentimentos */
export const CONTRACT_CATEGORIES = {
  SERVICOS: 'servicos',
  CONSENTIMENTO: 'consentimento',
  RISCOS: 'riscos',
  AUTORIZACAO_TRATAMENTO: 'autorizacao_tratamento',
  MENOR_IDADE: 'menor_idade',
  USO_IMAGEM: 'uso_imagem',
  LGPD: 'lgpd',
  GARANTIA: 'garantia',
  DESISTENCIA: 'desistencia',
  POS_OPERATORIO: 'pos_operatorio',
};

export const CONTRACT_CATEGORY_LABELS = {
  [CONTRACT_CATEGORIES.SERVICOS]: 'Contrato de Prestação de Serviços Odontológicos',
  [CONTRACT_CATEGORIES.CONSENTIMENTO]: 'Termo de Consentimento Informado',
  [CONTRACT_CATEGORIES.RISCOS]: 'Termo de Ciência de Riscos',
  [CONTRACT_CATEGORIES.AUTORIZACAO_TRATAMENTO]: 'Termo de Autorização de Tratamento',
  [CONTRACT_CATEGORIES.MENOR_IDADE]: 'Termo de Autorização para Menor de Idade',
  [CONTRACT_CATEGORIES.USO_IMAGEM]: 'Termo de Uso de Imagem',
  [CONTRACT_CATEGORIES.LGPD]: 'Termo LGPD / Tratamento de Dados',
  [CONTRACT_CATEGORIES.GARANTIA]: 'Termo de Garantia e Manutenção',
  [CONTRACT_CATEGORIES.DESISTENCIA]: 'Termo de Desistência / Interrupção',
  [CONTRACT_CATEGORIES.POS_OPERATORIO]: 'Termo de Retorno e Pós-operatório',
};

/** Status do contrato (legado: draft/generated/canceled mapeados na UI) */
export const CONTRACT_STATUS = {
  DRAFT: 'draft',
  GENERATED: 'generated',
  SENT: 'sent',
  VIEWED: 'viewed',
  SIGNED_BY_PATIENT: 'signed_by_patient',
  SIGNED_BY_CLINIC: 'signed_by_clinic',
  COMPLETED: 'completed',
  AWAITING_DATA: 'awaiting_data',
  READY_TO_SEND: 'ready_to_send',
  VIGENTE: 'vigente',
  RESCINDIDO: 'rescindido',
  SIGNED: 'signed',
  REFUSED: 'refused',
  CANCELED: 'canceled',
  EXPIRED: 'expired',
  REPLACED: 'replaced',
};

export const CONTRACT_STATUS_LABELS = {
  [CONTRACT_STATUS.DRAFT]: 'Rascunho',
  [CONTRACT_STATUS.GENERATED]: 'Gerado',
  [CONTRACT_STATUS.SENT]: 'Enviado para assinatura',
  [CONTRACT_STATUS.VIEWED]: 'Visualizado pelo paciente',
  [CONTRACT_STATUS.SIGNED_BY_PATIENT]: 'Assinado pelo paciente',
  [CONTRACT_STATUS.SIGNED_BY_CLINIC]: 'Assinado pela clínica',
  [CONTRACT_STATUS.COMPLETED]: 'Assinado por todos',
  [CONTRACT_STATUS.AWAITING_DATA]: 'Aguardando dados obrigatórios',
  [CONTRACT_STATUS.READY_TO_SEND]: 'Pronto para envio',
  [CONTRACT_STATUS.VIGENTE]: 'Vigente',
  [CONTRACT_STATUS.RESCINDIDO]: 'Rescindido',
  [CONTRACT_STATUS.SIGNED]: 'Assinado',
  [CONTRACT_STATUS.REFUSED]: 'Recusado',
  [CONTRACT_STATUS.CANCELED]: 'Cancelado',
  [CONTRACT_STATUS.EXPIRED]: 'Expirado',
  [CONTRACT_STATUS.REPLACED]: 'Substituído',
};

export const CONTRACT_STATUS_VARIANT = {
  [CONTRACT_STATUS.DRAFT]: 'muted',
  [CONTRACT_STATUS.GENERATED]: 'info',
  [CONTRACT_STATUS.SENT]: 'warning',
  [CONTRACT_STATUS.VIEWED]: 'warning',
  [CONTRACT_STATUS.SIGNED_BY_PATIENT]: 'warning',
  [CONTRACT_STATUS.SIGNED_BY_CLINIC]: 'warning',
  [CONTRACT_STATUS.COMPLETED]: 'success',
  [CONTRACT_STATUS.SIGNED]: 'success',
  [CONTRACT_STATUS.REFUSED]: 'danger',
  [CONTRACT_STATUS.CANCELED]: 'muted',
  [CONTRACT_STATUS.EXPIRED]: 'danger',
  [CONTRACT_STATUS.REPLACED]: 'muted',
};

export const PENDING_STATUSES = [
  CONTRACT_STATUS.DRAFT,
  CONTRACT_STATUS.GENERATED,
  CONTRACT_STATUS.SENT,
  CONTRACT_STATUS.VIEWED,
  CONTRACT_STATUS.SIGNED_BY_PATIENT,
  CONTRACT_STATUS.SIGNED_BY_CLINIC,
];

export const SIGNED_STATUSES = [
  CONTRACT_STATUS.SIGNED,
  CONTRACT_STATUS.COMPLETED,
];

export const SIGNATURE_PROVIDERS = {
  INTERNAL: 'internal',
  CLICKSIGN: 'clicksign',
  DOCUSIGN: 'docusign',
  ZAPSIGN: 'zapsign',
  D4SIGN: 'd4sign',
  ICP_BRASIL: 'icp_brasil',
};

export const SIGNATURE_PROVIDER_LABELS = {
  [SIGNATURE_PROVIDERS.INTERNAL]: 'Love Odonto (link seguro)',
  [SIGNATURE_PROVIDERS.CLICKSIGN]: 'Clicksign',
  [SIGNATURE_PROVIDERS.DOCUSIGN]: 'DocuSign',
  [SIGNATURE_PROVIDERS.ZAPSIGN]: 'ZapSign',
  [SIGNATURE_PROVIDERS.D4SIGN]: 'D4Sign',
  [SIGNATURE_PROVIDERS.ICP_BRASIL]: 'Gov.br / ICP-Brasil',
};

export const LEGAL_SIGNATURE_TYPES = {
  SIMPLE: 'electronic_simple',
  ADVANCED: 'electronic_advanced',
  QUALIFIED: 'icp_qualified',
};

export const LEGAL_SIGNATURE_TYPE_LABELS = {
  [LEGAL_SIGNATURE_TYPES.SIMPLE]: 'Assinatura eletrônica simples',
  [LEGAL_SIGNATURE_TYPES.ADVANCED]: 'Assinatura eletrônica avançada',
  [LEGAL_SIGNATURE_TYPES.QUALIFIED]: 'Assinatura qualificada ICP-Brasil',
};

export const SIGNATURE_WEBHOOK_EVENTS = {
  DOCUMENT_SENT: 'document_sent',
  DOCUMENT_VIEWED: 'document_viewed',
  DOCUMENT_SIGNED: 'document_signed',
  DOCUMENT_COMPLETED: 'document_completed',
  DOCUMENT_EXPIRED: 'document_expired',
  DOCUMENT_REFUSED: 'document_refused',
  DOCUMENT_CANCELLED: 'document_cancelled',
};

export const SIGN_LINK_EXPIRY_OPTIONS = [7, 15, 30];

export const SIGNATURE_TYPES = {
  ON_SCREEN: 'on_screen',
  LINK: 'link',
  UPLOAD: 'upload',
  EXTERNAL: 'external',
};

export const SIGNER_ROLES = {
  PATIENT: 'patient',
  GUARDIAN: 'guardian',
  CLINIC: 'clinic',
  WITNESS: 'witness',
  PROFESSIONAL: 'professional',
};

/** Tipos de tratamento com modelos padrão */
export const TREATMENT_TYPES = {
  IMPLANTE_UNITARIO: 'implante_unitario',
  PROTOCOLO_TOTAL: 'protocolo_total',
  PROTESE_IMPLANTE: 'protese_implante',
  PROTESE_REMOVIVEL: 'protese_removivel',
  PROTESE_FLEXIVEL: 'protese_flexivel',
  PONTE_FIXA: 'ponte_fixa',
  ORTODONTIA: 'ortodontia',
  LENTE_RESINA: 'lente_resina',
  LENTE_PORCELANA: 'lente_porcelana',
  CLAREAMENTO: 'clareamento',
  RESTAURACAO: 'restauracao',
  ENDODONTIA: 'endodontia',
  EXTRACAO: 'extracao',
  CIRURGIA: 'cirurgia',
  PERIODONTIA: 'periodontia',
  HARMONIZACAO: 'harmonizacao',
};

export const TREATMENT_TYPE_LABELS = {
  [TREATMENT_TYPES.IMPLANTE_UNITARIO]: 'Implante unitário',
  [TREATMENT_TYPES.PROTOCOLO_TOTAL]: 'Protocolo total',
  [TREATMENT_TYPES.PROTESE_IMPLANTE]: 'Prótese sobre implante',
  [TREATMENT_TYPES.PROTESE_REMOVIVEL]: 'Prótese removível',
  [TREATMENT_TYPES.PROTESE_FLEXIVEL]: 'Prótese flexível',
  [TREATMENT_TYPES.PONTE_FIXA]: 'Ponte fixa',
  [TREATMENT_TYPES.ORTODONTIA]: 'Ortodontia',
  [TREATMENT_TYPES.LENTE_RESINA]: 'Lente de contato em resina',
  [TREATMENT_TYPES.LENTE_PORCELANA]: 'Lente de contato em porcelana',
  [TREATMENT_TYPES.CLAREAMENTO]: 'Clareamento',
  [TREATMENT_TYPES.RESTAURACAO]: 'Restauração',
  [TREATMENT_TYPES.ENDODONTIA]: 'Canal / Endodontia',
  [TREATMENT_TYPES.EXTRACAO]: 'Extração',
  [TREATMENT_TYPES.CIRURGIA]: 'Cirurgia',
  [TREATMENT_TYPES.PERIODONTIA]: 'Periodontia',
  [TREATMENT_TYPES.HARMONIZACAO]: 'Harmonização',
};

export const DEFAULT_CONTRACT_SETTINGS = {
  contractRequiredBeforeTreatment: false,
  lgpdRequired: true,
  imageUseRequired: false,
  guardianSignatureForMinors: true,
  signLinkExpiryDays: 7,
  allowEditBeforeSign: true,
  requireWitness: false,
  requireResponsibleProfessional: true,
  pendingAlertDays: 5,
  signatureProvider: 'internal',
  defaultSignatureType: 'electronic_simple',
  requireCpfForSignature: true,
  requireEmailForSignature: true,
  requireSmsToken: false,
  requireSelfie: false,
  requireIcpCertificate: false,
  clinicNotificationEmail: '',
  technicalResponsibleEmail: '',
  highValueRequireAdvancedSignature: true,
  highValueThreshold: 10000,
  financingRequireAdvancedSignature: true,
};
