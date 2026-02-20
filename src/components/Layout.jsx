import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, LogOut, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePlatformAuth } from '../auth/PlatformAuthContext.jsx';
import { useClinicSummary } from '../hooks/useClinicSummary.js';
import { navCategories, getActiveCategory, getActiveItem } from '../navigation/navCategories.js';
import { logAction } from '../services/logService.js';
import PatientQuickCreateModal from './PatientQuickCreateModal.jsx';
import appLogo from '../assets/love-odonto-logo.png';

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
  if (user.role === 'admin' || user.role === 'master' || user.role === 'gerente') return true;
  return allowedRoles.includes(user.role);
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { platformUser } = usePlatformAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const clinicSummary = useClinicSummary();
  
  // Estado da categoria ativa (restaurado do localStorage ou detectado pela rota)
  const [activeCategoryId, setActiveCategoryId] = useState(() => {
    const saved = readLocal(ACTIVE_CATEGORY_KEY, null);
    return saved || getActiveCategory(location.pathname);
  });
  
  // Estado da sidebar (recolhida ou expandida)
  const [isCollapsed, setIsCollapsed] = useState(() => readLocal(SIDEBAR_COLLAPSED_KEY, false));
  
  // Estado do modal de pesquisa rápida
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);

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
    return activeCategory.items.filter((item) => isAllowed(user, item.rolesAllowed));
  }, [activeCategory, user]);

  return (
    <div className={`layout ${isCollapsed ? 'layout-collapsed' : ''}`}>
      <aside className={`sidebar ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        {/* Brand/Logo */}
        <div className="brand">
          <img
            src={clinicSummary?.logoUrl || appLogo}
            alt={clinicSummary?.logoUrl ? 'Logo da clínica' : 'Logo do app LOVE ODONTO'}
            className="brand-logo"
          />
          <strong>{clinicSummary?.nomeClinica || 'LOVE ODONTO'}</strong>
          <span>{clinicSummary?.nomeFantasia || 'Sistema de gestão'}</span>
        </div>

        {/* BASES PRINCIPAIS - ÍCONES HORIZONTAIS NO TOPO */}
        <div className="nav-bases-row">
          {navCategories.map((category) => {
            const CategoryIcon = category.icon;
            const isActive = category.id === activeCategoryId;
            const hasAccess = category.items.some((item) => isAllowed(user, item.rolesAllowed));

            if (!hasAccess) return null;

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
        <header className="topbar">
          <div>
            <div className="topbar-title">
              <button className="button secondary back-button" type="button" onClick={() => navigate(-1)}>
                <ArrowLeft size={16} /> Voltar
              </button>
            </div>
            <div className="topbar-subtitle">{user?.name} · {user?.role}</div>
          </div>
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
        </header>
        <main className="page">{children}</main>
      </div>

      {/* Modal de Pesquisa Rápida */}
      <PatientQuickCreateModal
        isOpen={isQuickCreateOpen}
        onClose={() => setIsQuickCreateOpen(false)}
      />
    </div>
  );
}
