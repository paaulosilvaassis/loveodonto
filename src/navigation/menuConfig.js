import {
  BadgeDollarSign,
  BarChart3,
  BellRing,
  Bot,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarHeart,
  CalendarRange,
  ClipboardList,
  FileSignature,
  FileText,
  Handshake,
  Headset,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Send,
  Settings,
  Smartphone,
  Sparkles,
  Tag,
  TrendingUp,
  UserPlus,
  UserCog,
  Users,
  Wallet,
  Activity,
} from 'lucide-react';

export const menuSections = [
  {
    id: 'gestao',
    label: 'Processos de Gestão',
    items: [
      { id: 'dashboard', label: 'Dashboard', route: '/gestao/dashboard', icon: LayoutDashboard, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional', 'financeiro', 'comercial'], description: 'Visão geral da clínica em tempo real.' },
      { id: 'suporte', label: 'Suporte', route: '/suporte', icon: Headset, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional', 'financeiro', 'comercial'], description: 'Chamados e avaliação de atendimento.' },
      { id: 'cadastro-paciente', label: 'Cadastrar Paciente', route: '/pacientes/busca', icon: UserPlus, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'], description: 'Busca paciente e cria cadastro rápido.' },
      { id: 'cadastro-paciente-form', label: 'Pacientes > Cadastro', route: '/pacientes/cadastro', icon: ClipboardList, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'], description: 'Cadastro completo do paciente.' },
      { id: 'agenda', label: 'Agenda da Clínica', route: '/gestao/agenda', icon: Calendar, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'], description: 'Calendário e gestão de consultas.' },
      { id: 'gestao-atendimento', label: 'Gestão de Atendimento', route: '/gestao-atendimento', icon: LayoutDashboard, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'], description: 'Central de operação da clínica (agenda, fluxo e acompanhamento).' },
      { id: 'crm', label: 'CRM (Kanban)', route: '/gestao/crm', icon: KanbanSquare, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Pipeline comercial e funil de leads.' },
      { id: 'convenios', label: 'Convênios', route: '/gestao/convenios', icon: Handshake, rolesAllowed: ['admin', 'gerente', 'recepcao'], description: 'Gestão completa de convênios — guias TISS, glosas, faturamento e rentabilidade.' },
      { id: 'contratos', label: 'Contratos & Consentimentos', route: '/gestao/contratos', icon: FileSignature, rolesAllowed: ['admin', 'gerente', 'recepcao'], description: 'Contratos, termos, assinatura digital e histórico jurídico.' },
    ],
  },
  {
    id: 'admin',
    label: 'Administrativo',
    items: [
      { id: 'dados-clinica', label: 'Dados da Clínica', route: '/admin/dados-clinica', icon: Settings, rolesAllowed: ['admin', 'gerente'], description: 'Base central da clínica.' },
      { id: 'colaboradores', label: 'Dados da Equipe', route: '/admin/colaboradores', icon: Users, rolesAllowed: ['admin', 'gerente'], description: 'Cadastro e gestão de colaboradores.' },
      { id: 'usuarios', label: 'Usuários', route: '/admin/usuarios', icon: UserCog, rolesAllowed: ['admin', 'master'], description: 'Usuários e convites de ativação.' },
      { id: 'base-preco-admin', label: 'Base de Preços e Procedimentos', route: '/admin/base-precos', icon: BadgeDollarSign, rolesAllowed: ['admin', 'gerente'], description: 'Tabelas de preço e cadastro de procedimentos por tabela.' },
      { id: 'fornecedores', label: 'Fornecedores', route: '/admin/fornecedores', icon: Landmark, rolesAllowed: ['admin', 'gerente'], description: 'Cadastro mestre de fornecedores da clínica.' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Gestão Financeira',
    items: [
      { id: 'contas-pagar', label: 'Contas a Pagar', route: '/financeiro/contas-pagar', icon: Wallet, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Pagamentos e despesas.' },
      { id: 'contas-receber', label: 'Contas a Receber', route: '/financeiro/contas-receber', icon: Receipt, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Recebimentos e lançamentos.' },
      { id: 'caixa', label: 'Caixa', route: '/financeiro/caixa', icon: Landmark, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Fluxo diário e saldo.' },
      { id: 'boletos', label: 'Boletos', route: '/financeiro/boletos', icon: FileText, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Emissão e acompanhamento de boletos.' },
      { id: 'financiamento', label: 'Financiamentos', route: '/financeiro/financiamento', icon: BadgeDollarSign, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Financiamento próprio, análise, parcelas e inadimplência.' },
      { id: 'faturamento', label: 'Faturamento', route: '/financeiro/faturamento', icon: TrendingUp, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Produção contratada (vendas) versus recebimento no caixa.' },
      { id: 'comissoes', label: 'Comissões', route: '/financeiro/comissoes', icon: BarChart3, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Comissões por profissional.' },
      { id: 'dre-fin', label: 'Central de Análise', route: '/financeiro/relatorios/dre', icon: BarChart3, rolesAllowed: ['admin', 'gerente', 'financeiro'], description: 'Central de análise financeira (competência, caixa e liquidez). Relatórios CSV a partir desta tela.' },
    ],
  },
  {
    id: 'crm-clinico',
    label: 'CRM Clínico',
    items: [
      { id: 'crm-captacao', label: 'Captação de Leads', route: '/crm/captacao', icon: ClipboardList, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Fontes de lead e cadastro inicial.' },
      { id: 'crm-pipeline', label: 'Pipeline de Atendimento', route: '/crm/pipeline', icon: KanbanSquare, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Funil visual Kanban (drag & drop).' },
      { id: 'crm-leads', label: 'Leads (lista)', route: '/crm/leads', icon: ClipboardList, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Lista de leads.' },
      { id: 'crm-comunicacao', label: 'Comunicação (WhatsApp)', route: '/crm/comunicacao', icon: MessageCircle, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Mensagens e templates vinculados ao lead.' },
      { id: 'crm-followup', label: 'Follow-up', route: '/crm/followup', icon: Calendar, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Lembretes e tarefas de retorno.' },
      { id: 'crm-orcamentos', label: 'Orçamentos & Conversão', route: '/crm/orcamentos', icon: BadgeDollarSign, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Orçamentos vinculados e conversão.' },
      { id: 'crm-relatorios', label: 'Relatórios & Métricas', route: '/crm/relatorios', icon: BarChart3, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'KPIs e dashboard do CRM.' },
      { id: 'crm-automacoes', label: 'Automações', route: '/crm/automacoes', icon: Settings, rolesAllowed: ['admin', 'gerente'], description: 'Regras por gatilho/condição/ação.' },
      { id: 'crm-configuracoes', label: 'Configurações', route: '/crm/configuracoes', icon: Settings, rolesAllowed: ['admin', 'gerente'], description: 'Configurações gerais do CRM.' },
    ],
  },
  {
    id: 'comercial',
    label: 'Gestão Comercial',
    items: [
      { id: 'marketing-chat-inteligente', label: 'Chat Inteligente', route: '/marketing/chat-inteligente', icon: Bot, rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao', 'financeiro'], description: 'Hub de marketing conversacional (dashboard, caixa de entrada, campanhas, funis e relatorios).' },
      { id: 'chats', label: 'Histórico de Chats', route: '/comercial/chats', icon: MessageCircle, rolesAllowed: ['admin', 'gerente', 'comercial'], description: 'Histórico de atendimentos comerciais.' },
      { id: 'comercial-follow-up', label: 'Follow-up', route: '/comercial/follow-up', icon: Calendar, rolesAllowed: ['admin', 'gerente', 'recepcao', 'comercial'], description: 'Retornos, tarefas comerciais e integração com Agenda e CRM.' },
      { id: 'mensagens', label: 'Mensagens Automáticas', route: '/comercial/mensagens', icon: Sparkles, rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'], description: 'Templates e disparos automatizados.' },
      {
        id: 'confirmacao',
        label: 'Confirmação de Agendamento',
        route: '/comercial/confirmacao',
        icon: BellRing,
        rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'],
        children: [
          { id: 'lembrete', label: 'Lembrete', route: '/comercial/confirmacao/lembrete', rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'], icon: CalendarClock },
          { id: 'boas-vindas', label: 'Boas-vindas', route: '/comercial/confirmacao/boas-vindas', rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'], icon: CalendarHeart },
          { id: 'broadcast', label: 'Broadcast', route: '/comercial/confirmacao/broadcast', rolesAllowed: ['admin', 'gerente', 'comercial'], icon: Send },
          { id: 'pos-atendimento', label: 'Mensagens pós-atendimento', route: '/comercial/confirmacao/pos-atendimento', rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'], icon: CalendarCheck },
          { id: 'lembrete-confirmacao', label: 'Lembrete de confirmação', route: '/comercial/confirmacao/lembrete-confirmacao', rolesAllowed: ['admin', 'gerente', 'comercial', 'recepcao'], icon: CalendarRange },
          { id: 'semestral', label: 'Semestral', route: '/comercial/confirmacao/semestral', rolesAllowed: ['admin', 'gerente', 'comercial'], icon: CalendarDays },
          { id: 'anual', label: 'Anual', route: '/comercial/confirmacao/anual', rolesAllowed: ['admin', 'gerente', 'comercial'], icon: CalendarDays },
        ],
      },
      {
        id: 'whatsapp',
        label: 'WhatsApp (Integrações)',
        route: '/comercial/whatsapp',
        icon: Smartphone,
        rolesAllowed: ['admin', 'gerente', 'comercial'],
        children: [
          { id: 'whatsapp-agenda', label: 'WhatsApp integrado com Agenda', route: '/comercial/whatsapp/agenda', rolesAllowed: ['admin', 'gerente', 'comercial'], icon: Calendar },
          { id: 'whatsapp-crm', label: 'WhatsApp integrado com CRM', route: '/comercial/whatsapp/crm', rolesAllowed: ['admin', 'gerente', 'comercial'], icon: KanbanSquare },
          { id: 'whatsapp-ia', label: 'Atendimento 24/7 com IA', route: '/comercial/whatsapp/ia', rolesAllowed: ['admin', 'gerente', 'comercial'], icon: Bot },
        ],
      },
      { id: 'chats-ia', label: 'Atendimento humano/IA', route: '/comercial/atendimento', icon: Headset, rolesAllowed: ['admin', 'gerente', 'comercial'], description: 'Transbordo para humano e histórico de IA.' },
      { id: 'jornada-paciente', label: 'Jornada do Paciente', route: '/gestao-comercial/jornada-do-paciente', icon: Activity, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'], description: 'Gestão em tempo real da sala de espera e atendimentos.' },
      { id: 'fluxo-paciente', label: 'Fluxo do Paciente', route: '/gestao-comercial/fluxo-do-paciente', icon: CalendarCheck, rolesAllowed: ['admin', 'gerente', 'recepcao', 'profissional'], description: 'Gestão completa dos agendamentos do dia com dashboard e ações rápidas.' },
    ],
  },
];

export const flattenMenu = (sections) =>
  sections.flatMap((section) =>
    section.items.flatMap((item) => [
      { ...item, sectionId: section.id, sectionLabel: section.label },
      ...(item.children || []).map((child) => ({
        ...child,
        parentId: item.id,
        parentLabel: item.label,
        sectionId: section.id,
        sectionLabel: section.label,
      })),
    ])
  );

export const routeLabelMap = (sections = menuSections) => {
  const acc = flattenMenu(sections).reduce((memo, item) => {
    memo[item.route] = item.label;
    return memo;
  }, {});
  acc['/financeiro/relatorios'] = 'Relatórios Financeiros';
  return acc;
};

const FINANCE_REPORTS_ROLES = ['admin', 'gerente', 'financeiro'];

export const routeAccessMap = (sections = menuSections) => {
  const acc = flattenMenu(sections).reduce((memo, item) => {
    memo[item.route] = item.rolesAllowed || [];
    return memo;
  }, {});
  acc['/financeiro/relatorios'] = FINANCE_REPORTS_ROLES;
  return acc;
};
