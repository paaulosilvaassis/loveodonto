import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';
import { LayoutDashboard, Building2, CreditCard, FileText, Settings, Users, LogOut } from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
  { id: 'tenants', label: 'Clínicas', route: '/tenants', icon: Building2 },
  { id: 'plans', label: 'Planos', route: '/plans', icon: CreditCard },
  { id: 'billing', label: 'Cobrança', route: '/billing', icon: FileText },
  { id: 'providers', label: 'Provedores', route: '/providers', icon: Settings },
  { id: 'team', label: 'Equipe', route: '/team', icon: Users },
];

export default function ConsoleShellLayout() {
  const { platformUser, logout } = usePlatformAuth();
  const navigate = useNavigate();
  const navClass = (isActive) =>
    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px ' +
    (isActive ? 'text-blue-400 border-blue-500' : 'text-slate-400 border-transparent hover:text-slate-200');

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="flex items-center justify-between px-4 h-14">
          <h1 className="font-semibold text-slate-100">Console</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{platformUser?.email}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{platformUser?.role}</span>
            <button type="button" onClick={() => logout().then(() => navigate('/login'))} className="p-2 text-slate-400 hover:text-slate-200 rounded" title="Sair">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 px-4 border-t border-slate-700/50">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.id} to={item.route} className={({ isActive }) => navClass(isActive)}>
                <Icon size={16} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
