/**
 * Catálogo de permissões (módulos + bases/telas + ações).
 * IDs seguem estáveis no formato perm-{module_key}-{action_key}.
 */

export const ACTION_KEYS = [
  'view',
  'create',
  'edit',
  'delete',
  'approve',
  'export',
  'send',
  'configure',
  'resend',
  'cancel',
  'move_stage',
  'respond',
  'toggle_active',
  'conclude',
  'sign',
  'confirm',
  'finish',
  'deactivate',
  'import',
  'open',
  'close',
  'launch',
  'reverse',
  'issue',
  'connect',
  'disconnect',
  'create_ticket',
  'download',
  'update_template',
  'generate',
  'print',
  'export_pdf',
  'view_audit',
  'edit_system_clause',
];

export const ACTION_LABELS = {
  view: 'Ver',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
  approve: 'Aprovar',
  export: 'Exportar',
  send: 'Enviar',
  configure: 'Configurar',
  resend: 'Reenviar',
  cancel: 'Cancelar',
  move_stage: 'Mover',
  respond: 'Responder',
  toggle_active: 'Ativar/Desativar',
  conclude: 'Concluir',
  sign: 'Assinar',
  confirm: 'Confirmar',
  finish: 'Finalizar',
  deactivate: 'Desativar',
  import: 'Importar',
  open: 'Abrir',
  close: 'Fechar',
  launch: 'Lançar',
  reverse: 'Estornar',
  issue: 'Emitir',
  connect: 'Conectar',
  disconnect: 'Desconectar',
  create_ticket: 'Criar chamado',
  download: 'Baixar',
  update_template: 'Editar modelo',
  generate: 'Gerar contrato',
  print: 'Imprimir',
  export_pdf: 'Exportar PDF',
  view_audit: 'Ver auditoria',
  edit_system_clause: 'Editar cláusula padrão',
  create_envelope: 'Criar envelope',
  manage_signers: 'Gerenciar signatários',
  cancel_envelope: 'Cancelar envelope',
  view_evidence: 'Ver evidências',
  manage_policies: 'Gerenciar políticas',
  reconcile: 'Reconciliar',
  send_invitation: 'Enviar convite',
  resend_invitation: 'Reenviar convite',
  view_delivery: 'Ver entregas',
  revoke_session: 'Revogar sessão',
  view_public_harness: 'Ver harness público',
  runtime_readiness: 'Ver readiness do runtime v2',
  staging_preflight: 'Executar preflight de staging v2',
  view_security_diagnostics: 'Ver diagnósticos de segurança v2',
  generate_pdf: 'Gerar PDF',
  generate_signed_artifacts: 'Gerar artefatos assinados',
  download_evidence: 'Baixar evidências',
  verify_integrity: 'Verificar integridade',
  view_files: 'Ver arquivos',
  manage_attachments: 'Gerenciar anexos',
  complete_signing: 'Concluir assinatura',
  view_ledger: 'Ver ledger',
  verify_ledger: 'Verificar ledger',
  view_signed_effects: 'Ver efeitos assinados',
  reconcile_signed_state: 'Reconciliar estado assinado',
  update_draft: 'Editar rascunho',
  review: 'Revisar',
  publish: 'Publicar',
  archive: 'Arquivar',
  duplicate: 'Duplicar',
  view_history: 'Ver histórico',
  manage_clauses: 'Gerenciar cláusulas',
};

/**
 * group_key/group_label: setor principal da matriz.
 * key/label: base/tela/função.
 */
