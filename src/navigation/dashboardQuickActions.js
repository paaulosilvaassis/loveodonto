/**
 * Atalhos do Dashboard. Rotas alinhadas à sidebar/routePermissionMap (SSOT).
 * Odontograma reusa /pacientes/busca e exige também prontuario_atendimento:view.
 */
export const DASHBOARD_QUICK_ACTIONS = [
  { id: 'pacientes', title: 'Pacientes', route: '/pacientes/busca' },
  { id: 'agenda', title: 'Agenda', route: '/gestao/agenda' },
  {
    id: 'odontograma',
    title: 'Odontograma',
    route: '/pacientes/busca',
    permission: 'prontuario_atendimento:view',
  },
  { id: 'orcamentos', title: 'Orçamentos', route: '/orcamentos' },
  { id: 'financeiro', title: 'Financeiro', route: '/financeiro/contas-receber' },
  { id: 'relatorios', title: 'Relatórios', route: '/financeiro/relatorios' },
];
