import {
  LayoutDashboard,
  Settings,
  Wallet,
  ShoppingCart,
  Megaphone,
  BarChart3,
  Users,
  User,
  FileSignature,
  UserCog,
  Landmark,
  Receipt,
  FileText,
  TrendingUp,
  Handshake,
  ClipboardList,
  ClipboardCheck,
  MessageCircle,
  Sparkles,
  BellRing,
  Smartphone,
  Headset,
  KanbanSquare,
  Tag,
  BadgeDollarSign,
  Calendar,
  UserPlus,
  CalendarClock,
  CalendarHeart,
  Send,
  CalendarCheck,
  CalendarRange,
  CalendarDays,
  Bot,
  Activity,
  Inbox,
  Zap,
} from 'lucide-react';

/**
 * Estrutura de navegação por categorias principais
 * Cada categoria tem ícones no topo e submenus dinâmicos abaixo
 * 
 * IMPORTANTE: Todos os itens do menu antigo (menuConfig.js) foram restaurados aqui
 */
export const navCategories = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    defaultRoute: '/gestao/dashboard',
    items: [
      {
        id: 'dashboard-overview',
        label: 'Dashboard',
        icon: LayoutDashboard,
        route: '/gestao/dashboard',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional', 'financeiro', 'comercial'],
      },
    ],
  },
  {
    id: 'comercial',
    label: 'Gestão Comercial',
    icon: ShoppingCart,
    defaultRoute: '/crm',
    items: [
      {
        id: 'crm-captacao',
        label: 'Captação de Leads',
        icon: Inbox,
        route: '/crm/captacao',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'],
      },
      {
        id: 'crm-pipeline',
        label: 'Pipeline de Atendimento',
        icon: KanbanSquare,
        route: '/crm/pipeline',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'],
      },
      {
        id: 'crm-leads',
        label: 'Leads (lista)',
        icon: ClipboardList,
        route: '/crm/leads',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'],
      },
      {
        id: 'crm-comunicacao',
        label: 'Comunicação (WhatsApp)',
        icon: MessageCircle,
        route: '/crm/comunicacao',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'],
      },
      {
        id: 'comercial-follow-up',
        label: 'Follow-up',
        icon: Calendar,
        route: '/comercial/follow-up',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'],
      },
      {
        id: 'crm-relatorios',
        label: 'Relatórios & Métricas',
        icon: BarChart3,
        route: '/crm/relatorios',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'],
      },
      {
        id: 'crm-configuracoes',
        label: 'Configurações',
        icon: Settings,
        route: '/crm/configuracoes',
        rolesAllowed: ['admin', 'gerente'],
      },
      {
        id: 'jornada-paciente',
        label: 'Jornada do Paciente',
        icon: Activity,
        route: '/gestao-comercial/jornada-do-paciente',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'],
      },
    ],
  },
  {
    id: 'gestao-atendimento',
    label: 'Gestão de Atendimento',
    icon: ClipboardCheck,
    defaultRoute: '/gestao-atendimento',
    items: [
      {
        id: 'gestao-atendimento-home',
        label: 'Gestão de Atendimento',
        icon: ClipboardCheck,
        route: '/gestao-atendimento',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'],
      },
      {
        id: 'cadastro-paciente-completo',
        label: 'Cadastro de Paciente',
        icon: ClipboardList,
        route: '/pacientes/busca',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'],
      },
      {
        id: 'agenda',
        label: 'Agenda da Clínica',
        icon: Calendar,
        route: '/gestao/agenda',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'],
      },
      {
        id: 'fluxo-paciente',
        label: 'Fluxo do Paciente',
        icon: CalendarCheck,
        route: '/gestao-comercial/fluxo-do-paciente',
        rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'],
      },
      {
        id: 'convenios',
        label: 'Convênios',
        icon: Handshake,
        route: '/gestao/convenios',
        rolesAllowed: ['admin', 'gerente', 'recepcao'],
      },
    ],
  },
  {
    id: 'administrativo',
    label: 'Administrativo',
    icon: Settings,
    defaultRoute: '/admin/dados-clinica',
    items: [
      {
        id: 'dados-clinica',
        label: 'Dados da Clínica',
        icon: Settings,
        route: '/admin/dados-clinica',
        rolesAllowed: ['admin', 'gerente'],
      },
      {
        id: 'colaboradores',
        label: 'Dados da Equipe',
        icon: Users,
        route: '/admin/colaboradores',
        rolesAllowed: ['admin', 'gerente', 'master'],
      },
      {
        id: 'configuracoes-usuarios',
        label: 'Usuários e acessos',
        icon: UserCog,
        route: '/configuracoes/usuarios',
        rolesAllowed: ['admin', 'master'],
      },
      {
        id: 'base-preco-admin',
        label: 'Base de Preço',
        icon: BadgeDollarSign,
        route: '/gestao-comercial/base-de-preco',
        rolesAllowed: ['admin', 'gerente'],
      },
      {
        id: 'procedimentos',
        label: 'Cadastro de Procedimentos',
        icon: ClipboardList,
        route: '/admin/procedimentos',
        rolesAllowed: ['admin', 'gerente'],
      },
      {
        id: 'contratos',
        label: 'Contratos',
        icon: FileSignature,
        route: '/admin/contratos',
        rolesAllowed: ['admin', 'gerente'],
      },
      {
        id: 'consentimentos',
        label: 'Consentimentos',
        icon: UserCog,
        route: '/admin/consentimentos',
        rolesAllowed: ['admin', 'gerente'],
      },
    ],
  },
  {
    id: 'financeiro',
    label: 'Gestão Financeira',
    icon: Wallet,
    defaultRoute: '/financeiro/contas-receber',
    items: [
      {
        id: 'caixa',
        label: 'Caixa',
        icon: Landmark,
        route: '/financeiro/caixa',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
      {
        id: 'contas-pagar',
        label: 'Contas a Pagar',
        icon: Wallet,
        route: '/financeiro/contas-pagar',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
      {
        id: 'contas-receber',
        label: 'Contas a Receber',
        icon: Receipt,
        route: '/financeiro/contas-receber',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
      {
        id: 'boletos',
        label: 'Boletos',
        icon: FileText,
        route: '/financeiro/boletos',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
      {
        id: 'financiamento',
        label: 'Financiamento',
        icon: BadgeDollarSign,
        route: '/financeiro/financiamento',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
      {
        id: 'faturamento',
        label: 'Faturamento',
        icon: TrendingUp,
        route: '/financeiro/faturamento',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
      {
        id: 'comissoes',
        label: 'Comissões',
        icon: BarChart3,
        route: '/financeiro/comissoes',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
      {
        id: 'relatorios-fin',
        label: 'Relatórios Financeiros',
        icon: FileText,
        route: '/financeiro/relatorios',
        rolesAllowed: ['admin', 'gerente', 'financeiro'],
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    defaultRoute: '/comercial/mensagens',
    items: [
      {
        id: 'mensagens',
        label: 'Mensagens Automáticas',
        icon: Sparkles,
        route: '/comercial/mensagens',
        rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'],
      },
      {
        id: 'confirmacao',
        label: 'Confirmação de Agendamento',
        icon: BellRing,
        route: '/comercial/confirmacao',
        rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'],
      },
      {
        id: 'confirmacao-lembrete',
        label: '  → Lembrete',
        icon: CalendarClock,
        route: '/comercial/confirmacao/lembrete',
        rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'],
      },
      {
        id: 'confirmacao-boas-vindas',
        label: '  → Boas-vindas',
        icon: CalendarHeart,
        route: '/comercial/confirmacao/boas-vindas',
        rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'],
      },
      {
        id: 'confirmacao-broadcast',
        label: '  → Broadcast',
        icon: Send,
        route: '/comercial/confirmacao/broadcast',
        rolesAllowed: ['admin', 'gerente', 'comercial'],
      },
      {
        id: 'confirmacao-pos-atendimento',
        label: '  → Mensagens pós-atendimento',
        icon: CalendarCheck,
        route: '/comercial/confirmacao/pos-atendimento',
        rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'],
      },
      {
        id: 'confirmacao-lembrete-confirmacao',
        label: '  → Lembrete de confirmação',
        icon: CalendarRange,
        route: '/comercial/confirmacao/lembrete-confirmacao',
        rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'],
      },
      {
        id: 'confirmacao-semestral',
        label: '  → Semestral',
        icon: CalendarDays,
        route: '/comercial/confirmacao/semestral',
        rolesAllowed: ['admin', 'gerente', 'comercial'],
      },
      {
        id: 'confirmacao-anual',
        label: '  → Anual',
        icon: CalendarDays,
        route: '/comercial/confirmacao/anual',
        rolesAllowed: ['admin', 'gerente', 'comercial'],
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp (Integrações)',
        icon: Smartphone,
        route: '/comercial/whatsapp',
        rolesAllowed: ['admin', 'gerente', 'comercial'],
      },
      {
        id: 'whatsapp-agenda',
        label: '  → WhatsApp + Agenda',
        icon: Calendar,
        route: '/comercial/whatsapp/agenda',
        rolesAllowed: ['admin', 'gerente', 'comercial'],
      },
      {
        id: 'whatsapp-crm',
        label: '  → WhatsApp + CRM',
        icon: KanbanSquare,
        route: '/comercial/whatsapp/crm',
        rolesAllowed: ['admin', 'gerente', 'comercial'],
      },
      {
        id: 'whatsapp-ia',
        label: '  → Atendimento 24/7 com IA',
        icon: Bot,
        route: '/comercial/whatsapp/ia',
        rolesAllowed: ['admin', 'gerente', 'comercial'],
      },
    ],
  },
];

/**
 * Encontra a categoria ativa baseada na rota atual
 */
export const getActiveCategory = (pathname) => {
  // Verifica se a rota pertence a alguma categoria
  for (const category of navCategories) {
    const belongsToCategory = category.items.some((item) => {
      // Remove espaços e "→" para matching
      const cleanRoute = item.route.trim();
      return pathname === cleanRoute || pathname.startsWith(cleanRoute);
    });
    if (belongsToCategory) {
      return category.id;
    }
  }
  
  // Fallback: detecta por prefixo de rota
  if (pathname.startsWith('/gestao/dashboard')) return 'dashboard';
  if (pathname.startsWith('/gestao-atendimento') || pathname.startsWith('/pacientes') || pathname.startsWith('/gestao/agenda') || pathname.startsWith('/gestao/convenios') || pathname.startsWith('/gestao-comercial/fluxo-do-paciente')) return 'gestao-atendimento';
  if (pathname.startsWith('/crm')) return 'comercial';
  if (pathname.startsWith('/admin')) return 'administrativo';
  if (pathname.startsWith('/financeiro')) return 'financeiro';
  if (pathname.startsWith('/comercial') || pathname.startsWith('/gestao/crm') || pathname.startsWith('/gestao-comercial')) return 'comercial';
  
  // Default
  return 'dashboard';
};

/**
 * Encontra o item ativo dentro de uma categoria
 */
export const getActiveItem = (pathname, categoryId) => {
  const category = navCategories.find((cat) => cat.id === categoryId);
  if (!category) return null;
  
  // Tenta match exato primeiro
  let item = category.items.find((item) => pathname === item.route);
  if (item) return item;
  
  // Depois tenta prefixo (para rotas com parâmetros)
  return category.items.find((item) => {
    const cleanRoute = item.route.trim();
    return pathname.startsWith(cleanRoute);
  });
};

/**
 * Validação: verifica se todos os itens do menu antigo existem no novo
 * Executa apenas em desenvolvimento
 */
if (import.meta.env?.DEV) {
  import('../navigation/menuConfig.js').then(({ menuSections, flattenMenu }) => {
    const oldItems = flattenMenu(menuSections);
    const newItems = navCategories.flatMap((cat) => cat.items);
    
    const oldRoutes = new Set(oldItems.map((item) => item.route));
    const newRoutes = new Set(newItems.map((item) => item.route.trim()));
    
    const missingRoutes = oldItems.filter((item) => !newRoutes.has(item.route));
    
    if (missingRoutes.length > 0) {
      console.error('⚠️ NAVEGAÇÃO: Itens do menu antigo não encontrados no novo:', missingRoutes.map((item) => `${item.label} (${item.route})`));
    } else {
      console.log('✅ NAVEGAÇÃO: Todos os itens do menu antigo foram restaurados.');
    }
  }).catch(() => {
    // Ignora erro se menuConfig não existir mais
  });
}
