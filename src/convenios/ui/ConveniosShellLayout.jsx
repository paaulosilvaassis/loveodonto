import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.js';
import { conveniosShellNavItems } from '../conveniosShellConfig.js';

const isAllowed = (user, allowedRoles) => {
  if (!user) return false;
  if (!allowedRoles?.length) return true;
  if (['admin', 'master', 'gerente'].includes(user.role)) return true;
  return allowedRoles.includes(user.role);
};

export default function ConveniosShellLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const visibleItems = conveniosShellNavItems.filter((item) =>
    isAllowed(user, item.rolesAllowed)
  );

  const isActive = (item) => {
    if (item.route === '/gestao/convenios') {
      return location.pathname === '/gestao/convenios';
    }
    return location.pathname.startsWith(item.route);
  };

  return (
    <div className="conv-shell">
      <header className="conv-shell-header">
        <div className="conv-shell-header-content">
          <h1 className="conv-shell-title">Convênios</h1>
          <p className="conv-shell-subtitle">
            Gestão completa do ciclo convênio — elegibilidade, guias TISS, glosas e rentabilidade.
          </p>
        </div>
        {visibleItems.length > 0 && (
          <nav className="conv-shell-tabs" aria-label="Menu Convênios">
            <div className="conv-shell-tabs-inner">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.route}
                    end={item.route === '/gestao/convenios'}
                    className={`conv-shell-tab ${isActive(item) ? 'active' : ''}`}
                  >
                    {Icon && <Icon size={16} aria-hidden />}
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>
        )}
      </header>
      <main className="conv-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
