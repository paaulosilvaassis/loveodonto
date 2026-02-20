import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { masterNavItems } from './masterConfig.js';
import { ArrowLeft } from 'lucide-react';

const isAllowed = (user, allowedRoles) => {
  if (!user) return false;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return allowedRoles.includes(user.role);
};

export default function MasterShellLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const visibleItems = masterNavItems.filter((item) => isAllowed(user, item.rolesAllowed));
  const isMaster = user?.role === 'master' || user?.role === 'admin';

  const isActive = (item) => location.pathname === item.route || (item.route !== '/master' && location.pathname.startsWith(item.route));

  if (!isMaster) {
    return (
      <div className="stack" style={{ padding: '2rem', textAlign: 'center' }}>
        <p className="error">Acesso negado. Apenas o administrador (MASTER) pode acessar o Painel Master.</p>
        <button type="button" className="button secondary" onClick={() => navigate('/gestao/dashboard')}>
          Voltar ao sistema
        </button>
      </div>
    );
  }

  return (
    <div className="master-shell">
      <header className="master-shell-header">
        <div className="master-shell-header-content">
          <button type="button" className="master-shell-back" onClick={() => navigate('/gestao/dashboard')} title="Voltar ao sistema">
            <ArrowLeft size={20} />
          </button>
          <h1 className="master-shell-title">Painel Master</h1>
          <p className="master-shell-subtitle">Governança, cobrança e métricas da plataforma</p>
        </div>
        <nav className="master-shell-tabs" aria-label="Menu do Painel Master">
          <div className="master-shell-tabs-inner">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.id}
                  to={item.route}
                  className={`master-shell-tab ${isActive(item) ? 'active' : ''}`}
                >
                  {Icon && <Icon size={18} aria-hidden />}
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>
      </header>
      <main className="master-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