export const MODULES_SPEC = [
  {
    key: 'comercial',
    label: 'Gestão Comercial',
    children: [
      { key: 'comercial_captacao_leads', label: 'Captação de Leads', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { key: 'pipeline_crm', label: 'Pipeline de Atendimento', actions: ['view', 'create', 'edit', 'move_stage', 'delete'] },
      { key: 'comercial_leads', label: 'Leads', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { key: 'comercial_historico_chats', label: 'Histórico de Chats', actions: ['view', 'export'] },
      { key: 'comercial_mensagens_automaticas', label: 'Mensagens Automáticas', actions: ['view', 'create', 'edit'] },
      { key: 'comercial_campanhas_broadcast', label: 'Campanhas/Broadcast', actions: ['view', 'create', 'send', 'cancel'] },
      { key: 'comercial_relatorios', label: 'Relatórios Comerciais', actions: ['view', 'export'] },
    ],
  },
  {
    key: 'atendimento_prontuario',
    label: 'Atendimento / Prontuário',
    children: [
      { key: 'patients', label: 'Pacientes', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { key: 'prontuario_atendimento', label: 'Prontuário Clínico', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'prontuario_evolucao_clinica', label: 'Evolução Clínica', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'prontuario_odontograma', label: 'Odontograma', actions: ['view', 'create', 'edit'] },
      { key: 'prontuario_planejamento', label: 'Planejamento', actions: ['view', 'create', 'edit', 'approve'] },
      { key: 'prontuario_procedimentos', label: 'Procedimentos a Realizar', actions: ['view', 'create', 'edit', 'conclude'] },
      { key: 'prontuario_orcamentos', label: 'Orçamentos', actions: ['view', 'create', 'edit', 'approve', 'delete'] },
      { key: 'prontuario_guia_clinico', label: 'Guia Clínico do Dentista', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'prontuario_contratos', label: 'Contratos', actions: ['view', 'create', 'edit', 'send', 'sign', 'delete'] },
      { key: 'prontuario_consentimentos', label: 'Consentimentos', actions: ['view', 'create', 'edit', 'send'] },
      { key: 'prontuario_documentos', label: 'Documentos do Paciente', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { key: 'agenda', label: 'Agenda', actions: ['view', 'create', 'edit', 'cancel', 'confirm'] },
      { key: 'atendimento_sala_espera', label: 'Sala de Espera / Check-in', actions: ['view', 'create', 'edit', 'finish'] },
      { key: 'prontuario_dados_clinicos', label: 'Dados Clínicos', actions: ['view', 'create', 'edit'] },
    ],
  },
  {
    key: 'administrativo',
    label: 'Administrativo',
    children: [
      { key: 'admin_dados_clinica', label: 'Dados da Clínica', actions: ['view', 'edit'] },
      { key: 'equipe', label: 'Dados da Equipe', actions: ['view', 'create', 'edit', 'deactivate', 'delete'] },
      { key: 'configuracoes_usuarios_acessos', label: 'Usuários e Acessos', actions: ['view', 'create', 'edit', 'deactivate', 'resend'] },
      { key: 'admin_base_precos_procedimentos', label: 'Base de Preços e Procedimentos', actions: ['view', 'create', 'edit', 'delete', 'import', 'export'] },
      {
        key: 'admin_contratos',
        label: 'Contratos e Consentimentos',
        actions: [
          'view',
          'create',
          'edit',
          'delete',
          'update_template',
          'generate',
          'print',
          'export_pdf',
          'cancel',
          'view_audit',
          'edit_system_clause',
        ],
      },
      {
        key: 'contract_templates',
        label: 'Modelos de Contratos v2',
        actions: [
          'view',
          'create',
          'update_draft',
          'review',
          'publish',
          'archive',
          'duplicate',
          'view_history',
          'manage_clauses',
        ],
      },
      {
        key: 'contracts',
        label: 'Contratos v2 (instâncias)',
        actions: [
          'view',
          'create',
          'update_draft',
          'review',
          'approve',
          'cancel',
          'view_audit',
          'generate_pdf',
          'generate_signed_artifacts',
          'download',
          'download_evidence',
          'verify_integrity',
          'view_files',
          'manage_attachments',
          'complete_signing',
          'view_ledger',
          'verify_ledger',
          'view_signed_effects',
          'reconcile_signed_state',
        ],
      },
      {
        key: 'contract_signatures',
        label: 'Assinaturas v2 (envelopes)',
        actions: [
          'view',
          'create_envelope',
          'manage_signers',
          'send',
          'cancel_envelope',
          'view_evidence',
          'manage_policies',
          'reconcile',
          'send_invitation',
          'resend_invitation',
          'view_delivery',
          'revoke_session',
          'view_public_harness',
          'runtime_readiness',
          'staging_preflight',
          'view_security_diagnostics',
        ],
      },
      { key: 'admin_consentimentos', label: 'Consentimentos', actions: ['view', 'create', 'edit', 'delete'] },
      { key: 'configuracoes', label: 'Configurações (Geral)', actions: ['view', 'edit'] },
    ],
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    children: [
      { key: 'financeiro_contas_receber', label: 'Contas a Receber', actions: ['view', 'create', 'edit', 'download', 'delete', 'export'] },
      { key: 'financeiro_contas_pagar', label: 'Contas a Pagar', actions: ['view', 'create', 'edit', 'download', 'delete', 'export'] },
      { key: 'financeiro_caixa', label: 'Caixa', actions: ['view', 'open', 'close', 'launch', 'reverse'] },
      { key: 'financeiro_boletos', label: 'Boletos/Cobranças', actions: ['view', 'create', 'issue', 'cancel', 'resend'] },
      { key: 'financeiro_financiamentos', label: 'Financiamentos', actions: ['view', 'create', 'edit', 'approve', 'cancel'] },
      { key: 'financeiro_comissoes', label: 'Comissões', actions: ['view', 'create', 'edit', 'approve', 'export'] },
      { key: 'financeiro_dre', label: 'DRE / Central de Análise', actions: ['view', 'export'] },
      { key: 'financeiro_relatorios', label: 'Relatórios Financeiros', actions: ['view', 'export'] },
    ],
  },
  {
    key: 'dashboard_relatorios',
    label: 'Dashboard / Relatórios',
    children: [
      { key: 'dashboard', label: 'Dashboard Geral', actions: ['view'] },
      { key: 'dashboard_indicadores', label: 'Indicadores Principais', actions: ['view'] },
      { key: 'relatorios_gerenciais', label: 'Relatórios Gerenciais', actions: ['view', 'export'] },
      { key: 'relatorios_atendimento', label: 'Relatórios de Atendimento', actions: ['view', 'export'] },
      { key: 'relatorios_comerciais', label: 'Relatórios Comerciais', actions: ['view', 'export'] },
      { key: 'relatorios', label: 'Relatórios Financeiros', actions: ['view', 'export'] },
    ],
  },
  {
    key: 'config_sistema',
    label: 'Configurações / Sistema',
    children: [
      { key: 'sistema_integracoes', label: 'Integrações', actions: ['view', 'configure'] },
      { key: 'sistema_whatsapp', label: 'WhatsApp', actions: ['view', 'configure', 'connect', 'disconnect'] },
      { key: 'sistema_suporte', label: 'Suporte', actions: ['view', 'create_ticket'] },
      { key: 'sistema_logs_auditoria', label: 'Logs/Auditoria', actions: ['view', 'export'] },
      { key: 'sistema_preferencias', label: 'Preferências do Sistema', actions: ['view', 'edit'] },
      { key: 'estoque', label: 'Estoque / Materiais', actions: ['view', 'create', 'edit', 'delete', 'export'] },
    ],
  },
];

/** ID estável para permissão (perm-{module_key}-{action_key}) */
export function permissionId(moduleKey, actionKey) {
  return `perm-${moduleKey}-${actionKey}`;
}

/**
 * Gera lista plana de permissões para o catálogo (id, module_key, module_label, action_key, description).
 * Usa IDs estáveis perm-{module_key}-{action_key} para role_permissions e user_permissions.
 */
export function buildPermissionsCatalog() {
  const out = [];
  const add = (groupKey, groupLabel, moduleKey, moduleLabel, actionKey) => {
    const id = permissionId(moduleKey, actionKey);
    const actionLabel = ACTION_LABELS[actionKey] || actionKey;
    const desc = `${groupLabel} • ${moduleLabel} • ${actionLabel}`;
    out.push({
      id,
      module_key: moduleKey,
      module_label: moduleLabel,
      module_group_key: groupKey,
      module_group_label: groupLabel,
      action_key: actionKey,
      description: desc,
    });
  };

  for (const group of MODULES_SPEC) {
    for (const base of group.children || []) {
      for (const action of base.actions || []) {
        add(group.key, group.label, base.key, base.label, action);
      }
    }
  }
  return out;
}

/** Retorna todos os module_key únicos (incluindo filhos) para agrupamento */
export function getModuleKeysForGrouping() {
  return MODULES_SPEC.map((group) => ({
    key: group.key,
    label: group.label,
    children: (group.children || []).map((child) => ({ key: child.key, label: child.label })),
  }));
}
