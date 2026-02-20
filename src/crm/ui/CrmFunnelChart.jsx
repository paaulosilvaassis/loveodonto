import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Cell,
  CartesianGrid,
} from 'recharts';
import { AlertTriangle, Inbox } from 'lucide-react';
import { buildFunnelMetrics } from '../../utils/funnelChartUtils.js';

const ROW_HEIGHT = 54;
const SOFT_COLORS = [
  '#6366f1', '#818cf8', '#64748b', '#0ea5e9', '#8b5cf6',
  '#ec4899', '#f43f5e', '#f97316', '#84cc16', '#06b6d4',
];

/**
 * Funil comercial: Bar Chart horizontal compacto e executivo.
 * Ordem fixa: Novo Lead → ... → Perdido.
 */
export function CrmFunnelChart({
  funnelSteps,
  maiorQuedaIndex,
  maiorQuedaStage,
  onStageClick,
  isLoading,
}) {
  const chartData = buildFunnelMetrics(
    (funnelSteps || []).map((s) => ({
      stageKey: s.stageKey,
      label: s.label,
      totalEtapa: s.totalEtapa,
      color: s.color,
    }))
  ).map((d, i) => ({
    ...d,
    fill: d.color || SOFT_COLORS[i % SOFT_COLORS.length],
  }));

  const hasData = chartData.length > 0 && chartData.some((d) => d.total > 0);
  const chartHeight = Math.max(420, chartData.length * ROW_HEIGHT);

  const fromLabel =
    maiorQuedaIndex > 0 ? funnelSteps?.[maiorQuedaIndex - 1]?.label : null;
  const toLabel = maiorQuedaStage?.stageLabel ?? maiorQuedaStage?.label ?? null;

  if (isLoading) {
    return <CrmFunnelSkeleton />;
  }

  if (!hasData) {
    return <CrmFunnelEmptyState />;
  }

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]?.payload) return null;
    const p = payload[0].payload;
    return (
      <div className="crm-funnel-tooltip-dark">
        <div className="crm-funnel-tooltip-dark-title">{p.stageLabel}</div>
        <div className="crm-funnel-tooltip-dark-row">
          <span>Total</span>
          <strong>{p.total}</strong>
        </div>
        <div className="crm-funnel-tooltip-dark-row">
          <span>Conversão vs anterior</span>
          <strong>{p.convVsPrev}%</strong>
        </div>
        <div className="crm-funnel-tooltip-dark-row">
          <span>Acumulado</span>
          <strong>{p.acumulado}%</strong>
        </div>
        <div className="crm-funnel-tooltip-dark-hint">Clique para ver leads</div>
      </div>
    );
  };

  const ConvLabel = (props) => {
    const { x, y, width, height, payload } = props;
    if (!payload) return null;
    const conv = payload.convVsPrev ?? 0;
    const isFirst = conv >= 99.9;
    const isBigDrop = conv > 0 && conv < 40;
    const symbol = isFirst ? '→' : isBigDrop ? '⚠' : '↘';
    return (
      <text
        x={(x || 0) + (width || 0) + 6}
        y={(y || 0) + (height || 0) / 2}
        dy={4}
        fill={isBigDrop ? '#dc2626' : 'var(--color-text-muted)'}
        fontSize={11}
        fontWeight={isBigDrop ? 600 : 500}
        textAnchor="start"
      >
        {conv}% {symbol}
      </text>
    );
  };

  return (
    <div className="crm-funnel-compact">
      <div className="crm-funnel-compact-header">
        {fromLabel && toLabel && maiorQuedaIndex > 0 && (
          <span className="crm-funnel-alert-badge" role="status">
            <AlertTriangle size={10} />
            Maior perda: {fromLabel} → {toLabel}
          </span>
        )}
      </div>

      <div className="crm-funnel-chart-inner">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 10, right: 40, left: 16, bottom: 10 }}
            barCategoryGap={14}
          >
            <CartesianGrid strokeDasharray="3 3" vertical horizontal={false} strokeOpacity={0.15} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="stageLabel"
              width={180}
              tick={{ fontSize: 13, textAnchor: 'end' }}
              axisLine={false}
              tickLine={false}
              dx={-8}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Bar
              dataKey="total"
              radius={[0, 6, 6, 0]}
              barSize={26}
              cursor="pointer"
              onClick={(data) => {
                const key = data?.payload?.stageKey ?? data?.stageKey;
                key && onStageClick?.(key);
              }}
              isAnimationActive
              animationBegin={150}
              animationDuration={500}
              animationEasing="ease-out"
            >
              <LabelList
                dataKey="total"
                position="insideLeft"
                offset={8}
                fill="#fff"
                className="crm-funnel-bar-label-inner"
                formatter={(value) => (value > 0 ? value : '')}
              />
              <LabelList content={<ConvLabel />} position="right" />
              {chartData.map((entry, i) => (
                <Cell
                  key={entry.stageKey}
                  fill={entry.fill}
                  stroke="transparent"
                  className="crm-funnel-bar-cell"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CrmFunnelSkeleton() {
  return (
    <div className="crm-funnel-skeleton">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div
          key={i}
          className="crm-funnel-skeleton-bar"
          style={{
            width: `${100 - (i - 1) * 8}%`,
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}

function CrmFunnelEmptyState() {
  return (
    <div className="crm-funnel-empty">
      <Inbox size={48} className="crm-funnel-empty-icon" aria-hidden />
      <p className="crm-funnel-empty-title">Sem leads no período selecionado</p>
      <p className="crm-funnel-empty-desc">
        Ajuste o filtro de período ou canal para visualizar o funil.
      </p>
    </div>
  );
}
