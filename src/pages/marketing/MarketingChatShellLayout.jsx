import { useEffect } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth.js';
import { startMarketingAutomationRuntime, stopMarketingAutomationRuntime } from '../../services/marketingChatService.js';

const TABS = [
  { id: 'overview', label: 'Visão geral', route: '/marketing/chat-inteligente/dashboard', roles: ['admin', 'gerente', 'comercial', 'recepcao', 'atendimento', 'financeiro', 'profissional', 'dentista'] },
  { id: 'connect-whatsapp', label: 'Conectar WhatsApp', route: '/marketing/chat-inteligente/conectar-whatsapp', roles: ['admin', 'gerente', 'comercial', 'recepcao', 'atendimento'] },
  { id: 'inbox', label: 'Inbox', route: '/marketing/chat-inteligente/inbox', roles: ['admin', 'gerente', 'comercial', 'recepcao', 'atendimento'] },
  { id: 'automations', label: 'Automações', route: '/marketing/chat-inteligente/automacoes', roles: ['admin', 'gerente', 'comercial', 'recepcao', 'atendimento'] },
  { id: 'attendance', label: 'Atendimento', route: '/marketing/chat-inteligente/gestao-atendimento', roles: ['admin', 'gerente', 'comercial', 'recepcao', 'atendimento'] },
  { id: 'integrations', label: 'Integrações', route: '/marketing/chat-inteligente/integracoes', roles: ['admin', 'gerente', 'comercial'] },
  { id: 'reports', label: 'Relatórios', route: '/marketing/chat-inteligente/relatorios', roles: ['admin', 'gerente', 'comercial', 'recepcao', 'atendimento', 'financeiro', 'profissional', 'dentista'] },
];

function isRoleAllowed(role, roles) {
  if (!role) return false;
  if (!roles || roles.length === 0) return true;
  if (role === 'admin' || role === 'master' || role === 'gerente') return true;
  return roles.includes(role);
}

export default function MarketingChatShellLayout() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (!user) return undefined;
    const stop = startMarketingAutomationRuntime(user);
    return () => {
      if (typeof stop === 'function') stop();
      stopMarketingAutomationRuntime(user);
    };
  }, [user]);

  const visibleTabs = TABS.filter((item) => isRoleAllowed(user?.role, item.roles));
  const activeTab = visibleTabs.find((item) => location.pathname === item.route);

  if (!activeTab && visibleTabs.length > 0) {
    return <Navigate to={visibleTabs[0].route} replace />;
  }

  return (
    <div className="marketing-chat-shell">
      <header className="marketing-chat-shell-header">
        <div className="marketing-chat-shell-header__main">
          <div className="marketing-chat-shell-eyebrow">Marketing {'>'} Chat Inteligente</div>
          <h1 className="marketing-chat-shell-title">Marketing • Chat Inteligente</h1>
          <p className="marketing-chat-shell-subtitle">
            Central omnichannel com atendimento, campanhas, automacoes e analise de performance.
          </p>
        </div>
        <div className="marketing-chat-shell-badges">
          <span className="marketing-chat-shell-badge">Tenant seguro</span>
          <span className="marketing-chat-shell-badge marketing-chat-shell-badge--muted">LoveOdonto native</span>
        </div>
      </header>

      <section className="fat-section">
        <nav className="marketing-chat-shell-tabs" aria-label="Navegacao interna do Chat Inteligente">
          <div className="marketing-chat-shell-tabs__inner">
            {visibleTabs.map((item) => (
              <NavLink
                key={item.id}
                to={item.route}
                className={({ isActive }) => `marketing-chat-shell-tab${isActive ? ' marketing-chat-shell-tab--active' : ''}`}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </section>

      <main className="marketing-chat-shell-content">
        <Outlet />
      </main>
    </div>
  );
}
