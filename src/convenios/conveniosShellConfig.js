import {
  LayoutDashboard,
  Building2,
  Layers,
  Users,
  ShieldCheck,
  FileText,
  Activity,
  AlertTriangle,
  Receipt,
  Wallet,
  BarChart3,
} from 'lucide-react';

export const conveniosShellNavItems = [
  { id: 'dashboard', label: 'Dashboard', route: '/gestao/convenios', icon: LayoutDashboard, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'operadoras', label: 'Operadoras', route: '/gestao/convenios/operadoras', icon: Building2, rolesAllowed: ['admin', 'gerente'] },
  { id: 'planos', label: 'Planos', route: '/gestao/convenios/planos', icon: Layers, rolesAllowed: ['admin', 'gerente'] },
  { id: 'pacientes', label: 'Pacientes', route: '/gestao/convenios/pacientes', icon: Users, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'autorizacoes', label: 'Autorizações', route: '/gestao/convenios/autorizacoes', icon: ShieldCheck, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'guias', label: 'Guias TISS', route: '/gestao/convenios/guias', icon: FileText, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'producao', label: 'Produção', route: '/gestao/convenios/producao', icon: Activity, rolesAllowed: ['admin', 'gerente'] },
  { id: 'glosas', label: 'Glosas', route: '/gestao/convenios/glosas', icon: AlertTriangle, rolesAllowed: ['admin', 'gerente'] },
  { id: 'faturamento', label: 'Faturamento', route: '/gestao/convenios/faturamento', icon: Receipt, rolesAllowed: ['admin', 'gerente'] },
  { id: 'recebimentos', label: 'Recebimentos', route: '/gestao/convenios/recebimentos', icon: Wallet, rolesAllowed: ['admin', 'gerente'] },
  { id: 'relatorios', label: 'Relatórios', route: '/gestao/convenios/relatorios', icon: BarChart3, rolesAllowed: ['admin', 'gerente'] },
];
