import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
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
import { loadDbAsync, loadDb } from '../db/index.js';
import { useClinicSummary } from '../hooks/useClinicSummary.js';
import { getTicketsByUser } from '../services/supportTicketService.js';
import { getNomeUsuario } from '../services/userProfileService.js';
import { can as canByPermission } from '../permissions/permissions.js';
import {
  getDashboardMetrics,
  getDashboardChartData,
} from '../services/dashboardMetricsService.js';
import SupportIcon from '../components/support/SupportIcon.jsx';

function getSaudacaoAtual() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function DashboardChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload || {};
  const formatCurrency = (value) => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  return (
    <div
      style={{
        background: '#FFFFFF',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        padding: '0.75rem 1rem',
      }}
    >
      <p style={{ color: '#1F2937', fontWeight: 600, marginBottom: '0.5rem' }}>{label}</p>
      <p style={{ color: '#1F2937', margin: '0.15rem 0' }}>Agendados: {row.scheduled ?? 0}</p>
      <p style={{ color: '#1F2937', margin: '0.15rem 0' }}>Atendidos: {row.attended ?? 0}</p>
      <p style={{ color: '#1F2937', margin: '0.15rem 0' }}>Faturamento: {formatCurrency(row.revenue)}</p>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const clinic = useClinicSummary();
  const kpiGridRef = useRef(null);
  const [db, setDb] = useState(null);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [ticketRefresh, setTicketRefresh] = useState(0);
  const [nomeUsuario, setNomeUsuario] = useState('Usuário');

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

    const refreshDb = () => {
      if (cancelled) return;
      try {
        setDb(loadDb());
        setMetricsVersion((v) => v + 1);
      } catch {
        loadDbAsync().then((data) => {
          if (!cancelled) setDb(data);
        });
      }
    };

    loadDbAsync().then((data) => {
      if (!cancelled) setDb(data);
    });

    window.addEventListener('db:updated', refreshDb);
    window.addEventListener('focus', refreshDb);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshDb();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('db:updated', refreshDb);
      window.removeEventListener('focus', refreshDb);
      document.removeEventListener('visibilitychange', onVisibility);
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
        todayAppointments: { total: 0, scheduled: 0, inProgress: 0, finished: 0, noShows: 0 },
      };
    }
    return getDashboardMetrics();
  }, [db, metricsVersion]);

  const chartData = useMemo(() => {
    if (!db) return [];
    return getDashboardChartData(7);
  }, [db, metricsVersion]);

  const hasChartData = useMemo(
    () => chartData.some((row) => row.scheduled > 0 || row.attended > 0 || row.revenue > 0),
    [chartData],
  );

  const useRevenueAxis = useMemo(() => {
    const maxQty = Math.max(
      0,
      ...chartData.flatMap((row) => [row.scheduled, row.attended]),
    );
    const maxRevenue = Math.max(0, ...chartData.map((row) => row.revenue));
    return maxRevenue > 0 && maxRevenue > maxQty;
  }, [chartData]);

  const currentUser = db ? (db.users.find((item) => item.id === session?.userId) || db.users[0]) : null;

  useEffect(() => {
    let cancelled = false;
    const fallbackName = user?.name || currentUser?.name || '';

    const loadNomeUsuario = async () => {
      try {
        const nome = await getNomeUsuario({
          userId: user?.id || session?.userId,
          email: user?.email || currentUser?.email,
          fallbackName,
        });
        if (!cancelled) {
          setNomeUsuario(nome);
        }
      } catch {
        if (!cancelled) {
          const safeFallback = fallbackName && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallbackName)
            ? fallbackName
            : 'Usuário';
          setNomeUsuario(safeFallback);
        }
      }
    };

    loadNomeUsuario();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.name, user?.email, currentUser?.name, currentUser?.email, session?.userId]);

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

  const quickActionPermissionMap = {
    pacientes: 'patients:view',
    agenda: 'agenda:view',
    odontograma: 'prontuario_atendimento:view',
    orcamentos: 'pipeline_crm:view',
    financeiro: 'financeiro_relatorios:view',
    relatorios: 'relatorios:view',
  };
  const visibleQuickActions = quickActions.filter((action) => {
    const permission = quickActionPermissionMap[action.id];
    if (!permission) return true;
    return canByPermission(currentUser, permission);
  });

  const formatCurrency = (value) => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

  // KPIs principais conforme requisito
  const kpiCards = [
    {
      id: 'atendimentos',
      label: 'Atendimentos hoje',
      value: metrics.atendimentosHoje,
      hint: metrics.todayAppointments
        ? `${metrics.todayAppointments.scheduled} agendados · ${metrics.todayAppointments.inProgress} em atendimento · ${metrics.todayAppointments.finished} finalizados`
        : null,
      icon: UserCheck,
      color: '#10B981',
    },
    {
      id: 'faturamento-dia',
      label: 'Faturamento do dia',
      value: formatCurrency(metrics.faturamentoHoje),
      icon: TrendingUp,
      color: '#2563EB',
    },
    {
      id: 'faturamento-mes',
      label: 'Faturamento do mês',
      value: formatCurrency(metrics.faturamentoMes),
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
            {getSaudacaoAtual()}, {nomeUsuario} 👋
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
          {visibleQuickActions.map((action) => {
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
                {card.hint ? (
                  <p className="app-dashboard-kpi-hint">{card.hint}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Gráficos */}
      <section className="app-dashboard-section">
        <h2 className="app-dashboard-section-title">Visão Geral (Últimos 7 dias)</h2>
        <div className="app-dashboard-chart-container">
          {!hasChartData ? (
            <p className="app-dashboard-chart-empty" role="status">
              Nenhum dado registrado no período.
            </p>
          ) : null}
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ top: 10, right: useRevenueAxis ? 20 : 10, left: -10, bottom: 0 }}>
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
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 12 }}
                allowDecimals={false}
              />
              {useRevenueAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#EC4899', fontSize: 12 }}
                  tickFormatter={(value) => formatCurrency(value)}
                />
              ) : null}
              <Tooltip content={<DashboardChartTooltip />} />
              <Legend
                wrapperStyle={{ paddingTop: '1rem' }}
                iconType="circle"
                formatter={(value) => {
                  const labels = {
                    scheduled: 'Agendados',
                    attended: 'Atendidos',
                    revenue: 'Faturamento (R$)',
                  };
                  return labels[value] || value;
                }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="scheduled"
                stroke="#6A00FF"
                strokeWidth={2}
                fill="url(#grad-agendados)"
                name="scheduled"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="attended"
                stroke="#2563EB"
                strokeWidth={2}
                fill="url(#grad-atendidos)"
                name="attended"
              />
              <Area
                yAxisId={useRevenueAxis ? 'right' : 'left'}
                type="monotone"
                dataKey="revenue"
                stroke="#EC4899"
                strokeWidth={2}
                fill="url(#grad-faturamento)"
                name="revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
