import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePlatformAuth } from '../auth/usePlatformAuth.js';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  CreditCard,
  PlugZap,
  Headset,
  AlertTriangle,
  Flag,
  ShieldCheck,
  Settings,
  LogOut,
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
  { id: 'tenants', label: 'Clínicas', route: '/tenants', icon: Building2 },
  { id: 'billing', label: 'Cobranças', route: '/billing', icon: Receipt },
  { id: 'subscriptions', label: 'Assinaturas', route: '/subscriptions', icon: CreditCard },
  { id: 'connectivities', label: 'Conectividades', route: '/connectivities', icon: PlugZap },
  { id: 'support', label: 'Suporte', route: '/support', icon: Headset },
  { id: 'logs-errors', label: 'Logs e Erros', route: '/logs-errors', icon: AlertTriangle },
  { id: 'feature-flags', label: 'Funcionalidades', route: '/feature-flags', icon: Flag },
  { id: 'audit', label: 'Auditoria', route: '/audit', icon: ShieldCheck },
  { id: 'settings', label: 'Configurações', route: '/settings', icon: Settings },
];

export default function ConsoleShellLayout() {
  const { platformUser, logout } = usePlatformAuth();
  const navigate = useNavigate();
  const navClass = (isActive) => `pc-nav-item${isActive ? ' pc-nav-item--active' : ''}`;

  return (
    <div className="pc-layout">
      <aside className="pc-sidebar">
        <div className="pc-sidebar__brand">
          <strong>Platform Console</strong>
          <span>Love Odonto SaaS</span>
        </div>
        <nav className="pc-nav">
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
      </aside>

      <div className="pc-main">
        <header className="pc-topbar">
          <div className="pc-topbar__user">
            <strong>{platformUser?.name || platformUser?.email}</strong>
            <span>{platformUser?.role}</span>
          </div>
          <button type="button" onClick={() => logout().then(() => navigate('/login'))} className="pc-icon-button" title="Sair">
            <LogOut size={16} />
          </button>
        </header>
        <main className="pc-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
