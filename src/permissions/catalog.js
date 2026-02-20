/**
 * Catálogo de permissões (módulos + ações).
 * Base editável: módulos do app e ações (view, create, edit, delete, export, approve).
 */

export const ACTION_KEYS = ['view', 'create', 'edit', 'delete', 'export', 'approve'];

export const ACTION_LABELS = {
  view: 'Ver',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
  export: 'Exportar',
  approve: 'Aprovar',
};

/** Módulos do app com submódulos opcionais e ações aplicáveis */
export const MODULES_SPEC = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'patients', label: 'Pacientes (cadastro, prontuário)', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  {
    key: 'prontuario',
    label: 'Prontuário',
    children: [
      { key: 'prontuario_atendimento', label: 'Atendimento / Evolução Clínica', actions: ['view', 'create', 'edit'] },
      { key: 'prontuario_planejamento', label: 'Planejamento', actions: ['view', 'create', 'edit'] },
      { key: 'prontuario_procedimentos', label: 'Procedimentos a Realizar', actions: ['view', 'create', 'edit'] },
      { key: 'prontuario_orcamentos', label: 'Orçamentos', actions: ['view', 'create', 'edit', 'approve'] },
      { key: 'prontuario_contratos', label: 'Contratos', actions: ['view', 'create', 'edit', 'approve'] },
      { key: 'prontuario_documentos', label: 'Documentos', actions: ['view', 'create', 'edit', 'delete', 'export'] },
      { key: 'prontuario_dados_clinicos', label: 'Dados Clínicos', actions: ['view', 'create', 'edit'] },
    ],
  },
  { key: 'agenda', label: 'Agenda / Calendário', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'pipeline_crm', label: 'Pipeline / CRM Clínico (Leads, tags, funil)', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { key: 'comercial', label: 'Comercial (captação, follow-up, propostas)', actions: ['view', 'create', 'edit', 'export'] },
  {
    key: 'financeiro',
    label: 'Financeiro',
    children: [
      { key: 'financeiro_contas_receber', label: 'Contas a receber', actions: ['view', 'create', 'edit', 'export'] },
      { key: 'financeiro_contas_pagar', label: 'Contas a pagar', actions: ['view', 'create', 'edit', 'export'] },
      { key: 'financeiro_caixa', label: 'Caixa / Conciliação', actions: ['view', 'create', 'edit'] },
      { key: 'financeiro_relatorios', label: 'Relatórios', actions: ['view', 'export'] },
    ],
  },
  { key: 'estoque', label: 'Estoque / Materiais', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { key: 'equipe', label: 'Equipe / Colaboradores', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'configuracoes', label: 'Configurações', actions: ['view', 'edit'] },
  { key: 'relatorios', label: 'Relatórios / Exportações', actions: ['view', 'export'] },
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
  const add = (moduleKey, moduleLabel, actionKey) => {
    const id = permissionId(moduleKey, actionKey);
    const desc = `${ACTION_LABELS[actionKey]}: ${moduleLabel}`;
    out.push({
      id,
      module_key: moduleKey,
      module_label: moduleLabel,
      action_key: actionKey,
      description: desc,
    });
  };

  for (const mod of MODULES_SPEC) {
    if (mod.children) {
      for (const child of mod.children) {
        for (const action of child.actions) {
          add(child.key, child.label, action);
        }
      }
    } else {
      for (const action of mod.actions) {
        add(mod.key, mod.label, action);
      }
    }
  }
  return out;
}

/** Retorna todos os module_key únicos (incluindo filhos) para agrupamento */
export function getModuleKeysForGrouping() {
  const keys = [];
  for (const mod of MODULES_SPEC) {
    if (mod.children) {
      keys.push({ key: mod.key, label: mod.label, children: mod.children.map((c) => ({ key: c.key, label: c.label })) });
    } else {
      keys.push({ key: mod.key, label: mod.label, children: [] });
    }
  }
  return keys;
}
