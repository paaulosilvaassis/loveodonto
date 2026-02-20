/**
 * Permissões padrão por perfil (role). Usado no seed de role_permissions.
 * permissionId = perm-{module_key}-{action_key}
 */

import { permissionId } from './catalog.js';

function p(mod, action) {
  return permissionId(mod, action);
}

/** Lista de permission_id por role (exceto admin, que tem acesso total por código) */
export const ROLE_DEFAULT_PERMISSIONS = {
  administrativo: [
    p('dashboard', 'view'),
    p('patients', 'view'), p('patients', 'create'), p('patients', 'edit'),
    p('agenda', 'view'), p('agenda', 'create'), p('agenda', 'edit'),
    p('prontuario_documentos', 'view'), p('prontuario_documentos', 'export'),
  ],
  comercial: [
    p('dashboard', 'view'),
    p('pipeline_crm', 'view'), p('pipeline_crm', 'create'), p('pipeline_crm', 'edit'),
    p('patients', 'view'),
    p('prontuario_orcamentos', 'view'), p('prontuario_orcamentos', 'create'),
    p('comercial', 'view'), p('comercial', 'create'), p('comercial', 'edit'), p('comercial', 'export'),
  ],
  financeiro: [
    p('dashboard', 'view'),
    p('financeiro_contas_receber', 'view'), p('financeiro_contas_receber', 'create'), p('financeiro_contas_receber', 'edit'), p('financeiro_contas_receber', 'export'),
    p('financeiro_contas_pagar', 'view'), p('financeiro_contas_pagar', 'create'), p('financeiro_contas_pagar', 'edit'), p('financeiro_contas_pagar', 'export'),
    p('financeiro_caixa', 'view'), p('financeiro_caixa', 'create'), p('financeiro_caixa', 'edit'),
    p('financeiro_relatorios', 'view'), p('financeiro_relatorios', 'export'),
    p('prontuario_contratos', 'view'),
  ],
  atendimento: [
    p('dashboard', 'view'),
    p('agenda', 'view'), p('agenda', 'create'), p('agenda', 'edit'), p('agenda', 'delete'),
    p('patients', 'view'), p('patients', 'edit'),
    p('prontuario_atendimento', 'view'), p('prontuario_atendimento', 'create'), p('prontuario_atendimento', 'edit'),
    p('prontuario_documentos', 'view'),
  ],
  dentista: [
    p('dashboard', 'view'),
    p('patients', 'view'),
    p('agenda', 'view'),
    p('prontuario_atendimento', 'view'), p('prontuario_atendimento', 'create'), p('prontuario_atendimento', 'edit'),
    p('prontuario_planejamento', 'view'), p('prontuario_planejamento', 'create'), p('prontuario_planejamento', 'edit'),
    p('prontuario_procedimentos', 'view'), p('prontuario_procedimentos', 'create'), p('prontuario_procedimentos', 'edit'),
    p('prontuario_orcamentos', 'view'),
    p('prontuario_documentos', 'view'),
    p('prontuario_dados_clinicos', 'view'), p('prontuario_dados_clinicos', 'create'), p('prontuario_dados_clinicos', 'edit'),
  ],
};

export const ROLES_FOR_SEED = ['administrativo', 'comercial', 'financeiro', 'atendimento', 'dentista', 'gerente', 'recepcao', 'profissional'];

ROLE_DEFAULT_PERMISSIONS.recepcao = ROLE_DEFAULT_PERMISSIONS.atendimento;
ROLE_DEFAULT_PERMISSIONS.profissional = ROLE_DEFAULT_PERMISSIONS.dentista;
ROLE_DEFAULT_PERMISSIONS.gerente = ROLE_DEFAULT_PERMISSIONS.administrativo;
