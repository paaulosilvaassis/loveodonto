import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Area, 
  AreaChart, 
  CartesianGrid, 
  Legend, 
  ResponsiveContainer, 
  Tooltip, 
  XAxis, 
  YAxis 
} from 'recharts';
import { 
  Users, 
  Calendar, 
  FileText, 
  DollarSign, 
  Bell,
  User,
  Clock,
  TrendingUp,
  UserCheck,
  Receipt,
  BarChart3,
  Activity
} from 'lucide-react';
import { loadDbAsync } from '../db/index.js';
import { useClinicSummary } from '../hooks/useClinicSummary.js';
import { getTicketsByUser } from '../services/supportTicketService.js';
import SupportIcon from '../components/support/SupportIcon.jsx';

export default function DashboardPage() {
  const navigate = useNavigate();
  const clinic = useClinicSummary();
  const kpiGridRef = useRef(null);
  const [db, setDb] = useState(null);
  const [ticketRefresh, setTicketRefresh] = useState(0);

  // Limpa preferências de assistente de voz removidas do sistema
  useEffect(() => {
    try {
      localStorage.removeItem('appgestaoodonto.homeVoiceAssistant.enabled');
      localStorage.removeItem('appgestaoodonto.voiceWelcomeEnabled');
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      loadDbAsync().then((data) => {
        if (!cancelled) setDb(data);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, []);

  const session = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('appgestaoodonto.session') || 'null');
    } catch {
      return null;
    }
  }, []);

  const metrics = useMemo(() => {
    if (!db) {
      return {
        atendimentosHoje: 0,
        faturamentoHoje: 0,
        faturamentoMes: 0,
        pacientesEmEspera: 0,
        orcamentosPendentes: 0,
        pacientesEmTratamento: 0,
        consultasHoje: 0,
      };
    }
    const appointments = db.appointments;
    const transactions = db.transactions;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const atendimentosHoje = appointments.filter(
      (apt) => apt.date === today && apt.status === 'atendido'
    ).length;

    const faturamentoHoje = transactions
      .filter((txn) => txn.type === 'receber' && txn.dueDate === today)
      .reduce((sum, txn) => sum + txn.amount, 0);

    const faturamentoMes = transactions
      .filter((txn) => txn.type === 'receber' && txn.dueDate >= firstDayOfMonth && txn.dueDate <= lastDayOfMonth)
      .reduce((sum, txn) => sum + txn.amount, 0);

    const pacientesEmEspera = appointments.filter(
      (apt) => apt.date === today && ['agendado', 'confirmado'].includes(apt.status)
    ).length;

    const orcamentosPendentes = 0; // TODO: implementar quando schema estiver disponível

    const pacientesEmTratamento = appointments.filter(
      (apt) => apt.date > today && ['agendado', 'confirmado'].includes(apt.status)
    ).length;

    const consultasHoje = appointments.filter((apt) => apt.date === today).length;

    return {
      atendimentosHoje,
      faturamentoHoje,
      faturamentoMes,
      pacientesEmEspera,
      orcamentosPendentes,
      pacientesEmTratamento,
      consultasHoje,
    };
  }, [db]);

  const chartData = useMemo(() => {
    if (!db) return [];
    const appointments = db.appointments;
    const transactions = db.transactions;
    const days = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      const label = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

      const agendados = appointments.filter(
        (apt) => apt.date === dateStr && ['agendado', 'confirmado'].includes(apt.status)
      ).length;

      const atendidos = appointments.filter(
        (apt) => apt.date === dateStr && apt.status === 'atendido'
      ).length;

      const faturamento = transactions
        .filter((txn) => txn.type === 'receber' && txn.dueDate === dateStr)
        .reduce((sum, txn) => sum + txn.amount, 0);

      days.push({
        date: dateStr,
        label,
        agendados,
        atendidos,
        faturamento: Math.round(faturamento),
      });
    }

    return days;
  }, [db]);

  const currentUser = db ? (db.users.find((item) => item.id === session?.userId) || db.users[0]) : null;

  const hasOpenTickets = useMemo(() => {
    if (!session?.userId) return false;
    const tickets = getTicketsByUser(session.userId);
    return tickets.some((t) => t.status !== 'closed');
  }, [session?.userId, ticketRefresh]);

  if (!db) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: 'var(--text-secondary, #94a3b8)' }}>
        Carregando dashboard…
      </div>
    );
  }

  const appointments = db.appointments;
  const transactions = db.transactions;
  const patients = db.patients || [];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // 6 botões obrigatórios conforme requisito
  const quickActions = [
    {
      id: 'pacientes',
      title: 'Pacientes',
      icon: Users,
      route: '/pacientes/busca',
      gradient: 'linear-gradient(135deg, #6A00FF 0%, #2563EB 100%)',
    },
    {
      id: 'agenda',
      title: 'Agenda',
      icon: Calendar,
      route: '/gestao/agenda',
      gradient: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
    },
    {
      id: 'odontograma',
      title: 'Odontograma',
      icon: FileText,
      route: '/pacientes/busca',
      gradient: 'linear-gradient(135deg, #EC4899 0%, #6A00FF 100%)',
    },
    {
      id: 'orcamentos',
      title: 'Orçamentos',
      icon: Receipt,
      route: '/gestao/crm',
      gradient: 'linear-gradient(135deg, #F59E0B 0%, #EC4899 100%)',
    },
    {
      id: 'financeiro',
      title: 'Financeiro',
      icon: DollarSign,
      route: '/financeiro/contas-receber',
      gradient: 'linear-gradient(135deg, #10B981 0%, #2563EB 100%)',
    },
    {
      id: 'relatorios',
      title: 'Relatórios',
      icon: BarChart3,
      route: '/financeiro/relatorios',
      gradient: 'linear-gradient(135deg, #8B5CF6 0%, #6A00FF 100%)',
    },
  ];

  // KPIs principais conforme requisito
  const kpiCards = [
    {
      id: 'atendimentos',
      label: 'Atendimentos hoje',
      value: metrics.atendimentosHoje,
      icon: UserCheck,
      color: '#10B981',
    },
    {
      id: 'faturamento-dia',
      label: 'Faturamento do dia',
      value: `R$ ${metrics.faturamentoHoje.toFixed(2)}`,
      icon: TrendingUp,
      color: '#2563EB',
    },
    {
      id: 'faturamento-mes',
      label: 'Faturamento do mês',
      value: `R$ ${metrics.faturamentoMes.toFixed(2)}`,
      icon: Activity,
      color: '#6A00FF',
    },
    {
      id: 'orcamentos',
      label: 'Orçamentos pendentes',
      value: metrics.orcamentosPendentes,
      icon: Receipt,
      color: '#EC4899',
    },
    {
      id: 'tratamento',
      label: 'Pacientes em tratamento',
      value: metrics.pacientesEmTratamento,
      icon: Users,
      color: '#F59E0B',
    },
  ];

  return (
    <div className="app-dashboard">
      {/* Background blobs decorativos */}
      <div className="app-dashboard-blobs">
        <div className="app-dashboard-blob app-dashboard-blob-1"></div>
        <div className="app-dashboard-blob app-dashboard-blob-2"></div>
        <div className="app-dashboard-blob app-dashboard-blob-3"></div>
      </div>

      {/* Header */}
      <header className="app-dashboard-header">
        <div className="app-dashboard-header-main">
          <h1 className="app-dashboard-greeting">
            Olá, {currentUser?.name?.split(' ')[0] || 'Usuário'} 👋
          </h1>
          <p className="app-dashboard-clinic">
            {clinic?.nomeClinica || 'Clínica'}
          </p>
        </div>
        <div className="app-dashboard-header-actions">
          <button
            className="app-dashboard-icon-button"
            aria-label="Notificações"
            onClick={() => navigate('/comercial/mensagens')}
            title="Notificações"
          >
            <Bell size={18} strokeWidth={2} />
          </button>
          <button
            className="app-dashboard-icon-button support-header-button"
            aria-label="Abrir suporte"
            title="Suporte"
            onClick={() => navigate('/suporte')}
          >
            <SupportIcon size={18} variant="minimal" inverse />
            {hasOpenTickets && (
              <span className="support-header-badge" aria-hidden />
            )}
          </button>
          <button
            className="app-dashboard-icon-button"
            aria-label="Perfil"
            onClick={() => navigate('/admin/colaboradores')}
            title="Perfil"
          >
            <User size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Ações Rápidas - 6 botões */}
      <section className="app-dashboard-section">
        <h2 className="app-dashboard-section-title">Ações Rápidas</h2>
        <div className="app-dashboard-actions-grid">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                className="app-dashboard-action-button"
                onClick={() => navigate(action.route)}
                style={{ '--action-gradient': action.gradient }}
                aria-label={`Acessar ${action.title}`}
              >
                <div className="app-dashboard-action-icon">
                  <Icon size={24} />
                </div>
                <span className="app-dashboard-action-label">{action.title}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Indicadores Principais (KPI) */}
      <section className="app-dashboard-section">
        <h2 className="app-dashboard-section-title">Indicadores Principais</h2>
        <div className="app-dashboard-kpi-grid" ref={kpiGridRef}>
          {kpiCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.id} className="app-dashboard-kpi-card">
                <div className="app-dashboard-kpi-header">
                  <div className="app-dashboard-kpi-icon-wrapper">
                    <Icon size={24} />
                  </div>
                  <span className="app-dashboard-kpi-label">{card.label}</span>
                </div>
                <div className="app-dashboard-kpi-value">{card.value}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Gráficos */}
      <section className="app-dashboard-section">
        <h2 className="app-dashboard-section-title">Visão Geral (Últimos 7 dias)</h2>
        <div className="app-dashboard-chart-container">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-agendados" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6A00FF" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6A00FF" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="grad-atendidos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="grad-faturamento" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EC4899" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis 
                dataKey="label" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#6B7280', fontSize: 12 }} 
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#6B7280', fontSize: 12 }} 
              />
              <Tooltip
                contentStyle={{
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
                labelStyle={{ color: '#1F2937', fontWeight: 600 }}
                itemStyle={{ color: '#1F2937' }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '1rem' }}
                iconType="circle"
                formatter={(value) => {
                  const labels = {
                    agendados: 'Agendados',
                    atendidos: 'Atendidos',
                    faturamento: 'Faturamento (R$)',
                  };
                  return labels[value] || value;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="agendados" 
                stroke="#6A00FF" 
                strokeWidth={2}
                fill="url(#grad-agendados)" 
                name="agendados"
              />
              <Area 
                type="monotone" 
                dataKey="atendidos" 
                stroke="#2563EB" 
                strokeWidth={2}
                fill="url(#grad-atendidos)" 
                name="atendidos"
              />
              <Area 
                type="monotone" 
                dataKey="faturamento" 
                stroke="#EC4899" 
                strokeWidth={2}
                fill="url(#grad-faturamento)" 
                name="faturamento"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
