export function resolveRoutePermission(routePath) {
  const path = String(routePath || '').trim();
  if (!path) return null;

  if (path === '/gestao/dashboard') return 'dashboard:view';
  if (path === '/suporte') return 'dashboard:view';
  if (path.startsWith('/pacientes')) return 'patients:view';
  if (path.startsWith('/prontuario')) return 'prontuario_atendimento:view';
  if (path.startsWith('/gestao/agenda')) return 'agenda:view';
  if (path.startsWith('/gestao-atendimento')) return 'agenda:view';
  if (path.startsWith('/gestao/convenios')) return 'agenda:view';
  if (path.startsWith('/gestao-comercial/fluxo-do-paciente')) return 'agenda:view';
  if (path.startsWith('/gestao-comercial/jornada-do-paciente')) return 'pipeline_crm:view';
  if (path.startsWith('/crm')) return 'pipeline_crm:view';
  if (path.startsWith('/comercial')) return 'comercial:view';
  if (path.startsWith('/financeiro')) return 'financeiro_relatorios:view';
  if (path.startsWith('/estoque')) return 'estoque:view';
  if (path.startsWith('/admin/colaboradores')) return 'equipe:view';
  if (path.startsWith('/admin/contratos') || path.startsWith('/admin/consentimentos')) {
    return 'admin_contratos:view';
  }
  if (path.startsWith('/admin') || path.startsWith('/configuracoes')) return 'configuracoes:view';
  if (path.startsWith('/relatorios')) return 'relatorios:view';

  return null;
}
