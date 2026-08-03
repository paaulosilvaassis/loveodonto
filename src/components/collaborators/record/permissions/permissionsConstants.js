export const COLUMN_ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];

export const ACTION_HINTS = {
  view: 'Visualizar registros',
  create: 'Cadastrar novos registros',
  edit: 'Alterar registros',
  delete: 'Excluir registros',
  export: 'Exportar relatórios',
  send: 'Disparar mensagens',
  cancel: 'Cancelar ações',
  move_stage: 'Mover etapas',
  approve: 'Aprovar registros',
  configure: 'Configurar integração',
  connect: 'Conectar serviço',
  disconnect: 'Desconectar serviço',
  resend: 'Reenviar convite',
  deactivate: 'Desativar registro',
  import: 'Importar dados',
  open: 'Abrir caixa',
  close: 'Fechar caixa',
  launch: 'Lançar movimento',
  reverse: 'Estornar movimento',
  issue: 'Emitir cobrança',
  conclude: 'Concluir procedimento',
  sign: 'Assinar documento',
  confirm: 'Confirmar agendamento',
  finish: 'Finalizar atendimento',
  download: 'Baixar arquivo',
  create_ticket: 'Abrir chamado',
  update_template: 'Editar modelo',
  generate: 'Gerar contrato',
  print: 'Imprimir documento',
  export_pdf: 'Exportar PDF',
  view_audit: 'Ver auditoria',
  edit_system_clause: 'Editar cláusula padrão',
};

export const PERMS_CLIPBOARD_PREFIX = 'love-odonto-perms:v1:';

export function checkboxTriState(selected, total) {
  if (!total || selected === 0) return { checked: false, indeterminate: false };
  if (selected === total) return { checked: true, indeterminate: false };
  return { checked: false, indeterminate: true };
}

export function progressVariant(selected, total) {
  if (!total || selected === 0) return 'empty';
  if (selected >= total) return 'complete';
  return 'partial';
}
