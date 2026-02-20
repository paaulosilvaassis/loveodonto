import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { crmShellNavItems } from '../crmShellConfig.js';

const isAllowed = (user, allowedRoles) => {
  if (!user) return false;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (allowedRoles.includes('*')) return true;
  if (user.role === 'admin' || user.role === 'master' || user.role === 'gerente') return true;
  return allowedRoles.includes(user.role);
};

/**
 * Layout do CRM Clínico (/crm).
 * Menu interno em tabs no topo (abaixo do título). Conteúdo em largura total.
 */
export default function CrmShellLayout() {
  const { user } = useAuth();
  const location = useLocation();

  const visibleItems = crmShellNavItems.filter((item) =>
    isAllowed(user, item.rolesAllowed)
  );

  const isActive = (item) =>
    location.pathname === item.route ||
    (item.route !== '/crm' && location.pathname.startsWith(item.route));

  return (
    <div className="crm-shell">
      <header className="crm-shell-header">
        <div className="crm-shell-header-content">
          <h1 className="crm-shell-title">CRM Clínico</h1>
          <p className="crm-shell-subtitle">
            Captação, pipeline, comunicação e conversão de leads.
          </p>
        </div>
        {visibleItems.length > 0 && (
          <nav className="crm-shell-tabs" aria-label="Menu interno do CRM">
            <div className="crm-shell-tabs-inner">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.route}
                    className={`crm-shell-tab ${isActive(item) ? 'active' : ''}`}
                  >
                    {Icon && <Icon size={18} aria-hidden />}
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      <main className="crm-shell-main">
        <Outlet />
      </main>
    </div>
  );
}
