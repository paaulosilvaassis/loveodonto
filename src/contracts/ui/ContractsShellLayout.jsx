import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.js';
import { contractsShellNavItems } from '../contractsShellConfig.js';

const isAllowed = (user, allowedRoles) => {
  if (!user) return false;
  if (!allowedRoles?.length) return true;
  if (['admin', 'master', 'gerente'].includes(user.role)) return true;
  return allowedRoles.includes(user.role);
};

export default function ContractsShellLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const visibleItems = contractsShellNavItems.filter((item) => isAllowed(user, item.rolesAllowed));

  const isActive = (item) => {
    if (item.route === '/gestao/contratos') {
      return location.pathname === '/gestao/contratos';
    }
    return location.pathname.startsWith(item.route);
  };

  return (
    <div className="ctr-shell">
      <header className="ctr-shell-header">
        <div className="ctr-shell-header-content">
          <h1 className="ctr-shell-title">Contratos &amp; Consentimentos</h1>
          <p className="ctr-shell-subtitle">
            Geração automática a partir de orçamentos, assinatura digital, histórico e evidências jurídicas.
          </p>
        </div>
        {visibleItems.length > 0 && (
          <nav className="ctr-shell-tabs" aria-label="Menu Contratos">
            <div className="ctr-shell-tabs-inner">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.route}
                    end={item.route === '/gestao/contratos'}
                    className={`ctr-shell-tab ${isActive(item) ? 'active' : ''}`}
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
      <main className="ctr-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
