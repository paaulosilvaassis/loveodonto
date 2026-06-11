import {
  LayoutDashboard,
  Clock,
  CheckCircle2,
  FileText,
  ScrollText,
  PenLine,
  Settings,
} from 'lucide-react';

export const contractsShellNavItems = [
  { id: 'dashboard', label: 'Dashboard', route: '/gestao/contratos', icon: LayoutDashboard, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'pendentes', label: 'Pendentes', route: '/gestao/contratos/pendentes', icon: Clock, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'assinados', label: 'Assinados', route: '/gestao/contratos/assinados', icon: CheckCircle2, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'modelos', label: 'Modelos', route: '/gestao/contratos/modelos', icon: FileText, rolesAllowed: ['admin', 'gerente'] },
  { id: 'termos', label: 'Termos', route: '/gestao/contratos/termos', icon: ScrollText, rolesAllowed: ['admin', 'gerente'] },
  { id: 'assinaturas', label: 'Assinaturas', route: '/gestao/contratos/assinaturas', icon: PenLine, rolesAllowed: ['admin', 'gerente', 'recepcao'] },
  { id: 'config', label: 'Configurações', route: '/gestao/contratos/configuracoes', icon: Settings, rolesAllowed: ['admin', 'gerente'] },
];
