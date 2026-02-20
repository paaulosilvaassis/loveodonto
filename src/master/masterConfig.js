import { LayoutDashboard, Building2, CreditCard, BarChart3, Settings, FileText } from 'lucide-react';

export const masterNavItems = [
  { id: 'dashboard', label: 'Dashboard', route: '/master', icon: LayoutDashboard, rolesAllowed: ['master', 'admin'] },
  { id: 'tenants', label: 'Clínicas', route: '/master/tenants', icon: Building2, rolesAllowed: ['master', 'admin'] },
  { id: 'plans', label: 'Planos', route: '/master/plans', icon: CreditCard, rolesAllowed: ['master', 'admin'] },
  { id: 'billing', label: 'Cobrança', route: '/master/billing', icon: FileText, rolesAllowed: ['master', 'admin'] },
  { id: 'metrics', label: 'Métricas', route: '/master/metrics', icon: BarChart3, rolesAllowed: ['master', 'admin'] },
  { id: 'ops', label: 'Operações', route: '/master/ops', icon: Settings, rolesAllowed: ['master', 'admin'] },
];
