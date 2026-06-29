import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/useAuth.js';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';
import { useTenant } from '../tenant/useTenant.js';
import { useClinicSummary } from '../hooks/useClinicSummary.js';
import { useClinicLogo } from '../hooks/useClinicLogo.js';
import { navCategories, getActiveCategory, getActiveItem } from '../navigation/navCategories.js';
import { resolveRoutePermission } from '../navigation/routePermissionMap.js';
import { canAccessRoute } from '../tenant/tenantAccess.js';
import { can as canByPermission } from '../permissions/permissions.js';
import { isPrivilegedUser, isRoutePermissionAllowed } from '../utils/rbacHelpers.js';
import { logAction } from '../services/logService.js';
import PatientQuickCreateModal from './PatientQuickCreateModal.jsx';
import OpeningScreen, { shouldShowOpening } from './OpeningScreen.jsx';
import { ImportJobProvider } from '../context/ImportJobContext.jsx';
import ImportProgressFooter from './ImportProgressFooter.jsx';
import { SYSTEM_BRAND_LOGO } from '../utils/systemBrand.js';

const ACTIVE_CATEGORY_KEY = 'appgestaoodonto.nav.activeCategory';
const SIDEBAR_COLLAPSED_KEY = 'appgestaoodonto.nav.sidebarCollapsed';

const readLocal = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocal = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const isAllowed = (user, allowedRoles) => {
  if (!user) return false;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  if (allowedRoles.includes('*')) return true;
  if (user.role === 'master' || user.role === 'admin' || user.role === 'owner') return true;
  return allowedRoles.includes(user.role);
};

