import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';
import { LayoutDashboard, Building2, CreditCard, FileText, Settings, Users, LogOut } from 'lucide-react';

const allItems = [
  { route: '/platform/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
  { route: '/platform/tenants', label: 'Clínicas', icon: Building2, need: 'canViewTenants' },
  { route: '/platform/plans', label: 'Planos', icon: CreditCard, need: 'canManagePlans' },
  { route: '/platform/billing', label: 'Cobrança', icon: FileText, need: 'canManageBilling' },
  { route: '/platform/providers', label: 'Provedores', icon: Settings, need: 'canManageProviders' },
  { route: '/platform/team', label: 'Equipe', icon: Users, need: 'canManageTeam' },
];

export default function PlatformLayout() {
  const { platformUser, logout, canViewTenants, canManagePlans, canManageBilling, canManageProviders, canManageTeam } = usePlatformAuth();
  const navigate = useNavigate();
  const items = allItems.filter((it) => {
    if (it.show) return true;
    if (it.need === 'canViewTenants') return canViewTenants;
    if (it.need === 'canManagePlans') return canManagePlans;
    if (it.need === 'canManageBilling') return canManageBilling;
    if (it.need === 'canManageProviders') return canManageProviders;
    if (it.need === 'canManageTeam') return canManageTeam;
    return false;
  });
  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="h-14 flex items-center justify-between px-4">
          <h1 className="font-semibold text-white">Plataforma</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">{platformUser?.email}</span>
            <span className="bg-slate-700 rounded px-2 py-0.5 text-xs text-slate-300">{platformUser?.role}</span>
            <button type="button" onClick={() => logout().then(() => navigate('/platform/login'))} className="p-2 rounded text-slate-400 hover:bg-slate-800 hover:text-white" title="Sair"><LogOut size={18} /></button>
          </div>
        </div>
        <nav className="flex gap-1 px-4 border-t border-slate-800/50">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink key={it.route} to={it.route} className={({ isActive }) => 'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px ' + (isActive ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200')}>
                <Icon size={16} />{it.label}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6"><Outlet /></main>
    </div>
  );
}