const canSeeNavItem = (user, item, modules, flags) => {
  if (!user) return { allowed: false, roleAllowed: false, moduleAllowed: false, permissionAllowed: false };
  const roleAllowed = isAllowed(user, item.rolesAllowed);
  const moduleAllowed = canAccessRoute(item.route, modules, flags);
  const permission = resolveRoutePermission(item.route);
  const permissionAllowed = isRoutePermissionAllowed(user, permission, canByPermission);
  const isMaster = isPrivilegedUser(user);
  const allowed = isMaster
    ? moduleAllowed
    : moduleAllowed && permissionAllowed;
  return { allowed, roleAllowed, moduleAllowed, permissionAllowed };
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { platformUser } = usePlatformAuth();
  const tenant = useTenant();
  const navigate = useNavigate();
  const location = useLocation();
  const isClinicalFocusMode = location.pathname.startsWith('/atendimento-clinico/')
    && !location.pathname.endsWith('/central');
  const clinicSummary = useClinicSummary();
  const { clinicLogo, hasLogo: clinicHasLogo } = useClinicLogo();

  // Estado da categoria ativa (restaurado do localStorage ou detectado pela rota)
  const [activeCategoryId, setActiveCategoryId] = useState(() => {
    const saved = readLocal(ACTIVE_CATEGORY_KEY, null);
    return saved || getActiveCategory(location.pathname);
  });
  
  // Estado da sidebar (recolhida ou expandida)
  const [isCollapsed, setIsCollapsed] = useState(() => readLocal(SIDEBAR_COLLAPSED_KEY, false));
  
  // Estado do modal de pesquisa rápida
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

  // Tela de abertura do app (uma vez por sessão, 30 variações por dia do mês)
  const [showOpening, setShowOpening] = useState(() => shouldShowOpening());

  // Toast global (usado pelo rodapé de importação)
  const [globalToast, setGlobalToast] = useState(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState('');
  const globalToastRef = useRef(null);
  const onImportToast = useCallback((message, type = 'success') => {
    if (globalToastRef.current) clearTimeout(globalToastRef.current);
    setGlobalToast({ message, type });
    globalToastRef.current = setTimeout(() => setGlobalToast(null), 4000);
  }, []);

  // Atualiza categoria ativa quando a rota muda
  useEffect(() => {
    const detectedCategory = getActiveCategory(location.pathname);
    if (detectedCategory !== activeCategoryId) {
      setActiveCategoryId(detectedCategory);
      writeLocal(ACTIVE_CATEGORY_KEY, detectedCategory);
    }
  }, [location.pathname, activeCategoryId]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCategoryClick = (categoryId) => {
    const category = navCategories.find((cat) => cat.id === categoryId);
    if (!category) return;

    setActiveCategoryId(categoryId);
    writeLocal(ACTIVE_CATEGORY_KEY, categoryId);

    // Verifica se a rota atual pertence à nova categoria
    const activeItem = getActiveItem(location.pathname, categoryId);
    if (!activeItem) {
      // Redireciona para a rota padrão da categoria
      navigate(category.defaultRoute);
    }

    logAction('navigation:category_click', { categoryId, categoryLabel: category.label });
  };

  const handleToggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    writeLocal(SIDEBAR_COLLAPSED_KEY, newState);
  };

  const activeCategory = navCategories.find((cat) => cat.id === activeCategoryId) || navCategories[0];

  // Filtra itens permitidos para o usuário atual
  const visibleItems = useMemo(() => {
    return activeCategory.items.filter((item) => canSeeNavItem(user, item, tenant.modules, tenant.flags).allowed);
  }, [activeCategory, user, tenant.modules, tenant.flags]);

  const visibleCategories = useMemo(() => {
    return navCategories.filter((category) => {
      const allowedItems = category.items.filter((item) => canSeeNavItem(user, item, tenant.modules, tenant.flags).allowed);
      return allowedItems.length > 0;
    });
  }, [user, tenant.modules, tenant.flags]);

  useEffect(() => {
    if (!visibleCategories.length) return;
    if (!visibleCategories.some((c) => c.id === activeCategoryId)) {
      const nextCategoryId = visibleCategories[0].id;
      setActiveCategoryId(nextCategoryId);
      writeLocal(ACTIVE_CATEGORY_KEY, nextCategoryId);
    }
  }, [visibleCategories, activeCategoryId, user, location.pathname]);

  useEffect(() => {
    const msg = String(location.state?.accessDeniedMessage || '').trim();
    if (!msg) return;
    setAccessDeniedMessage(msg);
    navigate(location.pathname, { replace: true, state: {} });
    const timer = setTimeout(() => setAccessDeniedMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [location.pathname, location.state, navigate]);

  return (
    <ImportJobProvider onToast={onImportToast}>
      <div className={`layout ${isCollapsed ? 'layout-collapsed' : ''}`}>
        <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Brand/Logo - container com fundo claro para destaque na sidebar escura */}
        <div className="brand">
          <div className="brand-logo-wrap">
            <img
              src={clinicLogo}
              alt={clinicHasLogo ? `Logo ${clinicSummary?.nomeClinica || tenant.clinicProfile?.name || 'da clínica'}` : 'Logo do app LOVE ODONTO'}
              className="brand-logo"
            />
          </div>
          <div className="brand-text">
            <strong>{clinicSummary?.nomeClinica || tenant.clinicProfile?.name || (tenant.loading ? 'Carregando…' : 'LOVE ODONTO')}</strong>
          </div>
        </div>

        {/* BASES PRINCIPAIS - ÍCONES HORIZONTAIS NO TOPO */}
        <div className="nav-bases-row">
          {visibleCategories.map((category) => {
            const CategoryIcon = category.icon;
            const isActive = category.id === activeCategoryId;

            return (
              <button
                key={category.id}
                type="button"
                className={`nav-base-icon ${isActive ? 'active' : ''}`}
                onClick={() => handleCategoryClick(category.id)}
                title={category.label}
                aria-label={category.label}
              >
                <CategoryIcon size={22} />
              </button>
            );
          })}
        </div>

        {/* CONTEÚDO DINÂMICO - Só aparece quando expandida */}
        {!isCollapsed && (
          <>
            {/* Título da Base Ativa */}
            <div className="nav-base-title">
              <h2>{activeCategory.label}</h2>
            </div>

            {/* Submenus da Base Ativa */}
            <nav className="nav-submenus">
              {visibleItems.length === 0 ? (
                <div className="menu-state">Nenhum item disponível</div>
              ) : (
                visibleItems.map((item) => {
                  const ItemIcon = item.icon;
                  const cleanRoute = item.route.trim();
                  const isItemActive = 
                    location.pathname === cleanRoute || 
                    location.pathname.startsWith(cleanRoute);

                  return (
                    <NavLink
                      key={item.id}
                      to={cleanRoute}
                      className={`nav-submenu-item ${isItemActive ? 'active' : ''} ${item.label.startsWith('  →') ? 'nav-submenu-item-nested' : ''}`}
                      onClick={() => {
                        logAction('navigation:submenu_click', {
                          categoryId: activeCategoryId,
                          itemId: item.id,
                          route: cleanRoute,
                        });
                      }}
                    >
                      {ItemIcon && <ItemIcon size={18} />}
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })
              )}
            </nav>
          </>
        )}

        {/* Botão de Recolher/Expandir - Na borda da sidebar */}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={handleToggleCollapse}
          aria-label={isCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {/* Link Plataforma (só para quem tem sessão platform) */}
        {!isCollapsed && platformUser && (
          <NavLink to="/platform/dashboard" className="sidebar-platform-link">
            <span>Plataforma</span>
          </NavLink>
        )}
        {/* Botão Sair */}
        {!isCollapsed && (
          <button
            type="button"
            className="sidebar-logout"
            onClick={handleLogout}
            aria-label="Sair"
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        )}
      </aside>

      <div className="content">
        {tenant.loading ? (
          <div className="alert" style={{ margin: '1rem 1rem 0' }}>
            Carregando permissões da clínica...
          </div>
        ) : null}
        {!tenant.loading && tenant.error ? (
          <div className="alert error" style={{ margin: '1rem 1rem 0' }}>
            Falha ao carregar contexto da clínica: {tenant.error}
          </div>
        ) : null}
        {!tenant.loading && !tenant.error && accessDeniedMessage ? (
          <div className="alert warning" style={{ margin: '1rem 1rem 0' }}>
            {accessDeniedMessage}
          </div>
        ) : null}
        {!isClinicalFocusMode ? (
        <header className="header">
          <div className="header-left">
            <button className="button secondary back-button" type="button" onClick={() => navigate(-1)}>
              <ArrowLeft size={16} /> Voltar
            </button>
            <button
              type="button"
              className="topbar-quick-create-button"
              onClick={() => setIsQuickCreateOpen(true)}
              title="Cadastrar/Pesquisar Paciente"
              aria-label="Cadastrar/Pesquisar Paciente"
            >
              <UserPlus size={20} />
              <span>Paciente +</span>
            </button>
          </div>
          <div className="header-center">
            {/* Campo de pesquisa global pode ser inserido aqui */}
          </div>
          <div className="header-right">
            <div className="brand-container">
              <div className="logo-wrapper">
                <img
                  src={SYSTEM_BRAND_LOGO}
                  alt="LoveOdonto"
                  className="header-logo"
                />
              </div>
            </div>
          </div>
        </header>
        ) : null}
        <main className={`page${isClinicalFocusMode ? ' page--clinical-focus' : ''}`}>{children}</main>
        {tenant?.tenant?.billing_status === 'overdue' ? (
          <div className="alert warning" style={{ margin: '0 1rem 1rem' }}>
            Atenção: existem pendências financeiras nesta clínica. Alguns recursos podem ser limitados.
          </div>
        ) : null}
      </div>

      {/* Modal de Pesquisa Rápida */}
      <PatientQuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
      />

        {/* Rodapé fixo de progresso da importação */}
        <ImportProgressFooter />

        {/* Toast global (importação concluída etc.) */}
        {globalToast && (
          <div className={`toast toast-global ${globalToast.type}`} role="status">
            {globalToast.message}
          </div>
        )}

        {/* Tela de abertura (uma vez por sessão) */}
        {showOpening && (
          <OpeningScreen onDismiss={() => setShowOpening(false)} />
        )}
      </div>
    </ImportJobProvider>
  );
}
